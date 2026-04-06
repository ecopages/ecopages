/**
 * Page cache service with ISR (Incremental Static Regeneration) support.
 * Handles stale-while-revalidate semantics and background regeneration.
 * @module
 */

import { appLogger } from '../../global/app-logger.ts';
import type { CacheEntry, CacheResult, CacheStore, CacheStrategy, RenderResult } from './cache.types.ts';
import { MemoryCacheStore } from './memory-cache-store.ts';

export interface PageCacheServiceOptions {
	store?: CacheStore;
	enabled?: boolean;
}

/**
 * Core page caching service with ISR support.
 */
export class PageCacheService {
	private store: CacheStore;
	private enabled: boolean;
	private regenerationPromises = new Map<string, Promise<string>>();

	constructor(options: PageCacheServiceOptions = {}) {
		this.store = options.store ?? new MemoryCacheStore();
		this.enabled = options.enabled ?? true;
	}

	/**
	 * Generate a cache key from URL and optional params.
	 * Uses full URL (path + query) as the key.
	 */
	generateCacheKey(url: string): string {
		return url;
	}

	/**
	 * Check if an entry is stale (past its revalidation time).
	 */
	private isStale(entry: CacheEntry): boolean {
		if (entry.revalidateAfter === null) return false;
		return Date.now() > entry.revalidateAfter;
	}

	/**
	 * Create a cache entry from rendered HTML.
	 */
	private createEntry(html: string, strategy: CacheStrategy): CacheEntry {
		const now = Date.now();

		let revalidateAfter: number | null = null;
		let tags: string[] = [];

		if (strategy === 'static') {
			revalidateAfter = null;
		} else if (strategy === 'dynamic') {
			revalidateAfter = 0;
		} else if (typeof strategy === 'object') {
			revalidateAfter = now + strategy.revalidate * 1000;
			tags = strategy.tags ?? [];
		}

		return {
			html,
			createdAt: now,
			revalidateAfter,
			tags,
			strategy,
		};
	}

	/**
	 * Get cached content or create new content with stale-while-revalidate semantics.
	 * @param key - Cache key (URL path + query)
	 * @param defaultStrategy - Default strategy if page doesn't specify one
	 * @param renderFn - Function that renders the page and returns HTML + strategy
	 */
	async getOrCreate(
		key: string,
		defaultStrategy: CacheStrategy,
		renderFn: () => Promise<RenderResult>,
	): Promise<CacheResult> {
		if (!this.enabled) {
			const { html, strategy } = await renderFn();
			return { html, status: 'miss', strategy };
		}

		const entry = await this.store.get(key);

		if (!entry) {
			const { html, strategy } = await renderFn();
			const effectiveStrategy = strategy ?? defaultStrategy;

			if (effectiveStrategy === 'dynamic') {
				return { html, status: 'miss', strategy: effectiveStrategy };
			}

			const newEntry = this.createEntry(html, effectiveStrategy);
			await this.store.set(key, newEntry);
			return { html, status: 'miss', strategy: effectiveStrategy };
		}

		if (!this.isStale(entry)) {
			return { html: entry.html, status: 'hit', strategy: entry.strategy };
		}

		this.regenerateInBackground(key, entry.strategy, renderFn);
		return { html: entry.html, status: 'stale', strategy: entry.strategy };
	}

	/**
	 * Regenerate content in the background without blocking the response.
	 * Uses promise deduplication to prevent multiple concurrent regenerations.
	 */
	private regenerateInBackground(
		key: string,
		fallbackStrategy: CacheStrategy,
		renderFn: () => Promise<{ html: string; strategy: CacheStrategy }>,
	): void {
		if (this.regenerationPromises.has(key)) {
			return;
		}

		const regeneratePromise = (async () => {
			try {
				const { html, strategy } = await renderFn();
				const effectiveStrategy = strategy ?? fallbackStrategy;
				const newEntry = this.createEntry(html, effectiveStrategy);
				await this.store.set(key, newEntry);
				return html;
			} finally {
				this.regenerationPromises.delete(key);
			}
		})();

		this.regenerationPromises.set(key, regeneratePromise);

		queueMicrotask(() => {
			regeneratePromise.catch((error) => {
				appLogger.error(`[PageCacheService] Failed to regenerate: ${key}`, error);
			});
		});
	}

	/**
	 * Invalidate cache entries by tags.
	 */
	async invalidateByTags(tags: string[]): Promise<number> {
		return this.store.invalidateByTags(tags);
	}

	/**
	 * Invalidate cache entries by paths.
	 */
	async invalidateByPaths(paths: string[]): Promise<number> {
		return this.store.invalidateByPaths(paths);
	}

	/**
	 * Clear all cached entries.
	 */
	async clear(): Promise<void> {
		return this.store.clear();
	}

	/**
	 * Get cache statistics.
	 */
	async stats() {
		return this.store.stats?.() ?? { entries: 0 };
	}

	/**
	 * Get the underlying cache store.
	 */
	getStore(): CacheStore {
		return this.store;
	}
}

/**
 * Generate Cache-Control header value from cache strategy.
 */
export function getCacheControlHeader(strategy: CacheStrategy | 'disabled'): string {
	if (strategy === 'disabled') {
		return 'no-store, must-revalidate';
	}
	if (strategy === 'static') {
		return 'public, max-age=31536000, immutable';
	}

	if (strategy === 'dynamic') {
		return 'no-store, must-revalidate';
	}

	if (typeof strategy === 'object') {
		const swr = strategy.revalidate * 2;
		return `public, max-age=${strategy.revalidate}, stale-while-revalidate=${swr}`;
	}

	return 'no-store';
}
