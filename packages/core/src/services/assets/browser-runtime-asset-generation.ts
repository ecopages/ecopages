import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { clearAppPageCache } from '../cache/page-cache-service.ts';
import { isDevelopmentRuntime } from '../../utils/runtime.ts';

const generationByAppConfig = new WeakMap<EcoPagesAppConfig, number>();

/**
 * Returns the current browser-runtime asset generation for one app.
 *
 * @remarks
 * Development HTML caches include this generation so rebuilt bootstrap and
 * vendor URLs cannot leave stale script references behind.
 */
export function getBrowserRuntimeAssetGeneration(appConfig: EcoPagesAppConfig): number {
	return generationByAppConfig.get(appConfig) ?? 0;
}

/**
 * Bumps browser-runtime asset generation and clears rendered HTML cache entries.
 *
 * @remarks
 * Only call this when a previously cached runtime/page-script asset filepath changes.
 * First inserts must not bump generation or cold start thrash-clears the HTML cache.
 */
export async function bumpBrowserRuntimeAssetGeneration(appConfig: EcoPagesAppConfig): Promise<void> {
	if (!isDevelopmentRuntime()) {
		return;
	}

	const nextGeneration = getBrowserRuntimeAssetGeneration(appConfig) + 1;
	generationByAppConfig.set(appConfig, nextGeneration);
	await clearAppPageCache(appConfig);
}
