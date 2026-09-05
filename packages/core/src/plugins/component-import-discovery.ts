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

/** Only direct factory exports qualify; re-exports and ordinary helpers stay ordinary imports. */
function declaredExports(file: string): Set<string> {
	const source = readFileSync(file, 'utf8');
	if (!source.includes('eco.')) return new Set();
	const parsed = cachedParseSync(file, source, { sourceType: 'module' });
	const body = nodes(parsed.program.body);
	const declared = new Set<string>();
	const exported = new Set<string>();
	for (const statement of body) {
		const declaration = statement.type === 'ExportNamedDeclaration' ? node(statement.declaration) : statement;
		for (const variable of nodes(declaration?.declarations)) {
			const name = node(variable.id)?.name;
			if (typeof name === 'string' && isFactory(variable.init)) {
				declared.add(name);
				if (statement.type === 'ExportNamedDeclaration') exported.add(name);
			}
		}
		if (statement.type === 'ExportDefaultDeclaration' && isFactory(statement.declaration)) exported.add('default');
	}
	for (const statement of body) {
		if (statement.type === 'ExportDefaultDeclaration' && declared.has(String(node(statement.declaration)?.name))) {
			exported.add('default');
		}
		if (statement.type !== 'ExportNamedDeclaration' || statement.source || statement.exportKind === 'type')
			continue;
		for (const specifier of nodes(statement.specifiers)) {
			if (specifier.exportKind !== 'type' && declared.has(String(node(specifier.local)?.name))) {
				exported.add(String(node(specifier.exported)?.name ?? node(specifier.exported)?.value));
			}
		}
	}
	return exported;
}

export type DiscoveredImports = {
	components: string[];
	stylesheets: string[];
	removals: Array<{ start: number; end: number; replacement: string }>;
};

function isCssImport(source: string): boolean {
	return source.endsWith('.css') && !source.endsWith('.module.css');
}

/** Uses the host resolver without evaluating imported modules or following barrel exports. */
export function discoverComponentImports(program: unknown, ownerFile: string, projectRoot: string): DiscoveredImports {
	const result: DiscoveredImports = { components: [], stylesheets: [], removals: [] };
	const pathPrefixes = loadTsconfigPathPrefixes(projectRoot);
	for (const statement of nodes(node(program)?.body)) {
		if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') continue;
		if (nodes(statement.attributes).length || nodes(statement.assertions).length) continue;
		const source = node(statement.source)?.value;
		if (typeof source !== 'string') continue;
		const specifiers = nodes(statement.specifiers);
		if (isCssImport(source) && !specifiers.length) {
			const isRelative = source.startsWith('.');
			const isAlias = matchesTsconfigPathPrefix(source, pathPrefixes);
			if (isRelative || isAlias) {
				const resolved = isRelative
					? existsSync(path.resolve(path.dirname(ownerFile), source))
						? realpathSync(path.resolve(path.dirname(ownerFile), source))
						: undefined
					: resolveProjectModulePath(projectRoot, ownerFile, source, { preserveBarrel: true });
				if (!resolved || !existsSync(resolved)) {
					throw new Error(
						`[ecopages] Cannot resolve stylesheet import ${JSON.stringify(source)} from ${ownerFile}`,
					);
				}
				result.stylesheets.push(resolved);
				result.removals.push({ start: statement.start!, end: statement.end!, replacement: '' });
				continue;
			}
		}
		const values = specifiers.filter(
			(entry) =>
				entry.importKind !== 'type' &&
				(entry.type === 'ImportSpecifier' || entry.type === 'ImportDefaultSpecifier'),
		);
		if (!values.length || (!source.startsWith('.') && !matchesTsconfigPathPrefix(source, pathPrefixes))) continue;
		if (/\.server(?:\.[cm]?[jt]sx?)?$/.test(source)) continue;
		const resolved = resolveProjectModulePath(projectRoot, ownerFile, source, { preserveBarrel: true });
		if (!resolved) throw new Error(`[ecopages] Cannot resolve import ${JSON.stringify(source)} from ${ownerFile}`);
		if (!/\.[jt]sx?$/.test(resolved) || resolved.includes('/node_modules/')) continue;
		const exports = declaredExports(resolved);
		for (const specifier of values) {
			const imported =
				specifier.type === 'ImportDefaultSpecifier'
					? 'default'
					: (node(specifier.imported)?.name ?? node(specifier.imported)?.value);
			const local = node(specifier.local)?.name;
			if (typeof local === 'string' && exports.has(String(imported))) result.components.push(local);
		}
	}
	return result;
}
