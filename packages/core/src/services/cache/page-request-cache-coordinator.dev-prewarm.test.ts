import { describe, expect, test, vi } from 'vitest';
import { MemoryCacheStore } from './memory-cache-store.ts';
import { PageCacheService } from './page-cache-service.ts';
import { PageRequestCacheCoordinator } from './page-request-cache-coordinator.service.ts';

describe('watch-mode page cache admission', () => {
	test('static pages cache outside the prewarm list when cache strategy allows it', async () => {
		const store = new MemoryCacheStore();
		const cacheService = new PageCacheService({ store, enabled: true });
		const coordinator = new PageRequestCacheCoordinator(cacheService, 'static');
		const renderFn = vi.fn().mockResolvedValue({
			html: '<html>warm</html>',
			strategy: 'static' as const,
			sourceDependencyPaths: ['/app/pages/docs/[...slug].tsx'],
		});

		await coordinator.render({
			cacheKey: '/docs/intro',
			pageCacheStrategy: 'static',
			renderFn,
		});
		const second = await coordinator.render({
			cacheKey: '/docs/intro',
			pageCacheStrategy: 'static',
			renderFn,
		});

		expect(renderFn).toHaveBeenCalledTimes(1);
		expect(second.headers.get('X-Cache')).toBe('HIT');
	});

	test('dynamic pages are never retained', async () => {
		const store = new MemoryCacheStore();
		const cacheService = new PageCacheService({ store, enabled: true });
		const coordinator = new PageRequestCacheCoordinator(cacheService, 'static');
		const renderFn = vi.fn().mockResolvedValue({ html: '<html>dynamic</html>', strategy: 'dynamic' as const });

		await coordinator.render({
			cacheKey: '/account',
			pageCacheStrategy: 'dynamic',
			renderFn,
		});
		await coordinator.render({
			cacheKey: '/account',
			pageCacheStrategy: 'dynamic',
			renderFn,
		});

		expect(renderFn).toHaveBeenCalledTimes(2);
		expect((await store.stats()).entries).toBe(0);
	});

	test('coalesces concurrent misses for the same key', async () => {
		const store = new MemoryCacheStore();
		const cacheService = new PageCacheService({ store, enabled: true });

		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});

		const renderFn = vi.fn(async () => {
			await gate;
			return { html: '<html>once</html>', strategy: 'static' as const };
		});

		const first = cacheService.getOrCreate('/docs/intro', 'static', renderFn);
		const second = cacheService.getOrCreate('/docs/intro', 'static', renderFn);
		release();

		const [firstResult, secondResult] = await Promise.all([first, second]);

		expect(renderFn).toHaveBeenCalledTimes(1);
		expect(firstResult.html).toBe('<html>once</html>');
		expect(secondResult.html).toBe('<html>once</html>');
		expect(firstResult.status).toBe('miss');
		expect(secondResult.status).toBe('miss');
	});

	test('invalidates only HTML entries that registered a changed source path', async () => {
		const cacheService = new PageCacheService({ enabled: true });
		const coordinator = new PageRequestCacheCoordinator(cacheService, 'static');
		const introRender = vi.fn().mockResolvedValue({
			html: '<html>intro</html>',
			strategy: 'static' as const,
			sourceDependencyPaths: ['/app/content/docs/intro.mdx'],
		});
		const guideRender = vi.fn().mockResolvedValue({
			html: '<html>guide</html>',
			strategy: 'static' as const,
			sourceDependencyPaths: ['/app/content/docs/guide.mdx'],
		});

		await coordinator.render({
			cacheKey: '/docs/intro',
			pageCacheStrategy: 'static',
			renderFn: introRender,
		});
		await coordinator.render({
			cacheKey: '/docs/guide',
			pageCacheStrategy: 'static',
			renderFn: guideRender,
		});

		await cacheService.invalidateBySourceDependencyPaths(['/app/content/docs/intro.mdx']);

		const introAfter = await coordinator.render({
			cacheKey: '/docs/intro',
			pageCacheStrategy: 'static',
			renderFn: introRender,
		});
		const guideAfter = await coordinator.render({
			cacheKey: '/docs/guide',
			pageCacheStrategy: 'static',
			renderFn: guideRender,
		});

		expect(introRender).toHaveBeenCalledTimes(2);
		expect(guideRender).toHaveBeenCalledTimes(1);
		expect(introAfter.headers.get('X-Cache')).toBe('MISS');
		expect(guideAfter.headers.get('X-Cache')).toBe('HIT');
	});
});
