/**
 * Unit tests for PageCacheService
 */

import path from 'node:path';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { PageCacheService, getCacheControlHeader } from './page-cache-service.js';
import { MemoryCacheStore } from './memory-cache-store.js';
import { BuildInputDependencyIndex } from '../build/cache/build-input-dependency-index.js';
import type { CacheStore } from './cache.types.js';

describe('PageCacheService', () => {
	let service: PageCacheService;
	let store: MemoryCacheStore;
	let dependencyIndex: BuildInputDependencyIndex;

	beforeEach(() => {
		store = new MemoryCacheStore();
		dependencyIndex = new BuildInputDependencyIndex();
		service = new PageCacheService({ store, dependencyIndex });
	});

	describe('getOrCreate', () => {
		test('should return miss and render on cache miss', async () => {
			const renderFn = vi.fn().mockResolvedValue({ html: '<html>hello</html>', strategy: 'static' as const });

			const result = await service.getOrCreate('/page', 'static', renderFn);

			expect(result.status).toBe('miss');
			expect(result.html).toBe('<html>hello</html>');
			expect(result.strategy).toBe('static');
			expect(renderFn).toHaveBeenCalledTimes(1);
		});

		test('should return hit on cache hit', async () => {
			const renderFn = vi.fn().mockResolvedValue({ html: '<html>hello</html>', strategy: 'static' as const });

			await service.getOrCreate('/page', 'static', renderFn);

			renderFn.mockClear();
			const result = await service.getOrCreate('/page', 'static', renderFn);

			expect(result.status).toBe('hit');
			expect(result.html).toBe('<html>hello</html>');
			expect(result.strategy).toBe('static');
			expect(renderFn).not.toHaveBeenCalled();
		});

		test('should bypass cache for dynamic strategy', async () => {
			const renderFn = vi.fn().mockResolvedValue({ html: '<html>hello</html>', strategy: 'dynamic' as const });

			const result1 = await service.getOrCreate('/page', 'dynamic', renderFn);
			const result2 = await service.getOrCreate('/page', 'dynamic', renderFn);

			expect(result1.status).toBe('miss');
			expect(result2.status).toBe('miss');
			expect(renderFn).toHaveBeenCalledTimes(2);
		});

		test('should return stale when entry is past revalidation time', async () => {
			const revalidateStrategy = { revalidate: 60 };
			const renderFn = vi.fn().mockResolvedValue({ html: '<html>v1</html>', strategy: revalidateStrategy });

			const staleEntry = {
				html: '<html>stale</html>',
				createdAt: Date.now() - 120000,
				revalidateAfter: Date.now() - 60000,
				tags: [],
				strategy: revalidateStrategy,
			};
			await store.set('/stale-page', staleEntry);

			const result = await service.getOrCreate('/stale-page', { revalidate: 60 }, renderFn);
			expect(result.status).toBe('stale');
			expect(result.html).toBe('<html>stale</html>');
		});

		test('should deduplicate concurrent regeneration requests', async () => {
			let callCount = 0;
			const renderFn = vi.fn().mockImplementation(async () => {
				callCount++;
				await new Promise((resolve) => setTimeout(resolve, 10));
				return { html: `<html>v${callCount}</html>`, strategy: { revalidate: 60 } };
			});

			const staleEntry = {
				html: '<html>stale</html>',
				createdAt: Date.now() - 120000,
				revalidateAfter: Date.now() - 60000,
				tags: [],
				strategy: { revalidate: 60 },
			};
			await store.set('/dedup-page', staleEntry);

			const results = await Promise.all([
				service.getOrCreate('/dedup-page', { revalidate: 60 }, renderFn),
				service.getOrCreate('/dedup-page', { revalidate: 60 }, renderFn),
				service.getOrCreate('/dedup-page', { revalidate: 60 }, renderFn),
			]);

			for (const result of results) {
				expect(result.status).toBe('stale');
				expect(result.html).toBe('<html>stale</html>');
			}

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(renderFn).toHaveBeenCalledTimes(1);
		});
	});

	describe('invalidation', () => {
		test('should keep replacement dependency bindings when a store invalidation completes late', async () => {
			const backingStore = new MemoryCacheStore();
			let signalInvalidationStarted: () => void = () => undefined;
			const invalidationStarted = new Promise<void>((resolve) => {
				signalInvalidationStarted = resolve;
			});
			let releaseInvalidation: () => void = () => undefined;
			const invalidationGate = new Promise<void>((resolve) => {
				releaseInvalidation = resolve;
			});
			const customGet = vi.fn((key: string) => backingStore.get(key));
			const customStore: CacheStore = {
				get: customGet,
				set: (key, entry) => backingStore.set(key, entry),
				delete: (key) => backingStore.delete(key),
				invalidateByTags: async (tags) => {
					const removedKeys = await backingStore.invalidateByTags(tags);
					signalInvalidationStarted();
					await invalidationGate;
					return removedKeys;
				},
				invalidateByPaths: (paths) => backingStore.invalidateByPaths(paths),
				clear: () => backingStore.clear(),
				stats: () => backingStore.stats(),
			};
			const replacementDependencyIndex = new BuildInputDependencyIndex();
			const replacementService = new PageCacheService({
				store: customStore,
				dependencyIndex: replacementDependencyIndex,
			});
			const oldSourcePath = '/src/old.astro';
			const newSourcePath = '/src/new.astro';
			const newRender = vi.fn().mockResolvedValue({
				html: '<html>new</html>',
				strategy: { revalidate: 60, tags: ['page'] },
				sourceDependencyPaths: [newSourcePath],
			});

			await replacementService.getOrCreate('/page', { revalidate: 60, tags: ['page'] }, async () => ({
				html: '<html>old</html>',
				strategy: { revalidate: 60, tags: ['page'] },
				sourceDependencyPaths: [oldSourcePath],
			}));

			const invalidation = replacementService.invalidateByTags(['page']);
			await invalidationStarted;
			const replacement = replacementService.getOrCreate('/page', 'static', newRender);

			expect(customGet).toHaveBeenCalledTimes(1);
			releaseInvalidation();
			await Promise.all([invalidation, replacement]);

			expect(newRender).toHaveBeenCalledTimes(1);
			expect(customGet).toHaveBeenCalledTimes(2);
			expect(replacementDependencyIndex.resolveKeys('html-cache', oldSourcePath)).toEqual([]);
			expect(replacementDependencyIndex.resolveKeys('html-cache', newSourcePath)).toEqual(['/page']);
		});

		test('should not cache a render that started before source invalidation', async () => {
			let signalRenderStarted: () => void = () => undefined;
			const renderStarted = new Promise<void>((resolve) => {
				signalRenderStarted = resolve;
			});
			let completeRender: (result: {
				html: string;
				strategy: 'static';
				sourceDependencyPaths: string[];
			}) => void = () => undefined;
			const renderResult = new Promise<{ html: string; strategy: 'static'; sourceDependencyPaths: string[] }>(
				(resolve) => {
					completeRender = resolve;
				},
			);
			const oldSourcePath = 'src/pending-old.astro';
			const newSourcePath = '/src/pending-new.astro';
			const pendingRender = service.getOrCreate('/pending', 'static', () => {
				signalRenderStarted();
				return renderResult;
			});

			await renderStarted;
			expect(await service.invalidateBySourceDependencyPaths([path.resolve(oldSourcePath)])).toBe(0);
			const freshRender = vi.fn().mockResolvedValue({
				html: '<html>fresh render</html>',
				strategy: 'static',
				sourceDependencyPaths: [newSourcePath],
			});
			const freshResult = await service.getOrCreate('/pending', 'static', freshRender);
			completeRender?.({
				html: '<html>rendered before invalidation</html>',
				strategy: 'static',
				sourceDependencyPaths: [oldSourcePath],
			});
			await pendingRender;

			expect(freshResult.html).toBe('<html>fresh render</html>');
			expect(freshRender).toHaveBeenCalledTimes(1);
			expect((await store.get('/pending'))?.html).toBe('<html>fresh render</html>');
			expect(dependencyIndex.resolveKeys('html-cache', oldSourcePath)).toEqual([]);
			expect(dependencyIndex.resolveKeys('html-cache', newSourcePath)).toEqual(['/pending']);
		});

		test('should not cache a background regeneration invalidated through its initial source paths', async () => {
			const sourcePath = '/src/stale-page.astro';
			const strategy = { revalidate: 60, tags: [] };
			await service.getOrCreate(
				'/stale-page',
				strategy,
				async () => ({ html: '<html>initial</html>', strategy }),
				{ sourceDependencyPaths: [sourcePath] },
			);
			await store.set('/stale-page', {
				html: '<html>stale</html>',
				createdAt: 0,
				revalidateAfter: 0,
				tags: [],
				strategy,
			});

			let signalRenderStarted: () => void = () => undefined;
			const renderStarted = new Promise<void>((resolve) => {
				signalRenderStarted = resolve;
			});
			let completeRender: (result: { html: string; strategy: typeof strategy }) => void = () => undefined;
			const renderResult = new Promise<{ html: string; strategy: typeof strategy }>((resolve) => {
				completeRender = resolve;
			});
			const staleResult = await service.getOrCreate(
				'/stale-page',
				strategy,
				() => {
					signalRenderStarted();
					return renderResult;
				},
				{ sourceDependencyPaths: [sourcePath] },
			);

			expect(staleResult.status).toBe('stale');
			await renderStarted;
			expect(await service.invalidateBySourceDependencyPaths([sourcePath])).toBe(1);
			completeRender({ html: '<html>rendered before invalidation</html>', strategy });
			await Promise.resolve();

			expect(await store.get('/stale-page')).toBeNull();
		});

		test('should keep an unrelated in-flight render when a path is invalidated', async () => {
			let signalRenderStarted: () => void = () => undefined;
			const renderStarted = new Promise<void>((resolve) => {
				signalRenderStarted = resolve;
			});
			let completeRender: (result: {
				html: string;
				strategy: 'static';
				sourceDependencyPaths: string[];
			}) => void = () => undefined;
			const renderResult = new Promise<{ html: string; strategy: 'static'; sourceDependencyPaths: string[] }>(
				(resolve) => {
					completeRender = resolve;
				},
			);
			const sourcePath = '/src/unrelated.astro';
			const pendingRender = service.getOrCreate('/unrelated', 'static', () => {
				signalRenderStarted();
				return renderResult;
			});

			await renderStarted;
			expect(await service.invalidateByPaths(['/other'])).toBe(0);
			completeRender({
				html: '<html>unrelated render</html>',
				strategy: 'static',
				sourceDependencyPaths: [sourcePath],
			});
			await pendingRender;

			expect((await store.get('/unrelated'))?.html).toBe('<html>unrelated render</html>');
			expect(dependencyIndex.resolveKeys('html-cache', sourcePath)).toEqual(['/unrelated']);
		});

		test.each([
			{ scope: 'query path', key: '/self?locale=en' },
			{ scope: 'fragment path', key: '/self#__eco_rt=3' },
			{ scope: 'tag', key: '/self' },
			{ scope: 'clear', key: '/self' },
		] as const)('should discard a render invalidated by its own $scope scope', async ({ scope, key }) => {
			let signalRenderStarted: () => void = () => undefined;
			const renderStarted = new Promise<void>((resolve) => {
				signalRenderStarted = resolve;
			});
			let completeRender: (result: {
				html: string;
				strategy: { revalidate: number; tags: string[] };
				sourceDependencyPaths: string[];
			}) => void = () => undefined;
			const renderResult = new Promise<{
				html: string;
				strategy: { revalidate: number; tags: string[] };
				sourceDependencyPaths: string[];
			}>((resolve) => {
				completeRender = resolve;
			});
			const sourcePath = '/src/self.astro';
			const pendingRender = service.getOrCreate(key, { revalidate: 60, tags: ['self'] }, () => {
				signalRenderStarted();
				return renderResult;
			});

			await renderStarted;
			if (scope === 'query path' || scope === 'fragment path') {
				await service.invalidateByPaths(['/self']);
			} else if (scope === 'tag') {
				await service.invalidateByTags(['self']);
			} else {
				await service.clear();
			}
			completeRender({
				html: '<html>invalidated render</html>',
				strategy: { revalidate: 60, tags: ['self'] },
				sourceDependencyPaths: [sourcePath],
			});
			await pendingRender;

			expect(await store.get(key)).toBeNull();
			expect(dependencyIndex.resolveKeys('html-cache', sourcePath)).toEqual([]);
		});

		test('should release dependency bindings for LRU-evicted entries', async () => {
			const boundedStore = new MemoryCacheStore({ maxEntries: 1 });
			const boundedDependencyIndex = new BuildInputDependencyIndex();
			const boundedService = new PageCacheService({
				store: boundedStore,
				dependencyIndex: boundedDependencyIndex,
			});
			const firstSourcePath = '/src/first.astro';
			const secondSourcePath = '/src/second.astro';

			await boundedService.getOrCreate('/first', 'static', async () => ({
				html: '<html>first</html>',
				strategy: 'static',
				sourceDependencyPaths: [firstSourcePath],
			}));
			await boundedService.getOrCreate('/second', 'static', async () => ({
				html: '<html>second</html>',
				strategy: 'static',
				sourceDependencyPaths: [secondSourcePath],
			}));

			expect(boundedDependencyIndex.resolveKeys('html-cache', firstSourcePath)).toEqual([]);
			expect(boundedDependencyIndex.resolveKeys('html-cache', secondSourcePath)).toEqual(['/second']);
		});

		test('should release dependency bindings for keys removed by a custom store', async () => {
			const customBackingStore = new MemoryCacheStore();
			const customStore: CacheStore = {
				get: (key) => customBackingStore.get(key),
				set: (key, entry) => customBackingStore.set(key, entry),
				delete: (key) => customBackingStore.delete(key),
				invalidateByTags: (tags) => customBackingStore.invalidateByTags(tags),
				invalidateByPaths: (paths) => customBackingStore.invalidateByPaths(paths),
				clear: () => customBackingStore.clear(),
				stats: () => customBackingStore.stats(),
			};
			const customDependencyIndex = new BuildInputDependencyIndex();
			const customService = new PageCacheService({ store: customStore, dependencyIndex: customDependencyIndex });
			const sourcePath = '/src/custom/1.astro';

			await customService.getOrCreate('/custom/1', { revalidate: 60, tags: ['custom'] }, async () => ({
				html: '<html>custom</html>',
				strategy: { revalidate: 60, tags: ['custom'] },
				sourceDependencyPaths: [sourcePath],
			}));

			expect(customDependencyIndex.resolveKeys('html-cache', sourcePath)).toEqual(['/custom/1']);
			expect(await customService.invalidateByTags(['custom'])).toBe(1);
			expect(customDependencyIndex.resolveKeys('html-cache', sourcePath)).toEqual([]);
		});

		test('should finish writes already in flight before invalidating', async () => {
			const backingStore = new MemoryCacheStore();
			let signalWriteStarted: () => void = () => undefined;
			const writeStarted = new Promise<void>((resolve) => {
				signalWriteStarted = resolve;
			});
			let releaseWrite: () => void = () => undefined;
			const writeGate = new Promise<void>((resolve) => {
				releaseWrite = resolve;
			});
			const invalidateByPaths = vi.fn((paths: string[]) => backingStore.invalidateByPaths(paths));
			const delayedStore: CacheStore = {
				get: (key) => backingStore.get(key),
				set: async (key, entry) => {
					signalWriteStarted();
					await writeGate;
					return backingStore.set(key, entry);
				},
				delete: (key) => backingStore.delete(key),
				invalidateByTags: (tags) => backingStore.invalidateByTags(tags),
				invalidateByPaths,
				clear: () => backingStore.clear(),
				stats: () => backingStore.stats(),
			};
			const delayedDependencyIndex = new BuildInputDependencyIndex();
			const delayedService = new PageCacheService({
				store: delayedStore,
				dependencyIndex: delayedDependencyIndex,
			});
			const sourcePath = '/src/in-flight.astro';
			const pendingWrite = delayedService.getOrCreate('/in-flight', 'static', async () => ({
				html: '<html>pending write</html>',
				strategy: 'static',
				sourceDependencyPaths: [sourcePath],
			}));

			await writeStarted;
			const invalidation = delayedService.invalidateByPaths(['/in-flight']);
			await Promise.resolve();
			expect(invalidateByPaths).not.toHaveBeenCalled();
			releaseWrite();
			await Promise.all([pendingWrite, invalidation]);

			expect(invalidateByPaths).toHaveBeenCalledTimes(1);
			expect(await backingStore.stats()).toEqual({ entries: 0 });
			expect(delayedDependencyIndex.resolveKeys('html-cache', sourcePath)).toEqual([]);
		});

		test('should invalidate by tags', async () => {
			const strategy = { revalidate: 3600, tags: ['blog'] };
			const sourcePath = '/src/blog/1.astro';
			const renderFn = vi.fn().mockResolvedValue({
				html: '<html>hello</html>',
				strategy,
				sourceDependencyPaths: [sourcePath],
			});

			await service.getOrCreate('/blog/1', strategy, renderFn);
			await service.getOrCreate('/blog/2', strategy, renderFn);
			expect(dependencyIndex.resolveKeys('html-cache', sourcePath)).toEqual(['/blog/1', '/blog/2']);

			const count = await service.invalidateByTags(['blog']);
			expect(count).toBe(2);
			expect(dependencyIndex.resolveKeys('html-cache', sourcePath)).toEqual([]);

			renderFn.mockClear();
			const result = await service.getOrCreate('/blog/1', 'static', renderFn);
			expect(result.status).toBe('miss');
		});

		test('should invalidate by paths', async () => {
			const renderFn = vi.fn().mockResolvedValue({ html: '<html>hello</html>', strategy: 'static' as const });
			const sourcePath = '/src/blog/1.astro';

			await service.getOrCreate('/blog/1?page=2#__eco_rt=3', 'static', async () => ({
				...(await renderFn()),
				sourceDependencyPaths: [sourcePath],
			}));
			expect(dependencyIndex.resolveKeys('html-cache', sourcePath)).toEqual(['/blog/1?page=2#__eco_rt=3']);

			const count = await service.invalidateByPaths(['/blog/1']);
			expect(count).toBe(1);
			expect(dependencyIndex.resolveKeys('html-cache', sourcePath)).toEqual([]);

			renderFn.mockClear();
			const result = await service.getOrCreate('/blog/1', 'static', renderFn);
			expect(result.status).toBe('miss');
		});
	});

	describe('disabled cache', () => {
		test('should bypass cache when disabled', async () => {
			const disabledService = new PageCacheService({ store, enabled: false });
			const renderFn = vi.fn().mockResolvedValue({ html: '<html>hello</html>', strategy: 'static' as const });

			const result1 = await disabledService.getOrCreate('/page', 'static', renderFn);
			const result2 = await disabledService.getOrCreate('/page', 'static', renderFn);

			expect(result1.status).toBe('miss');
			expect(result2.status).toBe('miss');
			expect(renderFn).toHaveBeenCalledTimes(2);
		});
	});
});

describe('getCacheControlHeader', () => {
	test('should return must-revalidate for static strategy', () => {
		expect(getCacheControlHeader('static')).toBe('public, max-age=0, must-revalidate');
	});

	test('should return no-store for dynamic strategy', () => {
		expect(getCacheControlHeader('dynamic')).toBe('no-store, must-revalidate');
	});

	test('should return max-age and stale-while-revalidate for object strategy', () => {
		expect(getCacheControlHeader({ revalidate: 3600 })).toBe('public, max-age=3600, stale-while-revalidate=7200');
	});

	test('should return no-store when disabled', () => {
		expect(getCacheControlHeader('disabled')).toBe('no-store, must-revalidate');
	});
});
