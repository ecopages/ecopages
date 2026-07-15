import path from 'node:path';
import type { BuildOptions } from './build-contracts.ts';
import { createJsxCacheKey, createPluginCacheKey, createSourceTransformCacheKey } from './cache-keys.ts';

function normalizeEntrypoints(entrypoints: BuildOptions['entrypoints']): string {
	if (Array.isArray(entrypoints)) {
		return entrypoints
			.map((entrypoint) => path.resolve(entrypoint))
			.sort()
			.join('|');
	}

	return Object.entries(entrypoints)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, value]) => `${key}:${path.resolve(value)}`)
		.join('|');
}

/**
 * Preserves list order for collections where Rolldown precedence depends on position.
 */
function normalizeOrderedStringList(values: string[] | undefined, label: string): string {
	if (!values || values.length === 0) {
		return `${label}:default`;
	}

	return `${label}:${values.join(',')}`;
}

/**
 * Sorts unordered sets so equivalent membership produces one identity.
 */
function normalizeUnorderedStringList(values: string[] | undefined, label: string): string {
	if (!values || values.length === 0) {
		return `${label}:default`;
	}

	return `${label}:${[...values].sort().join(',')}`;
}

function normalizeDefine(define: Record<string, string> | undefined): string {
	if (!define || Object.keys(define).length === 0) {
		return 'define:default';
	}

	return `define:${Object.entries(define)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, value]) => `${key}=${value}`)
		.join(',')}`;
}

/**
 * Canonical identity for one complete {@link BuildOptions} request.
 *
 * @remarks
 * Semantically unordered collections (`external`, `define` keys, array entrypoints)
 * are sorted. Plugin, `conditions`, and source-transform order is preserved because
 * Rolldown hook and `conditionNames` precedence depend on it.
 *
 * Deprecated / ignored adapter fields (`splitting`, `bundle`, `outbase`) still
 * participate in the key so requests that differ only on those fields do not
 * coalesce. Empty `conditions` / `define` / `external` normalize to the same
 * sentinel as `undefined`.
 */
export function createBuildRequestIdentity(options: BuildOptions): string {
	return [
		normalizeEntrypoints(options.entrypoints),
		options.root ? path.resolve(options.root) : 'root:default',
		options.outdir ? path.resolve(options.outdir) : 'outdir:default',
		options.outbase ? path.resolve(options.outbase) : 'outbase:default',
		options.splitting ?? 'splitting:default',
		options.bundle ?? 'bundle:default',
		options.externalPackages ?? 'externalPackages:default',
		options.target ?? 'target:default',
		options.format ?? 'format:default',
		options.sourcemap ?? 'sourcemap:default',
		options.minify ?? 'minify:default',
		options.treeshaking ?? 'treeshaking:default',
		options.naming ?? 'naming:default',
		normalizeOrderedStringList(options.conditions, 'conditions'),
		normalizeDefine(options.define),
		normalizeUnorderedStringList(options.external, 'external'),
		createJsxCacheKey(options.jsx),
		createPluginCacheKey(options.plugins),
		createSourceTransformCacheKey(options.sourceTransforms),
	].join('::');
}

/** @deprecated Use {@link createBuildRequestIdentity}. */
export const createBuildOptionsDedupeKey = createBuildRequestIdentity;
