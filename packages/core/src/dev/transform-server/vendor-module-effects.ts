import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { parseModuleSource } from '../../cache/module-parse-cache.ts';
import { isNodeBuiltinSpecifier } from '../../utils/node-builtin.ts';

const RESOLVE_SUFFIXES = ['', '.js', '.mjs', '.ts', '.tsx', '/index.js', '/index.mjs', '/index.ts'] as const;
const MAX_CLOSURE_FILES = 400;

type AstNode = { type: string; source?: { value?: unknown }; [key: string]: unknown };

/** The statements of an ES module that run when it loads, beyond declaring bindings. */
const EFFECT_STATEMENTS = new Set([
	'ExpressionStatement',
	'IfStatement',
	'ForStatement',
	'ForInStatement',
	'ForOfStatement',
	'WhileStatement',
	'DoWhileStatement',
	'TryStatement',
	'SwitchStatement',
	'BlockStatement',
	'ThrowStatement',
]);

const PAGE_GLOBAL_NAMES = [
	'window',
	'document',
	'globalThis',
	'self',
	'navigator',
	'localStorage',
	'sessionStorage',
	'customElements',
] as const;

/** Browser globals that a module reads or sets by their members when it loads. */
const PAGE_GLOBALS: ReadonlySet<string> = new Set(PAGE_GLOBAL_NAMES);

/** Browser globals whose construction or call does something beyond making a value. */
const EFFECTFUL_GLOBALS = new Set([
	'WebSocket',
	'EventSource',
	'Worker',
	'SharedWorker',
	'XMLHttpRequest',
	'BroadcastChannel',
	'MutationObserver',
	'ResizeObserver',
	'IntersectionObserver',
	'PerformanceObserver',
	'fetch',
	'setTimeout',
	'setInterval',
	'requestAnimationFrame',
	'queueMicrotask',
	'addEventListener',
	...PAGE_GLOBAL_NAMES,
]);

/** What loading an ES module and the modules it imports from its own package does. */
export type ModuleClosureTraits = {
	/** A top-level statement that is not a declaration runs. */
	loadTimeEffects: boolean;
	/** A module imports a Node builtin, which a browser cannot load. */
	nodeBuiltin: boolean;
};

function resolveRelative(fromFile: string, specifier: string): string | undefined {
	const base = path.resolve(path.dirname(fromFile), specifier);
	for (const suffix of RESOLVE_SUFFIXES) {
		const candidate = `${base}${suffix}`;
		if (fileSystem.exists(candidate) && !fileSystem.stat(candidate).isDirectory) return candidate;
	}
	return undefined;
}

function isDirective(statement: AstNode): boolean {
	return (
		statement.type === 'ExpressionStatement' && typeof (statement as { directive?: unknown }).directive === 'string'
	);
}

function parseBody(file: string): AstNode[] | undefined {
	try {
		const program = parseModuleSource(file, fileSystem.readFileSync(file), { sourceType: 'module' });
		return program.module.hasModuleSyntax ? (program.program.body as unknown as AstNode[]) : undefined;
	} catch {
		return undefined;
	}
}

/** The name at the root of a callee or member chain: `window` for `window.localStorage.getItem`. */
function rootName(node: unknown): string | undefined {
	let current = node;
	while (typeof current === 'object' && current !== null) {
		const candidate = current as { type?: string; name?: string; object?: unknown; callee?: unknown };
		if (candidate.type === 'Identifier') return candidate.name;
		current = candidate.object ?? candidate.callee;
	}
	return undefined;
}

/** Whether evaluating an expression, outside the bodies of functions and classes, calls or constructs an effectful global. */
function expressionHasEffects(node: unknown): boolean {
	if (Array.isArray(node)) return node.some(expressionHasEffects);
	if (typeof node !== 'object' || node === null) return false;
	const candidate = node as { type?: string; callee?: unknown };
	if (candidate.type && /Function|Class/u.test(candidate.type)) return false;
	if (
		(candidate.type === 'CallExpression' || candidate.type === 'NewExpression') &&
		EFFECTFUL_GLOBALS.has(rootName(candidate.callee) ?? '')
	) {
		return true;
	}
	if (candidate.type === 'MemberExpression' && PAGE_GLOBALS.has(rootName(candidate) ?? '')) return true;
	return Object.values(node).some(
		(child) => typeof child === 'object' && child !== null && expressionHasEffects(child),
	);
}

/** Whether a top-level declaration, possibly exported, initializes a binding with an effectful call, or default-exports one. */
function declarationHasEffects(statement: AstNode): boolean {
	if (statement.type === 'ExportDefaultDeclaration') return expressionHasEffects(statement.declaration);
	const declaration = (statement.declaration ?? statement) as { type?: string; declarations?: { init?: unknown }[] };
	return (
		declaration.type === 'VariableDeclaration' &&
		(declaration.declarations ?? []).some((declarator) => expressionHasEffects(declarator.init))
	);
}

function readModuleTraits(body: AstNode[]): ModuleClosureTraits {
	return {
		loadTimeEffects: body.some(
			(statement) =>
				(EFFECT_STATEMENTS.has(statement.type) && !isDirective(statement)) || declarationHasEffects(statement),
		),
		nodeBuiltin: body.some((statement) => {
			const specifier = statement.source?.value;
			return typeof specifier === 'string' && isNodeBuiltinSpecifier(specifier);
		}),
	};
}

function readRelativeImports(body: AstNode[]): string[] {
	const imports: string[] = [];
	for (const statement of body) {
		const specifier = statement.source?.value;
		if (typeof specifier === 'string' && specifier.startsWith('.')) imports.push(specifier);
	}
	return imports;
}

/**
 * The modules a module imports from its own package, followed through their own imports, itself included.
 */
export function collectModuleClosure(entry: string): Set<string> {
	const visited = new Set<string>();
	const pending = [entry];
	while (pending.length > 0 && visited.size <= MAX_CLOSURE_FILES) {
		const file = pending.pop()!;
		if (visited.has(file)) continue;
		visited.add(file);
		for (const specifier of readRelativeImports(parseBody(file) ?? [])) {
			const resolved = resolveRelative(file, specifier);
			if (resolved) pending.push(resolved);
		}
	}
	return visited;
}

/**
 * Whether loading an ES module, or one of the modules it imports from its own package, runs code that is not a
 * declaration, and whether any of them imports a Node builtin.
 *
 * @remarks
 * A package's one file runs every module that is in it when it loads, so a module that registers a custom element,
 * opens a socket or sets a global would run in every page that imports the package, whether the page imports that
 * module or not, and a module that imports a Node builtin would stop the file from loading at all. A module with such
 * a top-level statement or import stays out of a package's surface and is served only when an import asks. A
 * CommonJS module runs when it is required, not when its file loads, so its statements never count.
 */
export function inspectModuleClosure(
	entry: string,
	cache = new Map<string, ModuleClosureTraits>(),
): ModuleClosureTraits {
	const traits: ModuleClosureTraits = { loadTimeEffects: false, nodeBuiltin: false };
	const visited = new Set<string>();
	const pending = [entry];
	while (pending.length > 0 && visited.size <= MAX_CLOSURE_FILES) {
		const file = pending.pop()!;
		if (visited.has(file)) continue;
		visited.add(file);
		const body = parseBody(file);
		if (!body) continue;
		const own = cache.get(file) ?? readModuleTraits(body);
		cache.set(file, own);
		traits.loadTimeEffects ||= own.loadTimeEffects;
		traits.nodeBuiltin ||= own.nodeBuiltin;
		for (const specifier of readRelativeImports(body)) {
			const resolved = resolveRelative(file, specifier);
			if (resolved) pending.push(resolved);
		}
	}
	return traits;
}
