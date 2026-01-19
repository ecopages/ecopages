/**
 * Cache types and interfaces for page caching and ISR
 * @module
 */

/**
 * Result from rendering a page, including HTML and cache strategy.
 */
export interface RenderResult {
	html: string;
	strategy: CacheStrategy;
}

/**
 * Render strategy configuration for pages.
 * - `'static'`: Render once, cache indefinitely
 * - `'dynamic'`: No caching, render on every request
 * - `{ revalidate, tags }`: Cache with time-based revalidation and optional tags
 */
export type CacheStrategy =
	| 'static'
	| 'dynamic'
	| {
			/** Seconds until cache is considered stale */
			revalidate: number;
			/** Tags for on-demand invalidation */
			tags?: string[];
	  };

/**
 * Cache entry stored in the cache store.
 */
export interface CacheEntry {
	/** The rendered HTML content */
	html: string;
	/** Timestamp when the entry was created */
	createdAt: number;
	/** Timestamp when the entry should be revalidated (null = never stale) */
	revalidateAfter: number | null;
	/** Tags associated with this entry for invalidation */
	tags: string[];
	/** The cache strategy used (for generating headers on HIT) */
	strategy: CacheStrategy;
}

/**
 * Cache statistics for debugging and monitoring.
 */
export interface CacheStats {
	/** Number of entries in the cache */
	entries: number;
	/** Memory usage in bytes (if available) */
	memoryUsage?: number;
	/** Cache hit rate (if tracked) */
	hitRate?: number;
}

/**
 * Abstract interface for cache storage backends.
 * Implementations must handle serialization/deserialization internally.
 */
export interface CacheStore {
	/** Retrieve an entry by key */
	get(key: string): Promise<CacheEntry | null>;

	/** Store an entry */
	set(key: string, entry: CacheEntry): Promise<void>;

	/** Delete a specific entry */
	delete(key: string): Promise<boolean>;

	/** Delete all entries matching any of the provided tags */
	invalidateByTags(tags: string[]): Promise<number>;

	/** Delete entries by exact path */
	invalidateByPaths(paths: string[]): Promise<number>;

	/** Clear all entries */
	clear(): Promise<void>;

	/** Get cache statistics (optional, for debugging) */
	stats?(): Promise<CacheStats>;
}

/**
 * Configuration for the cache system.
 */
export interface CacheConfig {
	/**
	 * Cache store implementation.
	 * @default 'memory'
	 */
	store?: 'memory' | CacheStore;

	/**
	 * Default cache strategy for pages that don't specify one.
	 * @default 'static'
	 */
	defaultStrategy?: CacheStrategy;

	/**
	 * Whether caching is enabled.
	 * Automatically disabled in dev mode unless explicitly set.
	 * @default true (production), false (development)
	 */
	enabled?: boolean;

	/**
	 * Maximum number of entries in the memory cache before LRU eviction.
	 * Only applies when using the built-in memory store.
	 * @default 1000
	 */
	maxEntries?: number;
}

/**
 * Result of a cache lookup operation.
 */
export interface CacheResult {
	/** The cached HTML content */
	html: string;
	/** Cache status for X-Cache header */
	status: 'hit' | 'miss' | 'stale' | 'expired';
	/** The cache strategy (for generating Cache-Control headers) */
	strategy: CacheStrategy;
}
