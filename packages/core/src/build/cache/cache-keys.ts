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

/**
 * Stable fingerprint for ordered build plugins: each name, its environments and its
 * {@link EcoBuildPlugin.cacheKey}.
 */
export function createPluginCacheKey(plugins?: EcoBuildPlugin[]): string {
	if (!plugins || plugins.length === 0) {
		return 'plugins:default';
	}

	return JSON.stringify([
		'plugins',
		plugins.map((plugin) => [
			plugin.name,
			[...new Set(plugin.environments ?? ['server', 'browser'])].sort(),
			plugin.cacheKey ?? null,
		]),
	]);
}
