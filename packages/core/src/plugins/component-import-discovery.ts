import path from 'node:path';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { cachedParseSync } from '../cache/module-parse-cache.ts';
import {
	loadTsconfigPathPrefixes,
	matchesTsconfigPathPrefix,
	resolveProjectModulePath,
} from './tsconfig-import-resolver.ts';

type Node = { type?: string; start?: number; end?: number; [key: string]: unknown };

function node(value: unknown): Node | undefined {
	return typeof value === 'object' && value !== null ? (value as Node) : undefined;
}

function nodes(value: unknown): Node[] {
	return Array.isArray(value) ? value.map(node).filter((value): value is Node => value !== undefined) : [];
}

function identifierName(value: unknown): string | undefined {
	const named = node(value);
	if (typeof named?.name === 'string') return named.name;
	if (typeof named?.value === 'string') return named.value;
	return undefined;
}

function isFactory(value: unknown): boolean {
	const call = node(value);
	const callee = node(call?.callee);
	return (
		call?.type === 'CallExpression' &&
		callee?.type === 'MemberExpression' &&
		node(callee.object)?.name === 'eco' &&
		['component', 'layout', 'html'].includes(String(node(callee.property)?.name))
	);
}

function isServerSpecifier(source: string): boolean {
	return /\.server(?:\.[cm]?[jt]sx?)?$/.test(source);
}

type ModuleExportIndex = {
	factories: Set<string>;
	namedReexports: Map<string, { source: string; imported: string }>;
};

function collectDeclaredFactoryBindings(body: Node[]): { declared: Set<string>; factories: Set<string> } {
	const declared = new Set<string>();
	const factories = new Set<string>();

	for (const statement of body) {
		const declaration = statement.type === 'ExportNamedDeclaration' ? node(statement.declaration) : statement;
		for (const variable of nodes(declaration?.declarations)) {
			const name = identifierName(variable.id);
			if (typeof name === 'string' && isFactory(variable.init)) {
				declared.add(name);
				if (statement.type === 'ExportNamedDeclaration') factories.add(name);
			}
		}
		if (statement.type === 'ExportDefaultDeclaration' && isFactory(statement.declaration)) factories.add('default');
	}

	return { declared, factories };
}

function indexReexportFromSource(
	from: string,
	specifiers: Node[],
	namedReexports: Map<string, { source: string; imported: string }>,
): void {
	for (const specifier of specifiers) {
		if (specifier.exportKind === 'type') continue;
		const exported = identifierName(specifier.exported);
		const imported = identifierName(specifier.local) ?? exported;
		if (exported && imported) namedReexports.set(exported, { source: from, imported });
	}
}

function indexLocalNamedExportSpecifiers(specifiers: Node[], declared: Set<string>, factories: Set<string>): void {
	for (const specifier of specifiers) {
		if (specifier.exportKind !== 'type' && declared.has(String(identifierName(specifier.local)))) {
			const exported = identifierName(specifier.exported);
			if (exported) factories.add(exported);
		}
	}
}

function indexNamedExportStatement(
	statement: Node,
	declared: Set<string>,
	factories: Set<string>,
	namedReexports: Map<string, { source: string; imported: string }>,
): void {
	if (statement.type === 'ExportDefaultDeclaration' && declared.has(String(identifierName(statement.declaration)))) {
		factories.add('default');
	}
	if (statement.type !== 'ExportNamedDeclaration' || statement.exportKind === 'type') {
		return;
	}
	const from = node(statement.source)?.value;
	const specifiers = nodes(statement.specifiers);
	if (typeof from === 'string') {
		indexReexportFromSource(from, specifiers, namedReexports);
		return;
	}
	indexLocalNamedExportSpecifiers(specifiers, declared, factories);
}

/**
 * Indexes local `eco.*()` factory exports and named `export { X } from` re-exports.
 *
 * @remarks
 * `export *` is ignored so a barrel cannot pull an entire kit into the graph.
 */
function indexModuleExports(file: string, cache: Map<string, ModuleExportIndex>): ModuleExportIndex {
	const cached = cache.get(file);
	if (cached) return cached;

	const source = readFileSync(file, 'utf8');
	const parsed = cachedParseSync(file, source, { sourceType: 'module' });
	const body = nodes(parsed.program.body);
	const { declared, factories } = collectDeclaredFactoryBindings(body);
	const namedReexports = new Map<string, { source: string; imported: string }>();

	for (const statement of body) {
		indexNamedExportStatement(statement, declared, factories, namedReexports);
	}

	const indexed = { factories, namedReexports };
	cache.set(file, indexed);
	return indexed;
}

type FactoryExportState = {
	moduleIndex: Map<string, ModuleExportIndex>;
	resolved: Map<string, boolean>;
	path: Set<string>;
	watchFiles: Set<string>;
};

/**
 * True when `exportName` is an `eco.*()` factory, including through named barrel re-exports.
 *
 * @remarks
 * Completed answers are memoized on `resolved`. `path` is only the current walk, so a
 * second alias of the same Component is not treated as a cycle miss.
 */
function isFactoryExport(
	file: string,
	exportName: string,
	projectRoot: string,
	pathPrefixes: string[],
	state: FactoryExportState,
): boolean {
	const visitKey = `${file}\0${exportName}`;
	const known = state.resolved.get(visitKey);
	if (known !== undefined) return known;
	if (state.path.has(visitKey)) return false;
	state.path.add(visitKey);

	let result = false;
	if (!file.includes(`${path.sep}node_modules${path.sep}`) && !isServerSpecifier(file)) {
		const { factories, namedReexports } = indexModuleExports(file, state.moduleIndex);
		if (factories.has(exportName)) {
			result = true;
		} else {
			const reexport = namedReexports.get(exportName);
			if (
				reexport &&
				!isServerSpecifier(reexport.source) &&
				(reexport.source.startsWith('.') || matchesTsconfigPathPrefix(reexport.source, pathPrefixes))
			) {
				const resolved = resolveProjectModulePath(projectRoot, file, reexport.source, { preserveBarrel: true });
				if (!resolved) {
					throw new Error(`[ecopages] Cannot resolve import ${JSON.stringify(reexport.source)} from ${file}`);
				}
				if (/\.[jt]sx?$/.test(resolved) && !resolved.includes(`${path.sep}node_modules${path.sep}`)) {
					result = isFactoryExport(resolved, reexport.imported, projectRoot, pathPrefixes, state);
					if (result) state.watchFiles.add(file);
				}
			}
		}
	}

	state.path.delete(visitKey);
	state.resolved.set(visitKey, result);
	return result;
}

export type DiscoveredImports = {
	components: string[];
	stylesheets: string[];
	watchFiles: string[];
	removals: Array<{ start: number; end: number; replacement: string }>;
};

function isCssImport(source: string): boolean {
	return source.endsWith('.css') && !source.endsWith('.module.css');
}

function resolveStylesheetImportPath(
	source: string,
	ownerFile: string,
	projectRoot: string,
	pathPrefixes: string[],
): string | undefined {
	const isRelative = source.startsWith('.');
	const isAlias = matchesTsconfigPathPrefix(source, pathPrefixes);
	if (!isRelative && !isAlias) {
		return undefined;
	}
	if (isRelative) {
		const candidate = path.resolve(path.dirname(ownerFile), source);
		return existsSync(candidate) ? realpathSync(candidate) : undefined;
	}
	return resolveProjectModulePath(projectRoot, ownerFile, source, { preserveBarrel: true });
}

function tryRecordSideEffectStylesheetImport(
	statement: Node,
	source: string,
	ownerFile: string,
	projectRoot: string,
	pathPrefixes: string[],
	result: DiscoveredImports,
): boolean {
	const specifiers = nodes(statement.specifiers);
	if (!isCssImport(source) || specifiers.length > 0) {
		return false;
	}
	const resolved = resolveStylesheetImportPath(source, ownerFile, projectRoot, pathPrefixes);
	if (!resolved) {
		if (source.startsWith('.') || matchesTsconfigPathPrefix(source, pathPrefixes)) {
			throw new Error(`[ecopages] Cannot resolve stylesheet import ${JSON.stringify(source)} from ${ownerFile}`);
		}
		return false;
	}
	if (!existsSync(resolved)) {
		throw new Error(`[ecopages] Cannot resolve stylesheet import ${JSON.stringify(source)} from ${ownerFile}`);
	}
	result.stylesheets.push(resolved);
	result.removals.push({ start: statement.start!, end: statement.end!, replacement: '' });
	return true;
}

function collectFactoryComponentsFromImport(
	statement: Node,
	source: string,
	ownerFile: string,
	projectRoot: string,
	pathPrefixes: string[],
	factoryState: FactoryExportState,
	result: DiscoveredImports,
): void {
	const specifiers = nodes(statement.specifiers);
	const values = specifiers.filter(
		(entry) =>
			entry.importKind !== 'type' &&
			(entry.type === 'ImportSpecifier' || entry.type === 'ImportDefaultSpecifier'),
	);
	if (!values.length || (!source.startsWith('.') && !matchesTsconfigPathPrefix(source, pathPrefixes))) {
		return;
	}
	if (isServerSpecifier(source)) {
		return;
	}
	const resolved = resolveProjectModulePath(projectRoot, ownerFile, source, { preserveBarrel: true });
	if (!resolved) throw new Error(`[ecopages] Cannot resolve import ${JSON.stringify(source)} from ${ownerFile}`);
	if (!/\.[jt]sx?$/.test(resolved) || resolved.includes(`${path.sep}node_modules${path.sep}`)) {
		return;
	}
	for (const specifier of values) {
		const imported = specifier.type === 'ImportDefaultSpecifier' ? 'default' : identifierName(specifier.imported);
		const local = identifierName(specifier.local);
		if (
			typeof local === 'string' &&
			imported &&
			isFactoryExport(resolved, imported, projectRoot, pathPrefixes, {
				...factoryState,
				path: new Set(),
			})
		) {
			result.components.push(local);
		}
	}
}

/**
 * Discovers local Eco Component imports and relative or aliased side-effect CSS.
 *
 * @remarks
 * Named `export { X } from` barrels are followed for the imported binding only.
 * Successful re-export hops are recorded in `watchFiles` so barrel edits invalidate caches.
 * `export *`, dynamic imports, namespace imports, packages, and `.server` modules are not.
 */
export function discoverComponentImports(program: unknown, ownerFile: string, projectRoot: string): DiscoveredImports {
	const result: DiscoveredImports = { components: [], stylesheets: [], watchFiles: [], removals: [] };
	const pathPrefixes = loadTsconfigPathPrefixes(projectRoot);
	const factoryState: FactoryExportState = {
		moduleIndex: new Map<string, ModuleExportIndex>(),
		resolved: new Map<string, boolean>(),
		watchFiles: new Set<string>(),
		path: new Set(),
	};
	for (const statement of nodes(node(program)?.body)) {
		if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') continue;
		if (nodes(statement.attributes).length || nodes(statement.assertions).length) continue;
		const source = node(statement.source)?.value;
		if (typeof source !== 'string') continue;
		if (tryRecordSideEffectStylesheetImport(statement, source, ownerFile, projectRoot, pathPrefixes, result)) {
			continue;
		}
		collectFactoryComponentsFromImport(
			statement,
			source,
			ownerFile,
			projectRoot,
			pathPrefixes,
			factoryState,
			result,
		);
	}
	result.watchFiles.push(...factoryState.watchFiles);
	return result;
}
