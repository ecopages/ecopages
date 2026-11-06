import path from 'node:path';
import type { ParseResult } from 'oxc-parser';
import { resolveProjectModulePath } from '@ecopages/core/build';
import { fileSystem } from '@ecopages/file-system';
import { analyzeReachability } from './reachability-analyzer.ts';
import { walkAstNodes } from './ast-walk.ts';
import {
	mergeRequestedExportRules,
	normalizeRequestedExportsKey,
	resolveRequestedExportsKey,
	type RequestedExportRules,
} from './specifier-classification.ts';
import { toRealPath } from './foreign-jsx-reach.ts';

/** One module as the boundary transforms it: its source after read-file inlining, parsed once. */
export type PlannedModule = {
	source: string;
	program: ParseResult['program'] | undefined;
	/** Whether read-file inlining rewrote `source`. */
	inlined: boolean;
	/** Files inlined into `source`, which the module's build declares as watch files. */
	inlinedFiles: string[];
};

export type RequestedExportsPlanOptions = {
	/** Entry files of the build; the scan starts from them. */
	seeds: Iterable<string>;
	projectRoot: string;
	/** Reads and parses a module the way the boundary transforms it, or `undefined` when it cannot be read. */
	readModule(filePath: string): PlannedModule | undefined;
	/** Whether the boundary transforms `filePath`, so its imports pass requested exports on. */
	transforms(filePath: string): boolean;
};

export type RequestedExportsPlan = {
	/** The exports the module's importers use, from the whole graph the scan reached; `undefined` for an entry. */
	requestedExports(filePath: string): RequestedExportRules | undefined;
	/** Hands the scanned module to its load once; later calls, and modules the scan missed, get `undefined`. */
	takeModule(filePath: string): PlannedModule | undefined;
};

function importSpecifiers(program: ParseResult['program']): string[] {
	const specifiers: string[] = [];
	walkAstNodes(program, (node) => {
		const source =
			node.type === 'ImportDeclaration' ||
			node.type === 'ExportNamedDeclaration' ||
			node.type === 'ExportAllDeclaration' ||
			node.type === 'ImportExpression'
				? node.source
				: node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'require'
					? node.arguments?.[0]
					: undefined;
		if (typeof source?.value === 'string') specifiers.push(source.value);
	});
	return specifiers;
}

function resolveImport(projectRoot: string, importer: string, specifier: string): string | undefined {
	const resolved = path.isAbsolute(specifier)
		? fileSystem.exists(specifier)
			? specifier
			: undefined
		: resolveProjectModulePath(projectRoot, importer, specifier, { preserveBarrel: true });
	return resolved && !resolved.split(/[\\/]/).includes('node_modules') ? toRealPath(resolved) : undefined;
}

/** Specifiers of the top-level import and re-export statements, the edges that pass requested exports on. */
function statementSpecifiers(program: ParseResult['program']): Set<string> {
	const specifiers = new Set<string>();
	for (const statement of program.body as any[]) {
		if (
			statement.type === 'ImportDeclaration' ||
			((statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportAllDeclaration') &&
				statement.source)
		) {
			specifiers.add(statement.source.value as string);
		}
	}
	return specifiers;
}

/**
 * Computes, before any module transforms, which exports each module's importers use.
 *
 * @remarks
 * A module's pruning depends on the exports its importers request, so computing them while modules load
 * made the result depend on which importer Rolldown loaded first. The plan starts from the build's entries
 * and follows only the imports a module's browser code reaches, after server-only Page options are set
 * aside, as the boundary's own analysis finds them: a module reached only through a stripped `staticProps`
 * is never loaded, so it requests nothing. Relative, absolute and tsconfig path imports of the app's own
 * files are followed; packages are never scanned. A module the boundary does not transform, such as a
 * bootstrap entry, passes every import on and requests nothing. Requested exports flow from importers to
 * imports through a worklist that analyses a module again whenever its requests grow, so a cycle settles on
 * the union of what reaches it. Each module is read and parsed once, and its load reuses that parse. An
 * entry keeps all of its exports, so a build that loads only its entries, such as a development transform,
 * never needs the plan.
 *
 * A module reached through an import the registry has no key for (a tsconfig path alias) keeps all of its
 * exports, as it does when no importer requests anything, and still passes its own imports on. A module
 * the scan does not reach (one imported through a package name or a plugin's virtual module) is
 * transformed with no requested exports, so it keeps all of its exports.
 */
export function createRequestedExportsPlan(options: RequestedExportsPlanOptions): RequestedExportsPlan {
	const modules = new Map<string, PlannedModule | undefined>();
	const readModule = (filePath: string) => {
		if (!modules.has(filePath)) modules.set(filePath, options.readModule(filePath));
		return modules.get(filePath);
	};
	const seeds = new Set([...options.seeds].map(toRealPath));
	const registry = new Map<string, RequestedExportRules>();
	const requestedExports = (filePath: string) =>
		seeds.has(filePath) ? undefined : registry.get(normalizeRequestedExportsKey(filePath));

	const reached = new Set<string>();
	const queued = new Set<string>();
	const queue: string[] = [];
	const enqueue = (filePath: string) => {
		if (queued.has(filePath)) return;
		queued.add(filePath);
		queue.push(filePath);
	};
	const reach = (filePath: string) => {
		if (reached.has(filePath)) return;
		reached.add(filePath);
		enqueue(filePath);
	};

	for (const seed of [...seeds].sort()) reach(seed);
	while (queue.length > 0) {
		const filePath = queue.shift()!;
		queued.delete(filePath);
		const module = readModule(filePath);
		if (!module?.program) continue;
		if (!options.transforms(filePath)) {
			for (const specifier of importSpecifiers(module.program)) {
				const target = resolveImport(options.projectRoot, filePath, specifier);
				if (target) reach(target);
			}
			continue;
		}
		const reachability = analyzeReachability(module.source, filePath, module.program, requestedExports(filePath));
		const keyed = statementSpecifiers(module.program);
		for (const [specifier, rules] of reachability.reachableImports) {
			const target = resolveImport(options.projectRoot, filePath, specifier);
			const key = keyed.has(specifier) ? resolveRequestedExportsKey(filePath, specifier) : undefined;
			if (key && mergeRequestedExportRules(registry, key, rules) && target) enqueue(target);
			if (target) reach(target);
		}
	}

	return {
		requestedExports: (filePath) => requestedExports(toRealPath(filePath)),
		takeModule(filePath) {
			const realPath = toRealPath(filePath);
			const module = modules.get(realPath);
			modules.delete(realPath);
			return module;
		},
	};
}
