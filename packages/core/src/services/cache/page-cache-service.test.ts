/**
 * Unit tests for PageCacheService
 */

import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { PageCacheService, getCacheControlHeader } from './page-cache-service.ts';
import { MemoryCacheStore } from './memory-cache-store.ts';

describe('PageCacheService', () => {
	let service: PageCacheService;
	let store: MemoryCacheStore;

	beforeEach(() => {
		store = new MemoryCacheStore();
		service = new PageCacheService({ store });
	});

	describe('generateCacheKey', () => {
		test('should use full URL as key', () => {
			expect(service.generateCacheKey('/blog/post-1')).toBe('/blog/post-1');
			expect(service.generateCacheKey('/search?q=test')).toBe('/search?q=test');
		});
	});

	describe('getOrCreate', () => {
		test('should return miss and render on cache miss', async () => {
			const renderFn = mock().mockResolvedValue({ html: '<html>hello</html>', strategy: 'static' as const });

			const result = await service.getOrCreate('/page', 'static', renderFn);

			expect(result.status).toBe('miss');
			expect(result.html).toBe('<html>hello</html>');
			expect(result.strategy).toBe('static');
			expect(renderFn).toHaveBeenCalledTimes(1);
		});

		test('should return hit on cache hit', async () => {
			const renderFn = mock().mockResolvedValue({ html: '<html>hello</html>', strategy: 'static' as const });

			await service.getOrCreate('/page', 'static', renderFn);

			renderFn.mockClear();
			const result = await service.getOrCreate('/page', 'static', renderFn);

			expect(result.status).toBe('hit');
			expect(result.html).toBe('<html>hello</html>');
			expect(result.strategy).toBe('static');
			expect(renderFn).not.toHaveBeenCalled();
		});

		test('should bypass cache for dynamic strategy', async () => {
			const renderFn = mock().mockResolvedValue({ html: '<html>hello</html>', strategy: 'dynamic' as const });

			const result1 = await service.getOrCreate('/page', 'dynamic', renderFn);
			const result2 = await service.getOrCreate('/page', 'dynamic', renderFn);

			expect(result1.status).toBe('miss');
			expect(result2.status).toBe('miss');
			expect(renderFn).toHaveBeenCalledTimes(2);
		});

		test('should return stale when entry is past revalidation time', async () => {
			const revalidateStrategy = { revalidate: 60 };
			const renderFn = mock().mockResolvedValue({ html: '<html>v1</html>', strategy: revalidateStrategy });

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
			const renderFn = mock().mockImplementation(async () => {
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
		test('should invalidate by tags', async () => {
			const strategy = { revalidate: 3600, tags: ['blog'] };
			const renderFn = mock().mockResolvedValue({ html: '<html>hello</html>', strategy });

			await service.getOrCreate('/blog/1', strategy, renderFn);
			await service.getOrCreate('/blog/2', strategy, renderFn);

			const count = await service.invalidateByTags(['blog']);
			expect(count).toBe(2);

			renderFn.mockClear();
			const result = await service.getOrCreate('/blog/1', 'static', renderFn);
			expect(result.status).toBe('miss');
		});

		test('should invalidate by paths', async () => {
			const renderFn = mock().mockResolvedValue({ html: '<html>hello</html>', strategy: 'static' as const });

			await service.getOrCreate('/blog/1', 'static', renderFn);

			const count = await service.invalidateByPaths(['/blog/1']);
			expect(count).toBe(1);

			renderFn.mockClear();
			const result = await service.getOrCreate('/blog/1', 'static', renderFn);
			expect(result.status).toBe('miss');
		});
	});

	describe('disabled cache', () => {
		test('should bypass cache when disabled', async () => {
			const disabledService = new PageCacheService({ store, enabled: false });
			const renderFn = mock().mockResolvedValue({ html: '<html>hello</html>', strategy: 'static' as const });

			const result1 = await disabledService.getOrCreate('/page', 'static', renderFn);
			const result2 = await disabledService.getOrCreate('/page', 'static', renderFn);

			expect(result1.status).toBe('miss');
			expect(result2.status).toBe('miss');
			expect(renderFn).toHaveBeenCalledTimes(2);
		});
	});
});

describe('getCacheControlHeader', () => {
	test('should return immutable for static strategy', () => {
		expect(getCacheControlHeader('static')).toBe('public, max-age=31536000, immutable');
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
