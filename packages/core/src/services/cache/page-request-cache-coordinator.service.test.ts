import { describe, expect, it, vi } from 'vitest';
import { PageRequestCacheCoordinator } from './page-request-cache-coordinator.service.ts';
import type { PageCacheService } from './page-cache-service.js';

describe('PageRequestCacheCoordinator', () => {
	it('should build cache keys with query parameters', () => {
		const service = new PageRequestCacheCoordinator(null, 'static');

		expect(service.buildCacheKey({ pathname: '/blog' })).toBe('/blog');
		expect(service.buildCacheKey({ pathname: '/blog', query: { page: '2', tag: 'eco' } })).toBe(
			'/blog?page=2&tag=eco',
		);
	});

	it('should bypass the cache service for dynamic pages', async () => {
		const cacheService = {
			getOrCreate: vi.fn(),
		} as unknown as PageCacheService;
		const renderFn = vi.fn(async () => ({
			html: '<html><body>dynamic</body></html>',
			strategy: 'dynamic' as const,
		}));
		const service = new PageRequestCacheCoordinator(cacheService, 'static');

		const response = await service.render({
			cacheKey: '/dynamic',
			pageCacheStrategy: 'dynamic',
			renderFn,
		});

		expect(await response.text()).toBe('<html><body>dynamic</body></html>');
		expect(response.headers.get('X-Cache')).toBe('DISABLED');
		expect(cacheService.getOrCreate).not.toHaveBeenCalled();
		expect(renderFn).toHaveBeenCalledTimes(1);
	});

	it('should delegate cached rendering to the cache service', async () => {
		const cacheService = {
			getOrCreate: vi.fn(async () => ({
				html: '<html><body>cached</body></html>',
				strategy: { revalidate: 60 },
				status: 'hit',
			})),
		} as unknown as PageCacheService;
		const service = new PageRequestCacheCoordinator(cacheService, 'static');

		const response = await service.render({
			cacheKey: '/cached',
			pageCacheStrategy: { revalidate: 60 },
			renderFn: async () => ({
				html: '<html><body>fresh</body></html>',
				strategy: { revalidate: 60 },
			}),
		});

		expect(await response.text()).toBe('<html><body>cached</body></html>');
		expect(response.headers.get('X-Cache')).toBe('HIT');
		expect(response.headers.get('Cache-Control')).toContain('max-age=60');
		expect(cacheService.getOrCreate).toHaveBeenCalledWith('/cached', { revalidate: 60 }, expect.any(Function));
	});

	it('should normalize supported body types to strings', async () => {
		const service = new PageRequestCacheCoordinator(null, 'static');

		expect(await service.bodyToString('plain')).toBe('plain');
		expect(await service.bodyToString(Buffer.from('buffered'))).toBe('buffered');
		expect(await service.bodyToString(new Uint8Array([104, 101, 108, 108, 111]))).toBe('hello');
		expect(
			await service.bodyToString(
				new ReadableStream({
					start: (controller) => {
						controller.enqueue(new TextEncoder().encode('streamed'));
						controller.close();
					},
				}),
			),
		).toBe('streamed');
	});
});
