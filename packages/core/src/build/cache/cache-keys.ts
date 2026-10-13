import type { EcoBuildPlugin } from '../contracts/build-types.ts';
import type { BuildOptions } from '../contracts/build-contracts.ts';

/** Stable fingerprint for JSX options used in build and in-process cache keys. */
export function createJsxCacheKey(jsx: BuildOptions['jsx']): string {
	if (!jsx) {
		return 'jsx:default';
	}

	return JSON.stringify({
		development: jsx.development ?? false,
		factory: jsx.factory ?? null,
		fragment: jsx.fragment ?? null,
		importSource: jsx.importSource ?? null,
		runtime: jsx.runtime ?? null,
		sideEffects: jsx.sideEffects ?? null,
	});
}

/** Stable fingerprint for ordered build plugins. */
export function createPluginCacheKey(plugins?: EcoBuildPlugin[]): string {
	if (!plugins || plugins.length === 0) {
		return 'plugins:default';
	}

	return `plugins:${plugins
		.map(
			(plugin) =>
				`${plugin.name}:${[...new Set(plugin.environments ?? ['server', 'browser'])].sort().join('+')}:${hashFunctionIdentity(plugin.setup)}`,
		)
		.join(',')}`;
}

/**
 * Stable fingerprint of a function body for cache and request identity keys.
 *
 * @remarks
 * Hashes `fn.toString()`. Suitable for in-process keys that must
 * agree within one install; not stable across minifiers or renames.
 */
export function hashFunctionIdentity(fn: (...args: never[]) => unknown): string {
	let hash = 0;
	const source = fn.toString();

	for (let index = 0; index < source.length; index += 1) {
		hash = (hash * 31 + source.charCodeAt(index)) | 0;
	}

	return (hash >>> 0).toString(36);
}
