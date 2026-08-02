/**
 * Cache services exports
 * @module
 */

export type {
	CacheConfig,
	CacheEntry,
	CacheResult,
	CacheStats,
	CacheStore,
	CacheStrategy,
	RenderResult,
} from './cache.types.ts';

export { MemoryCacheStore, type MemoryCacheStoreOptions } from './memory-cache-store.ts';
export { HtmlPageCacheDependencyIndex } from './html-page-cache-dependency-index.ts';

export { getCacheControlHeader, PageCacheService, type PageCacheServiceOptions } from './page-cache-service.ts';
export {
	clearAppPageCache,
	getAppPageCacheService,
	invalidateAppPageCacheBySourcePaths,
	registerAppPageCacheService,
} from './page-cache-service.ts';
