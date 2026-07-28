import { describe, expect, test, vi } from 'vitest';
import { AllowlistedMemoryCacheStore } from './allowlisted-memory-cache-store.ts';
import { PageCacheService } from './page-cache-service.ts';
import { PageRequestCacheCoordinator } from './page-request-cache-coordinator.service.ts';

describe('watch allowlisted page cache', () => {
	test('prewarm fills the same PageCacheService the live handler uses', async () => {
		const store = new AllowlistedMemoryCacheStore();
		const cacheService = new PageCacheService({ store, enabled: true });
		const coordinator = new PageRequestCacheCoordinator(cacheService, 'static');
		const renderFn = vi.fn().mockResolvedValue({ html: '<html>warm</html>', strategy: 'static' as const });

		store.registerAllowedKeys(['/docs/intro']);

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

	test('unlisted pathnames miss and do not write', async () => {
		const store = new AllowlistedMemoryCacheStore();
		const cacheService = new PageCacheService({ store, enabled: true });
		const coordinator = new PageRequestCacheCoordinator(cacheService, 'static');
		const renderFn = vi.fn().mockResolvedValue({ html: '<html>cold</html>', strategy: 'static' as const });

		store.registerAllowedKeys(['/docs/intro']);

		await coordinator.render({
			cacheKey: '/other',
			pageCacheStrategy: 'static',
			renderFn,
		});
		await coordinator.render({
			cacheKey: '/other',
			pageCacheStrategy: 'static',
			renderFn,
		});

		expect(renderFn).toHaveBeenCalledTimes(2);
	});

	test('coalesces concurrent misses for the same key', async () => {
		const store = new AllowlistedMemoryCacheStore();
		store.registerAllowedKeys(['/docs/intro']);
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
});
