import type { CacheEntry, CacheStats, CacheStore } from './cache.types.ts';
import { MemoryCacheStore } from './memory-cache-store.ts';

/**
 * Memory cache store that only accepts an explicit set of keys.
 *
 * @remarks
 * Used in watch mode so only processor-declared prewarm pathnames retain HTML.
 * Unlisted keys always miss and never write.
 */
export class AllowlistedMemoryCacheStore implements CacheStore {
	private readonly inner: MemoryCacheStore;
	private readonly allowedKeys = new Set<string>();

	constructor(options?: { maxEntries?: number }) {
		this.inner = new MemoryCacheStore(options);
	}

	/**
	 * Replaces the set of keys that may be stored or retrieved.
	 */
	registerAllowedKeys(keys: readonly string[]): void {
		this.allowedKeys.clear();
		for (const key of keys) {
			this.allowedKeys.add(key);
		}
	}

	async get(key: string): Promise<CacheEntry | null> {
		if (!this.allowedKeys.has(key)) {
			return null;
		}
		return this.inner.get(key);
	}

	async set(key: string, entry: CacheEntry): Promise<void> {
		if (!this.allowedKeys.has(key)) {
			return;
		}
		await this.inner.set(key, entry);
	}

	async delete(key: string): Promise<boolean> {
		return this.inner.delete(key);
	}

	async invalidateByTags(tags: string[]): Promise<number> {
		return this.inner.invalidateByTags(tags);
	}

	async invalidateByPaths(paths: string[]): Promise<number> {
		return this.inner.invalidateByPaths(paths);
	}

	async clear(): Promise<void> {
		await this.inner.clear();
	}

	async stats(): Promise<CacheStats> {
		return (await this.inner.stats?.()) ?? { entries: 0 };
	}
}
