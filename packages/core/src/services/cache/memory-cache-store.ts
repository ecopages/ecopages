/**
 * In-memory cache store with LRU eviction.
 * Suitable for single-instance deployments and development.
 * @module
 */

import type { CacheEntry, CacheStats, CacheStore } from './cache.types.ts';

export interface MemoryCacheStoreOptions {
	/** Maximum number of entries before LRU eviction. @default 1000 */
	maxEntries?: number;
}

/**
 * Simple in-memory cache store with LRU eviction.
 * Uses Map insertion order for LRU tracking.
 */
export class MemoryCacheStore implements CacheStore {
	private cache = new Map<string, CacheEntry>();
	private tagIndex = new Map<string, Set<string>>();
	private readonly maxEntries: number;

	constructor(options: MemoryCacheStoreOptions = {}) {
		this.maxEntries = options.maxEntries ?? 1000;
	}

	/**
	 * Retrieve an entry by key.
	 * Uses Map's insertion order for LRU tracking - accessed entries are
	 * deleted and re-inserted to move them to the "most recently used" position.
	 */
	async get(key: string): Promise<CacheEntry | null> {
		const entry = this.cache.get(key);
		if (!entry) return null;

		this.cache.delete(key);
		this.cache.set(key, entry);

		return entry;
	}

	/**
	 * Store an entry, evicting the oldest if at capacity.
	 * When maxEntries is reached and a new key is added, the first key in
	 * the Map (oldest/least-recently-used) is evicted to make room.
	 */
	async set(key: string, entry: CacheEntry): Promise<void> {
		if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
			const oldestKey = this.cache.keys().next().value;
			if (oldestKey) await this.delete(oldestKey);
		}

		this.cache.set(key, entry);

		for (const tag of entry.tags) {
			if (!this.tagIndex.has(tag)) {
				this.tagIndex.set(tag, new Set());
			}
			this.tagIndex.get(tag)!.add(key);
		}
	}

	/**
	 * Delete an entry and clean up its tag index references.
	 * Removes empty tag sets to prevent memory leaks from accumulated tags.
	 */
	async delete(key: string): Promise<boolean> {
		const entry = this.cache.get(key);
		if (!entry) return false;

		for (const tag of entry.tags) {
			this.tagIndex.get(tag)?.delete(key);
			if (this.tagIndex.get(tag)?.size === 0) {
				this.tagIndex.delete(tag);
			}
		}

		return this.cache.delete(key);
	}

	async invalidateByTags(tags: string[]): Promise<number> {
		let count = 0;
		for (const tag of tags) {
			const keys = this.tagIndex.get(tag);
			if (keys) {
				for (const key of keys) {
					if (this.cache.delete(key)) count++;
				}
				this.tagIndex.delete(tag);
			}
		}
		return count;
	}

	async invalidateByPaths(paths: string[]): Promise<number> {
		let count = 0;
		for (const path of paths) {
			if (await this.delete(path)) count++;
		}
		return count;
	}

	async clear(): Promise<void> {
		this.cache.clear();
		this.tagIndex.clear();
	}

	async stats(): Promise<CacheStats> {
		return {
			entries: this.cache.size,
		};
	}
}
