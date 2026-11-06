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

function propagate(
	module: PlannedModule,
	filePath: string,
	requested: RequestedExportRules | undefined,
	registry: Map<string, RequestedExportRules>,
): boolean {
	if (!module.program) return false;
	const reachability = analyzeReachability(module.source, filePath, module.program, requested);
	let changed = false;
	for (const statement of module.program.body as any[]) {
		const source =
			statement.type === 'ImportDeclaration' ||
			((statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportAllDeclaration') &&
				statement.source)
				? (statement.source.value as string)
				: undefined;
		if (!source) continue;
		const rules = reachability.reachableImports.get(source);
		const key = resolveRequestedExportsKey(filePath, source);
		if (rules && key && mergeRequestedExportRules(registry, key, rules)) changed = true;
	}
	return changed;
}

/**
 * Computes, before any module transforms, which exports each module's importers use.
 *
 * @remarks
 * A module's pruning depends on the exports its importers request, so computing them while modules load
 * made the result depend on which importer Rolldown loaded first. The plan walks the static, dynamic and
 * `require` imports of the app's own files from the build's entries (relative, absolute and tsconfig path
 * imports; packages are never scanned), then passes requested exports from importers to imports, importers
 * first, repeating until nothing changes, so a cycle settles on the union of what reaches it. Each module is
 * read and parsed once, and its load reuses that parse. An entry keeps all of its exports, so a build that
 * loads only its entries, such as a development transform, never needs the plan.
 *
 * A module the scan does not reach (one imported through a package name or a plugin's virtual module) is
 * transformed with no requested exports, so it keeps all of its exports.
 */
export function createRequestedExportsPlan(options: RequestedExportsPlanOptions): RequestedExportsPlan {
	const modules = new Map<string, PlannedModule>();
	const postOrder: string[] = [];
	const visited = new Set<string>();

	const visit = (start: string) => {
		const stack: Array<{ filePath: string; imports?: string[] }> = [{ filePath: start }];
		while (stack.length > 0) {
			const frame = stack[stack.length - 1]!;
			if (!frame.imports) {
				if (visited.has(frame.filePath)) {
					stack.pop();
					continue;
				}
				visited.add(frame.filePath);
				const module = options.readModule(frame.filePath);
				if (module) modules.set(frame.filePath, module);
				frame.imports = module?.program
					? importSpecifiers(module.program)
							.map((specifier) => resolveImport(options.projectRoot, frame.filePath, specifier))
							.filter((filePath): filePath is string => filePath !== undefined && !visited.has(filePath))
							.reverse()
					: [];
			}
			const next = frame.imports.pop();
			if (next === undefined) {
				postOrder.push(frame.filePath);
				stack.pop();
			} else if (!visited.has(next)) {
				stack.push({ filePath: next });
			}
		}
	};

	const seeds = new Set([...options.seeds].map(toRealPath));
	for (const seed of [...seeds].sort()) visit(seed);

	const importersFirst = postOrder.reverse().filter((filePath) => options.transforms(filePath));
	const registry = new Map<string, RequestedExportRules>();
	const requestedExports = (filePath: string) =>
		seeds.has(filePath) ? undefined : registry.get(normalizeRequestedExportsKey(filePath));
	for (let pass = 0; pass <= importersFirst.length; pass += 1) {
		let changed = false;
		for (const filePath of importersFirst) {
			const module = modules.get(filePath);
			if (module && propagate(module, filePath, requestedExports(filePath), registry)) changed = true;
		}
		if (!changed) break;
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
