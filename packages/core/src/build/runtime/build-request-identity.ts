import path from 'node:path';
import type { BuildOptions } from '../contracts/build-contracts.ts';
import { createPluginCacheKey } from '../cache/cache-keys.ts';

function normalizeEntrypoints(entrypoints: BuildOptions['entrypoints']): unknown {
	if (Array.isArray(entrypoints)) {
		return entrypoints.map((entrypoint) => path.resolve(entrypoint)).sort();
	}

	return Object.fromEntries(Object.entries(entrypoints).map(([key, value]) => [key, path.resolve(value)]));
}

/**
 * Orders object keys and drops `undefined` and empty collections, so equal requests
 * serialize to equal strings however they were assembled.
 */
function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.length === 0 ? undefined : value.map(canonicalize);
	}
	if (typeof value !== 'object' || value === null) {
		return value;
	}
	const entries = Object.entries(value)
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(([key, entry]) => [key, canonicalize(entry)] as const)
		.filter(([, entry]) => entry !== undefined);
	return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

/**
 * Canonical identity for one complete {@link BuildOptions} request.
 *
 * @remarks
 * Every field except `plugins` is part of the identity, so a field added to
 * {@link BuildOptions} changes it without being listed here. Paths are resolved.
 * Entry lists and `external` are sorted because their order does not change the
 * output; `conditions` keeps its order because Rolldown's `conditionNames`
 * precedence depends on it. Empty collections count as unset.
 *
 * Plugins enter by name, environments and `cacheKey`, in order,
 * since Rolldown hook precedence depends on position.
 */
export function createBuildRequestIdentity(options: BuildOptions): string {
	const { plugins, entrypoints, root, outdir, runtimeOutdir, external, ...rest } = options;
	return JSON.stringify([
		canonicalize({
			...rest,
			entrypoints: normalizeEntrypoints(entrypoints),
			root: root ? path.resolve(root) : undefined,
			outdir: outdir ? path.resolve(outdir) : undefined,
			runtimeOutdir: runtimeOutdir ? path.resolve(runtimeOutdir) : undefined,
			external: external ? [...external].sort() : undefined,
		}),
		createPluginCacheKey(plugins),
	]);
}
