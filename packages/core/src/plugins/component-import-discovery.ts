import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import { parseModuleSource } from '../cache/module-parse-cache.ts';
import { CSS_MODULE_PROCESSOR_FIX, PLAIN_CSS_KINDS, type StylesheetKinds } from './stylesheet-kinds.ts';
import { contentHash } from '../utils/content-hash.ts';
import {
	isBarePackageImportSpecifier,
	loadTsconfigPathPrefixes,
	matchesTsconfigPathPrefix,
	resolvePackageStylesheetPath,
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
	return /\.[cm]?[jt]sx?$/.test(file) && !file.includes(`/node_modules/`);
}

/** Whether `source` names a plain stylesheet: one of `kinds`, but not a CSS Module. */
export function isCssImport(source: string, kinds: StylesheetKinds): boolean {
	return kinds.isStylesheet(source) && !kinds.isCssModule(source);
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

export type ModuleIndex = {
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
function indexModule(file: string, cache?: DiscoveryCache): ModuleIndex {
	const built = cache?.indexes.get(file);
	if (built) return built;
	const source = fileSystem.readFileSync(file);
	const hash = contentHash(source, 16);
	const cached = moduleIndexes.get(file);
	if (cached?.hash === hash) {
		cache?.indexes.set(file, cached);
		return cached;
	}

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
	cache?.indexes.set(file, indexed);
	return indexed;
}

/** The leading `@jsxImportSource` pragma of a module, ignoring mentions further down. */
function jsxPragmaOf(source: string): string | undefined {
	return /^\s*\/\*[\s\S]*?@jsxImportSource\s+(\S+)[\s\S]*?\*\//.exec(source)?.[1];
}

/** Per app root: each walked plain module and the declaration files whose discovery walked it. */
const reachOwners = new Map<string, { byModule: Map<string, Set<string>>; byOwner: Map<string, Set<string>> }>();

function canonicalFile(file: string): string {
	return fileSystem.exists(file) ? fileSystem.realpath(file) : path.resolve(file);
}

function reachIn(projectRoot: string) {
	const key = path.resolve(projectRoot);
	let reach = reachOwners.get(key);
	if (!reach) {
		reach = { byModule: new Map(), byOwner: new Map() };
		reachOwners.set(key, reach);
	}
	return reach;
}

/**
 * Drops what discovery from the declaration in `ownerFile` recorded as reached.
 *
 * @remarks
 * Each discovery of a declaration replaces its previous record, so a plain module stops counting as reached
 * once no declaration imports it. The development watcher calls this for a deleted file, and the meta
 * plugin for a module that no longer declares anything.
 */
export function forgetDiscoveryOwner(projectRoot: string, ownerFile: string): void {
	const reach = reachIn(projectRoot);
	const owner = canonicalFile(ownerFile);
	for (const module of reach.byOwner.get(owner) ?? []) {
		const owners = reach.byModule.get(module);
		owners?.delete(owner);
		if (owners?.size === 0) reach.byModule.delete(module);
	}
	reach.byOwner.delete(owner);
}

function recordDiscoveryOwner(projectRoot: string, ownerFile: string, modules: Iterable<string>): void {
	forgetDiscoveryOwner(projectRoot, ownerFile);
	const reach = reachIn(projectRoot);
	const owner = canonicalFile(ownerFile);
	const reached = new Set(modules);
	reach.byOwner.set(owner, reached);
	for (const module of reached) {
		const owners = reach.byModule.get(module) ?? new Set<string>();
		owners.add(owner);
		reach.byModule.set(module, owners);
	}
}

/**
 * Whether the latest discovery of some Eco declaration of the app at `projectRoot` walked into `file`.
 *
 * @remarks
 * A bundler transforms an importer before the modules it imports in most builds, and the meta plugin checks
 * again once its build is transformed, so a plain module reached from a declaration is recorded in time.
 */
export function isReachedByDiscovery(projectRoot: string, file: string): boolean {
	return reachIn(projectRoot).byModule.has(canonicalFile(file));
}

function relativeToRoot(projectRoot: string, file: string): string {
	const relative = path.relative(canonicalFile(projectRoot), canonicalFile(file));
	return relative.startsWith('..') || path.isAbsolute(relative) ? file : relative;
}

function createPackageProcessedStylesheetError(projectRoot: string, importer: string, source: string): Error {
	return new Error(
		`[ecopages] ${relativeToRoot(projectRoot, importer)}: ${JSON.stringify(source)} is a package stylesheet that is not CSS. Packages must ship built CSS, because Ecopages does not run a stylesheet Processor on a package file. Import the package's built .css file instead, or copy the source into the app.`,
	);
}

function createUnscopedCssModuleError(projectRoot: string, importer: string, source: string): Error {
	return new Error(
		`[ecopages] ${relativeToRoot(projectRoot, importer)}: ${JSON.stringify(source)} is a CSS Module. ${CSS_MODULE_PROCESSOR_FIX}`,
	);
}

/** The stylesheet an import delivers: a local plain one, still to resolve; a CSS Module, still to resolve; or a package one. */
type StylesheetImportTarget = { kind: 'local' } | { kind: 'css-module' } | { kind: 'package'; file: string };

/**
 * Classifies an import as delivering a local stylesheet, a CSS Module or a package stylesheet, or none of them.
 *
 * @remarks
 * The one rule behind both stripping and discovery, so the two cannot drift. A plain stylesheet is delivered by a
 * side-effect import alone, as the module has no binding to keep. A CSS Module is delivered by any import without
 * attributes, since the importer keeps its class map. A package specifier names a stylesheet as
 * {@link resolvePackageStylesheetPath} decides, and a CSS Module of a package is delivered by any import. Throws for a CSS Module,
 * local or from a package, when no Processor scopes them (naming the package to install), for a package stylesheet
 * named with `.css` that does not resolve,
 * and for a `.css` specifier that is neither relative, aliased nor a package, such as `#styles/x.css` or an absolute
 * path, which no Page could receive.
 */
function classifyStylesheetImport(
	entry: StaticImport,
	importer: string,
	projectRoot: string,
	pathPrefixes: string[],
	kinds: StylesheetKinds,
): StylesheetImportTarget | undefined {
	if (entry.attributed) return undefined;
	const isModule = kinds.isCssModule(entry.source);
	if (isLocalSpecifier(entry.source, pathPrefixes)) {
		if (isModule) {
			if (!kinds.scopesCssModules) throw createUnscopedCssModuleError(projectRoot, importer, entry.source);
			return { kind: 'css-module' };
		}
		return entry.sideEffectOnly && isCssImport(entry.source, kinds) ? { kind: 'local' } : undefined;
	}
	if (!isBarePackageImportSpecifier(entry.source)) {
		if (!kinds.isStylesheet(entry.source) || !(isModule || entry.sideEffectOnly)) return undefined;
		throw new Error(
			`[ecopages] ${relativeToRoot(projectRoot, importer)}: ${JSON.stringify(entry.source)} is neither a relative, aliased nor package stylesheet import, so Ecopages cannot add it to a Page.`,
		);
	}
	return classifyPackageStylesheetImport(entry, importer, projectRoot, kinds);
}

/**
 * Classifies an import of a bare package specifier.
 *
 * @remarks
 * A CSS Module of a package is delivered by any import without attributes, like a local one, and a plain package
 * stylesheet by a side-effect import alone.
 */
function classifyPackageStylesheetImport(
	entry: StaticImport,
	importer: string,
	projectRoot: string,
	kinds: StylesheetKinds,
): StylesheetImportTarget | undefined {
	const isModule = kinds.isCssModule(entry.source);
	if (isModule && !kinds.scopesCssModules) throw createUnscopedCssModuleError(projectRoot, importer, entry.source);
	if (!isModule && !entry.sideEffectOnly) return classifyBoundPackageStylesheet(entry, importer, projectRoot, kinds);
	if (kinds.isStylesheet(entry.source) && !entry.source.toLowerCase().endsWith('.css')) {
		throw createPackageProcessedStylesheetError(projectRoot, importer, entry.source);
	}
	const file = resolvePackageStylesheetPath(importer, entry.source);
	if (file && kinds.isCssModule(file) && !kinds.scopesCssModules) {
		throw createUnscopedCssModuleError(projectRoot, importer, entry.source);
	}
	return file ? { kind: 'package', file } : undefined;
}

/**
 * Classifies a binding import of a `.css` package specifier that is not named like a CSS Module.
 *
 * @remarks
 * The package may export a CSS Module under that name (`"./module.css": "./dist/x.module.css"`), which the importer
 * keeps the class map of and which is delivered like any package CSS Module. Any other file stays the importer's own
 * string, and a specifier that does not resolve is left to the build that imports it.
 */
function classifyBoundPackageStylesheet(
	entry: StaticImport,
	importer: string,
	projectRoot: string,
	kinds: StylesheetKinds,
): StylesheetImportTarget | undefined {
	if (!entry.source.toLowerCase().endsWith('.css')) return undefined;
	let file: string | undefined;
	try {
		file = resolvePackageStylesheetPath(importer, entry.source);
	} catch {
		return undefined;
	}
	if (!file || !kinds.isCssModule(file)) return undefined;
	if (!kinds.scopesCssModules) throw createUnscopedCssModuleError(projectRoot, importer, entry.source);
	return { kind: 'package', file };
}

/**
 * Whether discovery delivers `entry`: an import, without attributes, of a local plain stylesheet or of a package
 * stylesheet when it is a side-effect import, or of a CSS Module in any form.
 *
 * @remarks
 * The meta plugin strips the side-effect ones from plain modules and keeps a CSS Module import, whose class map
 * the module uses. Throws as {@link classifyStylesheetImport} does.
 */
export function isDeliveredStylesheetImport(
	entry: StaticImport,
	importer: string,
	projectRoot: string,
	pathPrefixes: string[],
	kinds: StylesheetKinds,
): boolean {
	return classifyStylesheetImport(entry, importer, projectRoot, pathPrefixes, kinds) !== undefined;
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
 * Builds the error for a side-effect stylesheet import of a package module that reaches a browser build.
 *
 * @remarks
 * Discovery delivers the side-effect stylesheet imports of app modules and of the packages it reaches. A package
 * module's own import reaches the build untouched, so its CSS would never load.
 */
export function createUndeliverablePackageStylesheetError(
	projectRoot: string,
	importer: string,
	source: string,
): Error {
	const module = relativeToRoot(projectRoot, importer);
	return new Error(
		`[ecopages] ${module}: ${JSON.stringify(source)} never reaches a Page, because no eco.page(), eco.layout(), eco.html() or eco.component() delivers the stylesheets a package module imports. List the stylesheet in eco.component({ dependencies: { stylesheets } }) of the component that uses the package.`,
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
	 * The entries of `stylesheets` and `plainModuleStylesheets` whose import named a package, each with the module
	 * whose import named it.
	 *
	 * @remarks
	 * The importer is kept because a package resolves from the module that imports it: a linked workspace package
	 * reaches its own dependencies, which the app root may not hold, or may hold at another version.
	 */
	packageStylesheets: Array<{ file: string; importer: string }>;
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
	/** The stylesheets discovery delivers; defaults to plain `.css`. */
	stylesheets?: StylesheetKinds;
	/** Results shared by every discovery of one build; see {@link createDiscoveryCache}. */
	cache?: DiscoveryCache;
};

/** What one plain module and the plain modules it imports contribute to a declaration. */
type PlainModuleWalk = {
	stylesheets: string[];
	/** The entries of `stylesheets` whose import named a package, each with the module whose import named it. */
	packageStylesheets: Map<string, string>;
	components: Map<string, { file: string; imported: string }>;
	/** Canonical paths of the walked plain modules. */
	modules: Set<string>;
	watchFiles: Set<string>;
};

/**
 * Module indexes and plain module walks shared by the discoveries of one build.
 *
 * @remarks
 * Files do not change during a build, so each declaration reuses what an earlier one read and walked.
 * Create one per build; across builds the content-keyed module index is the only cache.
 */
export type DiscoveryCache = { indexes: Map<string, ModuleIndex>; walks: Map<string, PlainModuleWalk> };

export function createDiscoveryCache(): DiscoveryCache {
	return { indexes: new Map(), walks: new Map() };
}

type DiscoveryState = {
	projectRoot: string;
	stylesheets: StylesheetKinds;
	pathPrefixes: string[];
	integrationOf?: (file: string) => DiscoveryIntegration | undefined;
	ownerFile: string;
	ownerSource?: string;
	cache?: DiscoveryCache;
	resolved: Map<string, boolean>;
	watchFiles: Set<string>;
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
	if (!file.includes(`/node_modules/`) && !isServerSpecifier(file)) {
		const { factories, namedReexports } = indexModule(file, state.cache);
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
		current = resolveReexport(
			current.file,
			indexModule(current.file, state.cache).namedReexports.get(current.imported),
			state,
		);
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
 * Resolves a stylesheet import that discovery delivers, local, a CSS Module or from a package, or returns `undefined`
 * for any other import.
 *
 * @remarks
 * Throws as {@link classifyStylesheetImport} does, and for a local stylesheet that does not resolve.
 */
function resolveDeliveredStylesheet(
	entry: StaticImport,
	importer: string,
	state: DiscoveryState,
): { file: string; fromPackage: boolean } | undefined {
	const target = classifyStylesheetImport(entry, importer, state.projectRoot, state.pathPrefixes, state.stylesheets);
	if (!target) return undefined;
	if (target.kind === 'package') return { file: target.file, fromPackage: true };
	const resolved = resolveStylesheetImportPath(entry.source, importer, state);
	if (!resolved || !fileSystem.exists(resolved)) {
		throw new Error(`[ecopages] Cannot resolve stylesheet import ${JSON.stringify(entry.source)} from ${importer}`);
	}
	return { file: resolved, fromPackage: false };
}

function jsxRuntimeOf(file: string, state: DiscoveryState): { integration: string; runtime?: string } | undefined {
	const integration = state.integrationOf?.(file);
	if (!integration) return undefined;
	const pragma =
		file === state.ownerFile && state.ownerSource !== undefined
			? jsxPragmaOf(state.ownerSource)
			: indexModule(file, state.cache).jsxImportSource;
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
		if (entry.attributed || state.stylesheets.isStylesheet(entry.source)) continue;
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
 * declaration and the Components it renders. A package stylesheet a module imports is collected in the same
 * place, though the walk never enters a package's modules. The walk stops at Eco modules, packages and `.server`
 * modules, and follows only static named, default and side-effect imports. An Eco Component it imports is
 * recorded on the walk. A walk is kept in the build cache unless it skipped a module still being walked
 * higher up a cycle, since that walk lacks what the skipped module contributes.
 */
function walkPlainModule(
	file: string,
	state: DiscoveryState,
	inProgress: Set<string>,
): { walk?: PlainModuleWalk; pending: Set<string> } {
	const memo = state.cache?.walks.get(file);
	if (memo) return { walk: memo, pending: new Set() };
	if (inProgress.has(file)) return { pending: new Set([file]) };
	const index = indexModule(file, state.cache);
	const walk: PlainModuleWalk = {
		stylesheets: [],
		packageStylesheets: new Map(),
		components: new Map(),
		modules: new Set(),
		watchFiles: new Set(),
	};
	if (index.declaresEcoFactory) return { walk, pending: new Set() };

	inProgress.add(file);
	const local: DiscoveryState = { ...state, resolved: new Map(), watchFiles: walk.watchFiles };
	walk.modules.add(canonicalFile(file));
	walk.watchFiles.add(file);
	for (const entry of index.imports) {
		const stylesheet = resolveDeliveredStylesheet(entry, file, local);
		if (!stylesheet) continue;
		if (!walk.stylesheets.includes(stylesheet.file)) walk.stylesheets.push(stylesheet.file);
		if (stylesheet.fromPackage && !walk.packageStylesheets.has(stylesheet.file))
			walk.packageStylesheets.set(stylesheet.file, file);
	}
	const children = collectModuleEdges(
		file,
		index.imports,
		() => index.renderedNames,
		local,
		(binding, target) => {
			const key = `${target}\0${binding.imported}`;
			if (!walk.components.has(key)) walk.components.set(key, { file: target, imported: binding.imported });
		},
	);
	const pending = new Set<string>();
	for (const child of children) {
		const result = walkPlainModule(child, state, inProgress);
		for (const skipped of result.pending) pending.add(skipped);
		if (result.walk) mergePlainModuleWalk(walk, result.walk);
	}
	inProgress.delete(file);
	pending.delete(file);
	if (pending.size === 0) state.cache?.walks.set(file, walk);
	return { walk, pending };
}

function mergePlainModuleWalk(into: PlainModuleWalk, from: PlainModuleWalk): void {
	for (const stylesheet of from.stylesheets)
		if (!into.stylesheets.includes(stylesheet)) into.stylesheets.push(stylesheet);
	for (const [stylesheet, importer] of from.packageStylesheets)
		if (!into.packageStylesheets.has(stylesheet)) into.packageStylesheets.set(stylesheet, importer);
	for (const [key, component] of from.components) if (!into.components.has(key)) into.components.set(key, component);
	for (const module of from.modules) into.modules.add(module);
	for (const watchFile of from.watchFiles) into.watchFiles.add(watchFile);
}

/**
 * Records the stylesheets the declaring module imports itself on `result`, and returns those a package import named.
 *
 * @remarks
 * A side-effect import is removed from the module, and a CSS Module import stays for its class map.
 */
function collectOwnStylesheets(
	imports: StaticImport[],
	ownerFile: string,
	state: DiscoveryState,
	result: DiscoveredImports,
): Map<string, string> {
	const packageStylesheets = new Map<string, string>();
	for (const entry of imports) {
		const stylesheet = resolveDeliveredStylesheet(entry, ownerFile, state);
		if (!stylesheet) continue;
		if (!result.stylesheets.includes(stylesheet.file)) result.stylesheets.push(stylesheet.file);
		if (stylesheet.fromPackage && !packageStylesheets.has(stylesheet.file))
			packageStylesheets.set(stylesheet.file, ownerFile);
		if (entry.sideEffectOnly) result.removals.push({ start: entry.start, end: entry.end, replacement: '' });
	}
	return packageStylesheets;
}

/**
 * Discovers local Eco Component imports and the CSS that reaches an Eco declaration.
 *
 * @remarks
 * The CSS Modules the declaring module imports count as its side-effect CSS: their scoped CSS reaches the Page the
 * same way, though the import stays for the class map. Side-effect CSS of the declaring module, relative, aliased or from a package, is kept apart from the CSS of the
 * plain local modules it imports (see {@link walkPlainModule}), which collection places after the CSS of every
 * declaration that imports those modules. Eco Components a plain module imports become Components of the
 * declaration too, so their Dependencies reach the Page. Named `export { X } from`
 * barrels are followed for the imported binding only. Imported Eco modules, successful re-export hops and
 * every walked plain module are recorded in `watchFiles` so their edits invalidate caches. Each stylesheet is
 * listed once by real path, and `packageStylesheets` marks those a package import named.
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
		packageStylesheets: [],
		plainModuleComponents: [],
		watchFiles: [],
		removals: [],
	};
	const state: DiscoveryState = {
		projectRoot,
		stylesheets: options.stylesheets ?? PLAIN_CSS_KINDS,
		pathPrefixes: loadTsconfigPathPrefixes(projectRoot),
		integrationOf: options.integrationOf,
		ownerFile,
		ownerSource: options.ownerSource,
		cache: options.cache,
		resolved: new Map(),
		watchFiles: new Set(),
	};
	const imports = collectStaticImports(program);
	const packageStylesheets = collectOwnStylesheets(imports, ownerFile, state, result);
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
	const plain: PlainModuleWalk = {
		stylesheets: [],
		packageStylesheets: new Map(),
		components: new Map(),
		modules: new Set(),
		watchFiles: new Set(),
	};
	const inProgress = new Set([canonicalFile(ownerFile)]);
	for (const file of plainModules) {
		const { walk } = walkPlainModule(file, state, inProgress);
		if (walk) mergePlainModuleWalk(plain, walk);
	}
	recordDiscoveryOwner(projectRoot, ownerFile, plain.modules);
	for (const watchFile of plain.watchFiles) state.watchFiles.add(watchFile);
	for (const [key, component] of plain.components) {
		if (!ownComponents.has(key)) result.plainModuleComponents.push(component);
	}
	result.plainModuleStylesheets.push(...plain.stylesheets.filter((file) => !result.stylesheets.includes(file)));
	for (const [file, importer] of plain.packageStylesheets)
		if (!packageStylesheets.has(file)) packageStylesheets.set(file, importer);
	result.packageStylesheets.push(...[...packageStylesheets].map(([file, importer]) => ({ file, importer })));
	result.watchFiles.push(...state.watchFiles);
	return result;
}
