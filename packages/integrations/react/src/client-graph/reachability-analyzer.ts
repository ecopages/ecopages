/**
 * @module ReachabilityAnalyzer
 *
 * This module is responsible for performing static analysis on Ecopages client components
 * using the Oxc AST parser. It computes a strict "reachability graph" of all JavaScript/TypeScript
 * dependencies (imports, variables, functions, and classes) that begin from explicit client roots.
 */

import { parseModuleSource } from '@ecopages/core/cache';
import type { ParseResult } from 'oxc-parser';
import { finalizeClientRoots } from './reachability-client-roots.ts';
import { resolveFallbackClientRoots } from './reachability-fallback-roots.ts';
export { hasPagePreloadExport } from './reachability-preload.ts';
import { buildTopLevelIndex } from './reachability-top-level-index.ts';
import { runReachabilityTraversal } from './reachability-traverse.ts';
import type { ExplicitlyRequestedExports } from './reachability-export-names.ts';

/**
 * Represents the computed results of a reachability analysis pass.
 */
export type ReachabilityResult = {
	reachableImports: Map<string, Set<string> | '*'>;
	reachableDeclarations: Set<unknown>;
	unreachableSideEffectImports: unknown[];
	isFallbackRoots: boolean;
	analyzed: boolean;
};

function emptyReachabilityResult(isFallbackRoots: boolean): ReachabilityResult {
	return {
		reachableImports: new Map(),
		reachableDeclarations: new Set(),
		unreachableSideEffectImports: [],
		isFallbackRoots,
		analyzed: false,
	};
}

/**
 * Analyzes a module using Oxc AST and extracts a strict reachability graph
 * starting from client roots: `render`, `errorBoundary`, and `loadingFallback` of
 * `eco.page`, `eco.layout`, or `eco.component`, plus a Page's named `preload` export.
 */
export function analyzeReachability(
	source: string,
	filename: string,
	program?: ParseResult['program'],
	explicitlyRequestedExports?: ExplicitlyRequestedExports,
): ReachabilityResult {
	let resolvedProgram: ParseResult['program'];

	if (program) {
		resolvedProgram = program;
	} else {
		try {
			resolvedProgram = parseModuleSource(filename, source).program;
		} catch {
			return emptyReachabilityResult(true);
		}
	}

	const index = buildTopLevelIndex(resolvedProgram);
	const potentialClientRoots = finalizeClientRoots(index.clientRootState);
	const isFallbackRoots = resolveFallbackClientRoots(
		resolvedProgram,
		potentialClientRoots,
		explicitlyRequestedExports,
	);

	const { reachableImports, reachableDeclarations } = runReachabilityTraversal(
		potentialClientRoots,
		index.topLevelImports,
		index.topLevelDeclarations,
		explicitlyRequestedExports,
	);

	const unreachableSideEffectImports = index.topLevelImports
		.filter((imp) => imp.isSideEffect && !reachableImports.has(imp.specifier))
		.map((imp) => imp.node);

	return {
		reachableImports,
		reachableDeclarations,
		unreachableSideEffectImports,
		isFallbackRoots,
		analyzed: true,
	};
}
