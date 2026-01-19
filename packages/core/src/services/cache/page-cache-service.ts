/**
 * Page cache service with ISR (Incremental Static Regeneration) support.
 * Handles stale-while-revalidate semantics and background regeneration.
 * @module
 */

import type { CacheEntry, CacheResult, CacheStore, CacheStrategy } from './cache.types.ts';
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
	 * Generate an ETag from HTML content.
	 */
	private generateEtag(html: string): string {
		let hash = 0;
		for (let i = 0; i < html.length; i++) {
			const char = html.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash |= 0;
		}
		return `"${Math.abs(hash).toString(16)}"`;
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
			etag: this.generateEtag(html),
		};
	}

	/**
	 * Get cached content or create new content with stale-while-revalidate semantics.
	 */
	async getOrCreate(key: string, strategy: CacheStrategy, renderFn: () => Promise<string>): Promise<CacheResult> {
		if (strategy === 'dynamic' || !this.enabled) {
			const html = await renderFn();
			return { html, status: 'miss' };
		}

		const entry = await this.store.get(key);

		if (!entry) {
			const html = await renderFn();
			const newEntry = this.createEntry(html, strategy);
			await this.store.set(key, newEntry);
			return { html, status: 'miss' };
		}

		if (!this.isStale(entry)) {
			return { html: entry.html, status: 'hit' };
		}

		this.regenerateInBackground(key, strategy, renderFn);
		return { html: entry.html, status: 'stale' };
	}

	/**
	 * Regenerate content in the background without blocking the response.
	 * Uses promise deduplication to prevent multiple concurrent regenerations.
	 */
	private regenerateInBackground(key: string, strategy: CacheStrategy, renderFn: () => Promise<string>): void {
		if (this.regenerationPromises.has(key)) {
			return;
		}

		const regeneratePromise = (async () => {
			try {
				const html = await renderFn();
				const newEntry = this.createEntry(html, strategy);
				await this.store.set(key, newEntry);
				return html;
			} finally {
				this.regenerationPromises.delete(key);
			}
		})();

		this.regenerationPromises.set(key, regeneratePromise);

		queueMicrotask(() => {
			regeneratePromise.catch((error) => {
				console.error(`[PageCacheService] Failed to regenerate: ${key}`, error);
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
	 * Get the underlying cache store.
	 */
	getStore(): CacheStore {
		return this.store;
	}
}

/**
 * Generate Cache-Control header value from cache strategy.
 */
export function getCacheControlHeader(strategy: CacheStrategy): string {
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
