import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { parseModuleSource } from '../cache/module-parse-cache.ts';
import { contentHash } from '../utils/content-hash.ts';
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

function walk(value: unknown, visit: (node: Node) => void): void {
	if (Array.isArray(value)) {
		for (const child of value) walk(child, visit);
		return;
	}
	const current = node(value);
	if (!current) return;
	visit(current);
	for (const child of Object.values(current)) walk(child, visit);
}

function isFactoryCallee(callee: Node | undefined, names: readonly string[]): boolean {
	return (
		(callee?.type === 'MemberExpression' || callee?.type === 'StaticMemberExpression') &&
		node(callee.object)?.type === 'Identifier' &&
		node(callee.object)?.name === 'eco' &&
		names.includes(String(node(callee.property)?.name))
	);
}

function isFactory(value: unknown): boolean {
	const call = node(value);
	return call?.type === 'CallExpression' && isFactoryCallee(node(call.callee), ['component', 'layout', 'html']);
}

/**
 * Whether `program` calls `eco.page`, `eco.component`, `eco.layout` or `eco.html` anywhere.
 */
export function declaresEcoFactory(program: unknown): boolean {
	let found = false;
	walk(program, (current) => {
		if (
			current.type === 'CallExpression' &&
			isFactoryCallee(node(current.callee), ['page', 'component', 'layout', 'html'])
		) {
			found = true;
		}
	});
	return found;
}

function isServerSpecifier(source: string): boolean {
	return /\.server(?:\.[cm]?[jt]sx?)?$/.test(source);
}

function isLocalSpecifier(source: string, pathPrefixes: string[]): boolean {
	return source.startsWith('.') || matchesTsconfigPathPrefix(source, pathPrefixes);
}

function isLocalScript(file: string): boolean {
	return /\.[cm]?[jt]sx?$/.test(file) && !file.includes(`${path.sep}node_modules${path.sep}`);
}

export function isCssImport(source: string): boolean {
	return source.endsWith('.css') && !source.endsWith('.module.css');
}

/** One static `import` declaration with its value bindings. */
export type StaticImport = {
	source: string;
	start: number;
	end: number;
	/** Named and default value bindings; type-only specifiers are dropped. */
	bindings: Array<{ imported: string; local: string }>;
	/** True for `import './module'`, which binds nothing. */
	sideEffectOnly: boolean;
	/** True when the import carries attributes such as `with { type: 'text' }`. */
	attributed: boolean;
};

/**
 * Lists the static value imports of a module body in source order.
 */
export function collectStaticImports(program: unknown): StaticImport[] {
	const imports: StaticImport[] = [];
	for (const statement of nodes(node(program)?.body)) {
		if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') continue;
		const source = node(statement.source)?.value;
		if (typeof source !== 'string') continue;
		const specifiers = nodes(statement.specifiers);
		const bindings: StaticImport['bindings'] = [];
		for (const specifier of specifiers) {
			const local = identifierName(specifier.local);
			if (!local || specifier.importKind === 'type') continue;
			if (specifier.type === 'ImportDefaultSpecifier') bindings.push({ imported: 'default', local });
			if (specifier.type === 'ImportSpecifier') {
				bindings.push({ imported: identifierName(specifier.imported) ?? local, local });
			}
		}
		imports.push({
			source,
			start: statement.start!,
			end: statement.end!,
			bindings,
			sideEffectOnly: specifiers.length === 0,
			attributed: nodes(statement.attributes).length > 0 || nodes(statement.assertions).length > 0,
		});
	}
	return imports;
}

/**
 * Names a module renders: JSX element names and called identifiers.
 *
 * @remarks
 * Lit and string templates render a component by calling it, so a call counts as a render.
 */
function collectRenderedNames(program: unknown): Set<string> {
	const names = new Set<string>();
	walk(program, (current) => {
		if (current.type === 'JSXOpeningElement' && node(current.name)?.type === 'JSXIdentifier') {
			names.add(String(node(current.name)?.name));
		}
		if (current.type === 'CallExpression' && node(current.callee)?.type === 'Identifier') {
			names.add(String(node(current.callee)?.name));
		}
	});
	return names;
}

type ModuleIndex = {
	hash: string;
	declaresEcoFactory: boolean;
	jsxImportSource?: string;
	renderedNames: Set<string>;
	factories: Set<string>;
	namedReexports: Map<string, { source: string; imported: string }>;
	imports: StaticImport[];
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

const moduleIndexes = new Map<string, ModuleIndex>();

/**
 * Indexes a module's `eco.*()` factory exports, named `export { X } from` re-exports and static imports.
 *
 * @remarks
 * The index lives for the process and is keyed by a hash of the file's contents, so each module is parsed
 * once and an edit refreshes it on the next read without watcher wiring. It keeps only derived data, not
 * the AST, which the bounded parse cache owns. `export *` is ignored so a barrel cannot
 * pull an entire kit into the graph.
 */
function indexModule(file: string): ModuleIndex {
	const source = fileSystem.readFileSync(file);
	const hash = contentHash(source, 16);
	const cached = moduleIndexes.get(file);
	if (cached?.hash === hash) return cached;

	const program = parseModuleSource(file, source, { sourceType: 'module' }).program;
	const body = nodes(node(program)?.body);
	const { declared, factories } = collectDeclaredFactoryBindings(body);
	const namedReexports = new Map<string, { source: string; imported: string }>();
	for (const statement of body) {
		indexNamedExportStatement(statement, declared, factories, namedReexports);
	}

	const indexed: ModuleIndex = {
		hash,
		declaresEcoFactory: source.includes('eco.') && declaresEcoFactory(program),
		jsxImportSource: jsxPragmaOf(source),
		renderedNames: collectRenderedNames(program),
		factories,
		namedReexports,
		imports: collectStaticImports(program),
	};
	moduleIndexes.set(file, indexed);
	return indexed;
}

/** The leading `@jsxImportSource` pragma of a module, ignoring mentions further down. */
function jsxPragmaOf(source: string): string | undefined {
	return /^\s*\/\*[\s\S]*?@jsxImportSource\s+(\S+)[\s\S]*?\*\//.exec(source)?.[1];
}

const reachedModules = new Map<string, Set<string>>();

function canonicalFile(file: string): string {
	return fileSystem.exists(file) ? fileSystem.realpath(file) : path.resolve(file);
}

function reachedIn(projectRoot: string): Set<string> {
	const key = path.resolve(projectRoot);
	let reached = reachedModules.get(key);
	if (!reached) {
		reached = new Set();
		reachedModules.set(key, reached);
	}
	return reached;
}

/**
 * Whether discovery from an Eco declaration of the app at `projectRoot` has walked into `file`.
 *
 * @remarks
 * A bundler transforms an importer before the modules it imports, so a plain module reached from a
 * declaration is recorded before its own transform asks. The record lasts for the process: a module that a
 * declaration stops importing keeps it until a restart.
 */
export function isReachedByDiscovery(projectRoot: string, file: string): boolean {
	return reachedIn(projectRoot).has(canonicalFile(file));
}

function relativeToRoot(projectRoot: string, file: string): string {
	const relative = path.relative(canonicalFile(projectRoot), canonicalFile(file));
	return relative.startsWith('..') || path.isAbsolute(relative) ? file : relative.split(path.sep).join('/');
}

/**
 * Throws for a CSS import that no Page can receive: a CSS Module or a package stylesheet.
 *
 * @remarks
 * An import that carries attributes, or one that binds a plain stylesheet (`import styles from './x.css'`), is the
 * module's own business and is left alone; a CSS Module fails however it is imported.
 */
export function assertDeliverableStylesheetImport(
	entry: StaticImport,
	importer: string,
	projectRoot: string,
	pathPrefixes: string[] = loadTsconfigPathPrefixes(projectRoot),
): void {
	if (entry.attributed || !entry.source.endsWith('.css')) return;
	const where = `[ecopages] ${relativeToRoot(projectRoot, importer)}: ${JSON.stringify(entry.source)}`;
	if (entry.source.endsWith('.module.css')) {
		throw new Error(`${where} is a CSS Module, which Ecopages cannot add to a Page. Import a plain stylesheet.`);
	}
	if (entry.sideEffectOnly && !isLocalSpecifier(entry.source, pathPrefixes)) {
		throw new Error(
			`${where} is a package stylesheet, which Ecopages cannot add to a Page. Copy it into the app and import the copy.`,
		);
	}
}

/**
 * Whether discovery delivers `entry`: a side-effect import of a local plain stylesheet without attributes.
 *
 * @remarks
 * The meta plugin strips exactly these imports from plain modules, so stripping and delivery cannot drift.
 */
export function isDeliveredStylesheetImport(entry: StaticImport, pathPrefixes: string[]): boolean {
	return (
		!entry.attributed &&
		entry.sideEffectOnly &&
		isCssImport(entry.source) &&
		isLocalSpecifier(entry.source, pathPrefixes)
	);
}

/**
 * Builds the error for a side-effect stylesheet import in a module no Eco declaration reaches.
 */
export function createUndeliverableStylesheetError(projectRoot: string, file: string, source: string): Error {
	const module = relativeToRoot(projectRoot, file);
	return new Error(
		`[ecopages] ${module}: ${JSON.stringify(source)} never reaches a Page, because no eco.page(), eco.layout(), eco.html() or eco.component() module imports ${module}. Import it from one of them, or list the stylesheet in eco.component({ dependencies }).`,
	);
}

/**
 * Component dependencies discovered from a source module.
 *
 * @remarks
 * Parsing currently uses the shared Build-layer module cache; #556 tracks moving the parser contract
 * into the plugin contracts layer.
 */
export type DiscoveredImports = {
	components: string[];
	/** Side-effect stylesheets the declaring module imports itself, in source order. */
	stylesheets: string[];
	/** Side-effect stylesheets of the plain local modules the declaring module imports. */
	plainModuleStylesheets: string[];
	/**
	 * Eco Components that plain local modules import, which the declaring module has no binding for.
	 *
	 * @remarks
	 * `file` is the module the plain module's import resolves to and `imported` the export it names.
	 */
	plainModuleComponents: Array<{ file: string; imported: string }>;
	watchFiles: string[];
	removals: Array<{ start: number; end: number; replacement: string }>;
};

/** The Integration that owns a file, as the cross-Integration check needs it. */
export type DiscoveryIntegration = { name: string; jsxImportSource?: string };

/**
 * Options for {@link discoverComponentImports}.
 */
export type DiscoveryOptions = {
	/**
	 * Returns the Integration that owns a file, or `undefined` when none does.
	 *
	 * @remarks
	 * Without it, discovery does not check plain components rendered across Integrations.
	 */
	integrationOf?: (file: string) => DiscoveryIntegration | undefined;
	/** Source of the declaring module, read for a `@jsxImportSource` pragma; defaults to the file on disk. */
	ownerSource?: string;
};

type DiscoveryState = {
	projectRoot: string;
	pathPrefixes: string[];
	integrationOf?: (file: string) => DiscoveryIntegration | undefined;
	ownerFile: string;
	ownerSource?: string;
	resolved: Map<string, boolean>;
	watchFiles: Set<string>;
	stylesheets: string[];
	components: Map<string, { file: string; imported: string }>;
	visitedPlainModules: Set<string>;
};

function resolveReexport(
	file: string,
	reexport: { source: string; imported: string } | undefined,
	state: DiscoveryState,
): { file: string; imported: string } | undefined {
	if (!reexport || isServerSpecifier(reexport.source) || !isLocalSpecifier(reexport.source, state.pathPrefixes)) {
		return undefined;
	}
	const resolved = resolveProjectModulePath(state.projectRoot, file, reexport.source, { preserveBarrel: true });
	if (!resolved) {
		throw new Error(`[ecopages] Cannot resolve import ${JSON.stringify(reexport.source)} from ${file}`);
	}
	return isLocalScript(resolved) ? { file: resolved, imported: reexport.imported } : undefined;
}

/**
 * True when `exportName` is an `eco.*()` factory, including through named barrel re-exports.
 *
 * @remarks
 * Completed answers are memoized on `resolved`. `pending` is only the current walk, so a
 * second alias of the same Component is not treated as a cycle miss.
 */
function isFactoryExport(
	file: string,
	exportName: string,
	state: DiscoveryState,
	pending = new Set<string>(),
): boolean {
	const visitKey = `${file}\0${exportName}`;
	const known = state.resolved.get(visitKey);
	if (known !== undefined) return known;
	if (pending.has(visitKey)) return false;
	pending.add(visitKey);

	let result = false;
	if (!file.includes(`${path.sep}node_modules${path.sep}`) && !isServerSpecifier(file)) {
		const { factories, namedReexports } = indexModule(file);
		if (factories.has(exportName)) {
			result = true;
			state.watchFiles.add(file);
		} else {
			const target = resolveReexport(file, namedReexports.get(exportName), state);
			if (target) {
				result = isFactoryExport(target.file, target.imported, state, pending);
				if (result) state.watchFiles.add(file);
			}
		}
	}

	pending.delete(visitKey);
	state.resolved.set(visitKey, result);
	return result;
}

/**
 * Follows named re-exports of `exportName` from `file` and lists every module on the way, ending with the
 * module that defines the binding.
 */
function plainBindingModules(file: string, exportName: string, state: DiscoveryState): string[] {
	const modules: string[] = [];
	const seen = new Set<string>();
	let current: { file: string; imported: string } | undefined = { file, imported: exportName };
	while (current && !seen.has(`${current.file}\0${current.imported}`)) {
		seen.add(`${current.file}\0${current.imported}`);
		modules.push(current.file);
		current = resolveReexport(current.file, indexModule(current.file).namedReexports.get(current.imported), state);
	}
	return modules;
}

function resolveStylesheetImportPath(source: string, ownerFile: string, state: DiscoveryState): string | undefined {
	if (source.startsWith('.')) {
		const candidate = path.resolve(path.dirname(ownerFile), source);
		return fileSystem.exists(candidate) ? fileSystem.realpath(candidate) : undefined;
	}
	return resolveProjectModulePath(state.projectRoot, ownerFile, source, { preserveBarrel: true });
}

/**
 * Resolves a local side-effect stylesheet import, or returns `undefined` for any other import.
 *
 * @remarks
 * Throws for a CSS Module, a package stylesheet, or a local stylesheet that does not exist.
 */
function resolveSideEffectStylesheet(entry: StaticImport, importer: string, state: DiscoveryState): string | undefined {
	assertDeliverableStylesheetImport(entry, importer, state.projectRoot, state.pathPrefixes);
	if (!isDeliveredStylesheetImport(entry, state.pathPrefixes)) return undefined;
	const resolved = resolveStylesheetImportPath(entry.source, importer, state);
	if (!resolved || !fileSystem.exists(resolved)) {
		throw new Error(`[ecopages] Cannot resolve stylesheet import ${JSON.stringify(entry.source)} from ${importer}`);
	}
	return resolved;
}

function jsxRuntimeOf(file: string, state: DiscoveryState): { integration: string; runtime?: string } | undefined {
	const integration = state.integrationOf?.(file);
	if (!integration) return undefined;
	const pragma =
		file === state.ownerFile && state.ownerSource !== undefined
			? jsxPragmaOf(state.ownerSource)
			: indexModule(file).jsxImportSource;
	return { integration: integration.name, runtime: pragma ?? integration.jsxImportSource };
}

/**
 * Throws when `importer` renders a plain component that another Integration owns.
 *
 * @remarks
 * Only a capitalized binding the importer renders counts, so helpers shared across Integrations pass. Two
 * Integrations that compile JSX with the same runtime, or one that leaves the runtime to the app's
 * tsconfig, render each other's plain components, so the check needs both runtimes known and different.
 * A `@jsxImportSource` pragma in either file wins over its Integration's runtime.
 */
function assertSameIntegration(
	importer: string,
	local: string,
	component: string,
	renderedNames: () => Set<string>,
	state: DiscoveryState,
): void {
	if (!state.integrationOf || !/^[A-Z]/.test(local)) return;
	const importerOwner = jsxRuntimeOf(importer, state);
	const componentOwner = jsxRuntimeOf(component, state);
	if (!importerOwner || !componentOwner || importerOwner.integration === componentOwner.integration) return;
	if (!importerOwner.runtime || !componentOwner.runtime || importerOwner.runtime === componentOwner.runtime) return;
	if (!renderedNames().has(local)) return;
	throw new Error(
		`[ecopages] ${relativeToRoot(state.projectRoot, importer)} renders ${local} from ${relativeToRoot(state.projectRoot, component)}, a plain ${componentOwner.integration} component, inside ${importerOwner.integration}. Plain components do not cross Integrations: wrap ${local} in eco.component() so ${componentOwner.integration} renders it as a Foreign Child.`,
	);
}

/**
 * Sorts the script imports of `importer` into Eco Component bindings and the plain local modules to walk.
 */
function collectModuleEdges(
	importer: string,
	imports: StaticImport[],
	renderedNames: () => Set<string>,
	state: DiscoveryState,
	onComponent: (binding: { imported: string; local: string }, file: string) => void,
): string[] {
	const plainModules: string[] = [];
	for (const entry of imports) {
		if (entry.attributed || entry.source.endsWith('.css')) continue;
		if (!isLocalSpecifier(entry.source, state.pathPrefixes) || isServerSpecifier(entry.source)) continue;
		if (!entry.sideEffectOnly && entry.bindings.length === 0) continue;
		const resolved = resolveProjectModulePath(state.projectRoot, importer, entry.source, { preserveBarrel: true });
		if (!resolved) {
			if (entry.sideEffectOnly) continue;
			throw new Error(`[ecopages] Cannot resolve import ${JSON.stringify(entry.source)} from ${importer}`);
		}
		if (!isLocalScript(resolved)) continue;
		if (entry.sideEffectOnly) {
			plainModules.push(resolved);
			continue;
		}
		for (const binding of entry.bindings) {
			if (isFactoryExport(resolved, binding.imported, state)) {
				onComponent(binding, resolved);
				continue;
			}
			const modules = plainBindingModules(resolved, binding.imported, state);
			assertSameIntegration(importer, binding.local, modules[modules.length - 1]!, renderedNames, state);
			plainModules.push(...modules);
		}
	}
	return plainModules;
}

/**
 * Collects the side-effect stylesheets of a plain local module and of the plain modules it imports.
 *
 * @remarks
 * A module's own stylesheets come before those of the modules it imports, the order collection gives a
 * declaration and the Components it renders. The walk stops at Eco modules, packages and `.server`
 * modules, and follows only static named, default and side-effect imports. An Eco Component it imports is
 * recorded on `state.components`.
 */
function walkPlainModule(file: string, state: DiscoveryState): void {
	if (state.visitedPlainModules.has(file)) return;
	state.visitedPlainModules.add(file);
	const index = indexModule(file);
	if (index.declaresEcoFactory) return;
	state.watchFiles.add(file);
	reachedIn(state.projectRoot).add(canonicalFile(file));

	for (const entry of index.imports) {
		const stylesheet = resolveSideEffectStylesheet(entry, file, state);
		if (stylesheet && !state.stylesheets.includes(stylesheet)) state.stylesheets.push(stylesheet);
	}
	const children = collectModuleEdges(
		file,
		index.imports,
		() => index.renderedNames,
		state,
		(binding, target) => {
			const key = `${target}\0${binding.imported}`;
			if (!state.components.has(key)) state.components.set(key, { file: target, imported: binding.imported });
		},
	);
	for (const child of children) walkPlainModule(child, state);
}

/**
 * Discovers local Eco Component imports and the side-effect CSS that reaches an Eco declaration.
 *
 * @remarks
 * Relative and aliased side-effect CSS of the declaring module is kept apart from the CSS of the plain
 * local modules it imports (see {@link walkPlainModule}), which collection places after the CSS of every
 * declaration that imports those modules. Eco Components a plain module imports become Components of the
 * declaration too, so their Dependencies reach the Page. Named `export { X } from`
 * barrels are followed for the imported binding only. Imported Eco modules, successful re-export hops and
 * every walked plain module are recorded in `watchFiles` so their edits invalidate caches.
 * `export *`, dynamic imports, namespace imports, packages, and `.server` modules are not followed.
 */
export function discoverComponentImports(
	program: unknown,
	ownerFile: string,
	projectRoot: string,
	options: DiscoveryOptions = {},
): DiscoveredImports {
	const result: DiscoveredImports = {
		components: [],
		stylesheets: [],
		plainModuleStylesheets: [],
		plainModuleComponents: [],
		watchFiles: [],
		removals: [],
	};
	const state: DiscoveryState = {
		projectRoot,
		pathPrefixes: loadTsconfigPathPrefixes(projectRoot),
		integrationOf: options.integrationOf,
		ownerFile,
		ownerSource: options.ownerSource,
		resolved: new Map(),
		watchFiles: new Set(),
		stylesheets: [],
		components: new Map(),
		visitedPlainModules: new Set([canonicalFile(ownerFile)]),
	};
	const imports = collectStaticImports(program);
	for (const entry of imports) {
		const stylesheet = resolveSideEffectStylesheet(entry, ownerFile, state);
		if (!stylesheet) continue;
		result.stylesheets.push(stylesheet);
		result.removals.push({ start: entry.start, end: entry.end, replacement: '' });
	}
	let renderedNames: Set<string> | undefined;
	const ownComponents = new Set<string>();
	const plainModules = collectModuleEdges(
		ownerFile,
		imports,
		() => (renderedNames ??= collectRenderedNames(program)),
		state,
		(binding, file) => {
			result.components.push(binding.local);
			ownComponents.add(`${file}\0${binding.imported}`);
			state.watchFiles.add(file);
		},
	);
	for (const file of plainModules) walkPlainModule(file, state);
	for (const [key, component] of state.components) {
		if (!ownComponents.has(key)) result.plainModuleComponents.push(component);
	}
	result.plainModuleStylesheets.push(...state.stylesheets.filter((file) => !result.stylesheets.includes(file)));
	result.watchFiles.push(...state.watchFiles);
	return result;
}
