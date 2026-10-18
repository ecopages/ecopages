import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { clearAppPageCache } from '../page-cache/page-cache-service.ts';
import { isDevelopmentRuntime } from '../utils/runtime.ts';

/**
 * Clears the rendered HTML cache after a browser runtime or page script asset changed its file path.
 *
 * @remarks
 * Cached development documents hold the old script URLs, so every entry is dropped instead of keyed by a
 * generation. This currently reaches from the Build layer into rendered-page cache state; #556 tracks
 * moving invalidation behind a lower-level cache contract. Only call this when a previously cached
 * runtime/page-script asset filepath changes. First inserts must not clear the cache or cold start thrashes it.
 */
export async function clearPageCacheForBrowserRuntimeAssetChange(appConfig: EcoPagesAppConfig): Promise<void> {
	if (!isDevelopmentRuntime()) {
		return;
	}

	await clearAppPageCache(appConfig);
}
