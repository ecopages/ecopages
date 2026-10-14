/**
 * Page cache service with ISR (Incremental Static Regeneration) support.
 * Handles stale-while-revalidate semantics and background regeneration.
 * @module
 */

import path from 'node:path';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { CacheEntry, CacheResult, CacheStore, CacheStrategy, RenderResult } from './cache.types.ts';
import { MemoryCacheStore } from './memory-cache-store.ts';
import { BuildInputDependencyIndex, type BuildInputBinding } from '../../build/cache/build-input-dependency-index.ts';

function htmlCacheBinding(cacheKey: string): BuildInputBinding {
	return { consumer: 'html-cache', key: cacheKey };
}

function cacheKeyPath(key: string): string {
	const separator = key.search(/[?#]/);
	return separator === -1 ? key : key.slice(0, separator);
}

type PageCacheInvalidationScope =
	| { type: 'all' }
	| { type: 'paths'; values: readonly string[] }
	| { type: 'sourcePaths'; values: readonly string[] }
	| { type: 'tags'; values: readonly string[] };

interface PageCacheWriteScope {
	key: string;
	tags: readonly string[];
	sourcePaths: readonly string[];
}

/**
 * Coordinates cache reads and writes with invalidations.
 *
 * @remarks
 * An invalidation advances the generation before waiting for in-flight writes. Renders that began
 * under an older generation cannot repopulate an entry after the invalidation completes. Writes
 * for unrelated entries remain concurrent.
 */
class PageCacheMutationGate {
	private generationValue = 0;
	private pendingInvalidations = 0;
	private invalidationsDrained: Promise<void> = Promise.resolve();
	private releaseInvalidations: (() => void) | undefined;
	private invalidationQueue: Promise<void> = Promise.resolve();
	private activeWrites = 0;
	private writesDrained: Promise<void> = Promise.resolve();
	private releaseWrites: (() => void) | undefined;
	private clearGeneration = 0;
	private pathGenerations = new Map<string, number>();
	private sourcePathGenerations = new Map<string, number>();
	private tagGenerations = new Map<string, number>();

	get generation(): number {
		return this.generationValue;
	}

	async read<T>(operation: (generation: number) => Promise<T>): Promise<T> {
		while (true) {
			while (this.pendingInvalidations > 0) {
				await this.invalidationsDrained;
			}

			const generation = this.generationValue;
			const value = await operation(generation);
			if (this.pendingInvalidations === 0 && generation === this.generationValue) {
				return value;
			}
		}
	}

	async write(generation: number, scope: PageCacheWriteScope, operation: () => Promise<void>): Promise<void> {
		while (this.pendingInvalidations > 0) {
			await this.invalidationsDrained;
		}

		if (!this.canWrite(generation, scope)) {
			return;
		}

		if (this.activeWrites === 0) {
			this.writesDrained = new Promise<void>((resolve) => {
				this.releaseWrites = resolve;
			});
		}
		this.activeWrites += 1;

		try {
			await operation();
		} finally {
			this.activeWrites -= 1;
			if (this.activeWrites === 0) {
				this.releaseWrites?.();
				this.releaseWrites = undefined;
				this.writesDrained = Promise.resolve();
			}
		}
	}

	invalidate<T>(scope: PageCacheInvalidationScope, operation: () => Promise<T>): Promise<T> {
		if (this.pendingInvalidations === 0) {
			this.invalidationsDrained = new Promise<void>((resolve) => {
				this.releaseInvalidations = resolve;
			});
		}
		this.pendingInvalidations += 1;
		const generation = ++this.generationValue;
		this.recordInvalidation(scope, generation);

		const result = this.invalidationQueue.then(async () => {
			if (this.activeWrites > 0) {
				await this.writesDrained;
			}
			return operation();
		});
		this.invalidationQueue = result.then(
			() => undefined,
			() => undefined,
		);

		return result.finally(() => {
			this.pendingInvalidations -= 1;
			if (this.pendingInvalidations === 0) {
				this.releaseInvalidations?.();
				this.releaseInvalidations = undefined;
				this.invalidationsDrained = Promise.resolve();
			}
		});
	}

	private canWrite(generation: number, scope: PageCacheWriteScope): boolean {
		if (this.clearGeneration > generation) {
			return false;
		}

		const pathGeneration = this.pathGenerations.get(cacheKeyPath(scope.key)) ?? 0;
		if (pathGeneration > generation) {
			return false;
		}

		if (scope.tags.some((tag) => (this.tagGenerations.get(tag) ?? 0) > generation)) {
			return false;
		}

		return !scope.sourcePaths.some(
			(sourcePath) => (this.sourcePathGenerations.get(path.resolve(sourcePath)) ?? 0) > generation,
		);
	}

	private recordInvalidation(scope: PageCacheInvalidationScope, generation: number): void {
		if (scope.type === 'all') {
			this.clearGeneration = generation;
			return;
		}

		const generations =
			scope.type === 'paths'
				? this.pathGenerations
				: scope.type === 'sourcePaths'
					? this.sourcePathGenerations
					: this.tagGenerations;
		for (const value of scope.values) {
			const key =
				scope.type === 'paths'
					? cacheKeyPath(value)
					: scope.type === 'sourcePaths'
						? path.resolve(value)
						: value;
			generations.set(key, generation);
		}
	}
}

export interface PageCacheServiceOptions {
	store?: CacheStore;
	enabled?: boolean;
	dependencyIndex?: BuildInputDependencyIndex;
}

/**
 * Core page caching service with ISR support.
 */
export class PageCacheService {
	private store: CacheStore;
	private enabled: boolean;
	private readonly dependencyIndex: BuildInputDependencyIndex;
	private regenerationPromises = new Map<string, Promise<string>>();
	private missPromises = new Map<string, { generation: number; promise: Promise<CacheResult> }>();
	private readonly mutationGate = new PageCacheMutationGate();

	constructor(options: PageCacheServiceOptions = {}) {
		this.store = options.store ?? new MemoryCacheStore();
		this.enabled = options.enabled ?? true;
		this.dependencyIndex = options.dependencyIndex ?? new BuildInputDependencyIndex();
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
		options?: { sourceDependencyPaths?: readonly string[] },
	): Promise<CacheResult> {
		if (!this.enabled) {
			const { html, strategy } = await renderFn();
			return { html, status: 'miss', strategy };
		}

		const generation = this.mutationGate.generation;
		const pendingMiss = this.missPromises.get(key);
		if (pendingMiss?.generation === generation) {
			return pendingMiss.promise;
		}

		const missPromise = this.resolveOrCreate(key, defaultStrategy, renderFn, options).finally(() => {
			if (this.missPromises.get(key)?.promise === missPromise) {
				this.missPromises.delete(key);
			}
		});

		this.missPromises.set(key, { generation, promise: missPromise });
		return missPromise;
	}

	private async resolveOrCreate(
		key: string,
		defaultStrategy: CacheStrategy,
		renderFn: () => Promise<RenderResult>,
		options?: { sourceDependencyPaths?: readonly string[] },
	): Promise<CacheResult> {
		const { entry, generation } = await this.mutationGate.read(async (readGeneration) => ({
			entry: await this.store.get(key),
			generation: readGeneration,
		}));

		if (!entry) {
			const { html, strategy, sourceDependencyPaths } = await renderFn();
			const effectiveStrategy = strategy ?? defaultStrategy;

			if (effectiveStrategy === 'dynamic') {
				return { html, status: 'miss', strategy: effectiveStrategy };
			}

			const newEntry = this.createEntry(html, effectiveStrategy);
			const dependencyPaths = [
				...new Set([...(options?.sourceDependencyPaths ?? []), ...(sourceDependencyPaths ?? [])]),
			];
			await this.mutationGate.write(
				generation,
				{ key, tags: newEntry.tags, sourcePaths: dependencyPaths },
				async () => {
					this.unregisterDeletedKeys(await this.store.set(key, newEntry));
					this.registerDependencyPaths(key, dependencyPaths, undefined);
				},
			);
			return { html, status: 'miss', strategy: effectiveStrategy };
		}

		if (!this.isStale(entry)) {
			return { html: entry.html, status: 'hit', strategy: entry.strategy };
		}

		this.regenerateInBackground(key, entry.strategy, renderFn, generation, options?.sourceDependencyPaths);
		return { html: entry.html, status: 'stale', strategy: entry.strategy };
	}

	private registerDependencyPaths(
		key: string,
		initialPaths: readonly string[] | undefined,
		renderedPaths: readonly string[] | undefined,
	): void {
		const mergedPaths = new Set<string>();
		for (const sourcePath of initialPaths ?? []) {
			mergedPaths.add(sourcePath);
		}
		for (const sourcePath of renderedPaths ?? []) {
			mergedPaths.add(sourcePath);
		}

		if (mergedPaths.size > 0) {
			this.dependencyIndex.register(htmlCacheBinding(key), [...mergedPaths]);
		}
	}

	/**
	 * Regenerate content in the background without blocking the response.
	 * Uses promise deduplication to prevent multiple concurrent regenerations.
	 */
	private regenerateInBackground(
		key: string,
		fallbackStrategy: CacheStrategy,
		renderFn: () => Promise<RenderResult>,
		generation: number,
		initialSourceDependencyPaths: readonly string[] | undefined,
	): void {
		if (this.regenerationPromises.has(key)) {
			return;
		}

		const regeneratePromise = (async () => {
			try {
				const { html, strategy, sourceDependencyPaths } = await renderFn();
				const effectiveStrategy = strategy ?? fallbackStrategy;
				const newEntry = this.createEntry(html, effectiveStrategy);
				const dependencyPaths = [
					...new Set([...(initialSourceDependencyPaths ?? []), ...(sourceDependencyPaths ?? [])]),
				];
				await this.mutationGate.write(
					generation,
					{ key, tags: newEntry.tags, sourcePaths: dependencyPaths },
					async () => {
						this.unregisterDeletedKeys(await this.store.set(key, newEntry));
						this.registerDependencyPaths(key, dependencyPaths, undefined);
					},
				);
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
		return this.mutationGate.invalidate({ type: 'tags', values: tags }, async () =>
			this.unregisterDeletedKeys(await this.store.invalidateByTags(tags)),
		);
	}

	/**
	 * Invalidate cache entries by paths.
	 */
	async invalidateByPaths(paths: string[]): Promise<number> {
		return this.mutationGate.invalidate({ type: 'paths', values: paths }, async () =>
			this.unregisterDeletedKeys(await this.store.invalidateByPaths(paths)),
		);
	}

	private unregisterDeletedKeys(keys: readonly string[]): number {
		for (const key of keys) {
			this.dependencyIndex.unregister(htmlCacheBinding(key));
		}

		return keys.length;
	}

	private async delete(key: string): Promise<boolean> {
		const deleted = await this.store.delete(key);
		this.dependencyIndex.unregister(htmlCacheBinding(key));
		return deleted;
	}

	/**
	 * Invalidates cached HTML entries that registered the given source paths.
	 */
	async invalidateBySourceDependencyPaths(sourcePaths: readonly string[]): Promise<number> {
		return this.mutationGate.invalidate({ type: 'sourcePaths', values: sourcePaths }, async () => {
			const cacheKeys = new Set<string>();
			for (const sourcePath of sourcePaths) {
				for (const cacheKey of this.dependencyIndex.resolveKeys('html-cache', sourcePath)) {
					cacheKeys.add(cacheKey);
				}
			}
			let count = 0;

			for (const cacheKey of cacheKeys) {
				if (await this.delete(cacheKey)) {
					count += 1;
				}
			}

			return count;
		});
	}

	/**
	 * Clear all cached entries.
	 */
	async clear(): Promise<void> {
		return this.mutationGate.invalidate({ type: 'all' }, async () => {
			this.dependencyIndex.clearConsumer('html-cache');
			await this.store.clear();
		});
	}

	/**
	 * Get cache statistics.
	 */
	async stats() {
		return this.store.stats?.() ?? { entries: 0 };
	}
}

/**
 * Generate Cache-Control header value from cache strategy.
 *
 * @remarks
 * `'static'` HTML is revalidated with ETag (`max-age=0, must-revalidate`).
 * `immutable` belongs on content-hashed asset URLs, not on HTML.
 */
export function getCacheControlHeader(strategy: CacheStrategy | 'disabled'): string {
	if (strategy === 'disabled') {
		return 'no-store, must-revalidate';
	}
	if (strategy === 'static') {
		return 'public, max-age=0, must-revalidate';
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

const pageCacheByAppConfig = new WeakMap<EcoPagesAppConfig, PageCacheService>();

/**
 * Registers the page cache service for one app config instance.
 */
export function registerAppPageCacheService(appConfig: EcoPagesAppConfig, service: PageCacheService | null): void {
	if (service) {
		pageCacheByAppConfig.set(appConfig, service);
		return;
	}

	pageCacheByAppConfig.delete(appConfig);
}

/**
 * Returns the registered page cache service for one app config, if any.
 */
export function getAppPageCacheService(appConfig: EcoPagesAppConfig): PageCacheService | null {
	return pageCacheByAppConfig.get(appConfig) ?? null;
}

/**
 * Clears rendered HTML cache entries for one app during development invalidation.
 */
export async function clearAppPageCache(appConfig: EcoPagesAppConfig): Promise<void> {
	await getAppPageCacheService(appConfig)?.clear();
}

/**
 * Invalidates rendered HTML cache entries that depend on the given source paths.
 */
export async function invalidateAppPageCacheBySourcePaths(
	appConfig: EcoPagesAppConfig,
	sourcePaths: readonly string[],
): Promise<number> {
	return (await getAppPageCacheService(appConfig)?.invalidateBySourceDependencyPaths(sourcePaths)) ?? 0;
}
