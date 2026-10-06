import { describe, expect, it, vi } from 'vitest';
import { MemoryCacheStore } from './memory-cache-store.js';
import { PageCacheService } from './page-cache-service.js';
import { PageRequestCacheCoordinator } from './page-request-cache-coordinator.service.ts';

describe('PageRequestCacheCoordinator', () => {
	it('should include browser-runtime generation in development cache keys', () => {
		const previousNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = 'development';
		try {
			const service = new PageRequestCacheCoordinator(null, 'static', () => 7);
			expect(service.buildCacheKey({ pathname: '/blog' })).toBe('/blog#__eco_rt=7');
			expect(service.buildCacheKey({ pathname: '/blog', query: { page: '2' } })).toBe('/blog?page=2#__eco_rt=7');
		} finally {
			process.env.NODE_ENV = previousNodeEnv;
		}
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

	it('sends must-revalidate and an ETag for static HTML and answers 304 when If-None-Match matches', async () => {
		const cacheService = new PageCacheService({ store: new MemoryCacheStore() });
		const html = '<html><body>static</body></html>';
		const service = new PageRequestCacheCoordinator(cacheService, 'static');
		const renderFn = async () => ({ html, strategy: 'static' as const });

		const first = await service.render({
			cacheKey: '/static',
			pageCacheStrategy: 'static',
			renderFn,
		});

		expect(first.status).toBe(200);
		expect(first.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
		expect(first.headers.get('Cache-Control')).not.toContain('immutable');
		const etag = first.headers.get('ETag');
		expect(etag).toMatch(/^"[a-f0-9]{16}"$/);
		expect(await first.text()).toBe(html);

		const notModified = await service.render({
			cacheKey: '/static',
			pageCacheStrategy: 'static',
			renderFn,
			ifNoneMatch: etag,
		});

		expect(notModified.status).toBe(304);
		expect(notModified.headers.get('ETag')).toBe(etag);
		expect(await notModified.text()).toBe('');
	});
});
