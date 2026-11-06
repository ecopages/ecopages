import type { EcoBuildPlugin } from '../contracts/build-types.ts';

/**
 * Stable fingerprint for ordered build plugins: each name, its environments, its
 * {@link EcoBuildPlugin.cacheKey} and, when set, its {@link EcoBuildPlugin.entryScope}.
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
			...(plugin.entryScope ? [[...plugin.entryScope].sort()] : []),
		]),
	]);
}
