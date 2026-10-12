import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type UniversalEcopagesApp } from '@ecopages/core/create-app';
import { copyFixtureApp } from '../../../packages/core/__fixtures__/app/copy-fixture-app.ts';

type RevalidateBody = { tags?: string[]; paths?: string[] };

type InvalidationResult = { revalidated: boolean; invalidated: { tags: number; paths: number } };

type PageResponse = { status: number; headers: Headers; timestamp: number };

const ORIGIN = 'http://localhost:3000';

/**
 * Serves the cache fixture app through `app.fetch()` on a private copy, with a fresh page cache per test.
 *
 * @remarks
 * Only `Date` is faked: the cache reads `Date.now()` for entry age, so tests move time with
 * `vi.advanceTimersByTime` and never sleep. Every request first advances the clock by 1 ms, so a page that
 * is rendered again always carries a later timestamp than the one it replaces.
 */
async function startCacheApp() {
	const appDir = copyFixtureApp(import.meta.dirname);
	const app: UniversalEcopagesApp = await createApp({ configFile: path.join(appDir, 'eco.config.ts') });

	app.post('/api/revalidate', async ({ request, services }) => {
		const body = (await request.json()) as RevalidateBody;
		const tags = body.tags?.length ? await services.cache!.invalidateByTags(body.tags) : 0;
		const paths = body.paths?.length ? await services.cache!.invalidateByPaths(body.paths) : 0;
		return Response.json({ revalidated: true, invalidated: { tags, paths } });
	});
	app.get('/api/cache-stats', async ({ services }) => Response.json(await services.cache!.stats()));

	async function get(pathname: string, headers?: HeadersInit): Promise<PageResponse> {
		vi.advanceTimersByTime(1);
		const response = await app.fetch(new Request(`${ORIGIN}${pathname}`, { headers }));
		const body = await response.text();
		const timestamp = Number(body.match(/<div id="timestamp">(\d+)<\/div>/)?.[1] ?? 0);
		return { status: response.status, headers: response.headers, timestamp };
	}

	async function revalidate(body: RevalidateBody): Promise<InvalidationResult> {
		const response = await app.fetch(
			new Request(`${ORIGIN}/api/revalidate`, { method: 'POST', body: JSON.stringify(body) }),
		);
		return (await response.json()) as InvalidationResult;
	}

	async function entryCount(): Promise<number> {
		const response = await app.fetch(new Request(`${ORIGIN}/api/cache-stats`));
		return ((await response.json()) as { entries: number }).entries;
	}

	async function dispose(): Promise<void> {
		await app.stop();
		rmSync(appDir, { recursive: true, force: true });
	}

	return { get, revalidate, entryCount, dispose };
}

describe('cache fixture app', () => {
	let site: Awaited<ReturnType<typeof startCacheApp>>;

	beforeEach(async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.useFakeTimers({ toFake: ['Date'], now: new Date('2030-01-01T00:00:00Z') });
		site = await startCacheApp();
	});

	afterEach(async () => {
		await site.dispose();
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	describe('Cache-Control per strategy', () => {
		it('revalidates a static page on every request and answers 304 to a matching ETag', async () => {
			const first = await site.get('/static-page');

			expect(first.status).toBe(200);
			expect(first.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
			const etag = first.headers.get('etag');
			expect(etag).toMatch(/^"[a-f0-9]{16}"$/);

			const second = await site.get('/static-page', { 'If-None-Match': etag! });
			expect(second.status).toBe(304);
		});

		it('never stores a dynamic page', async () => {
			const response = await site.get('/dynamic-nocache');

			expect(response.headers.get('cache-control')).toBe('no-store, must-revalidate');
		});

		it('allows a revalidate page to be served stale while it renews', async () => {
			const response = await site.get('/revalidate');

			expect(response.headers.get('cache-control')).toContain('max-age=2');
			expect(response.headers.get('cache-control')).toContain('stale-while-revalidate');
		});

		it('uses the page revalidate interval for a tagged page', async () => {
			const response = await site.get('/tagged-page');

			expect(response.headers.get('cache-control')).toContain('max-age=60');
			expect(response.headers.get('cache-control')).toContain('stale-while-revalidate');
		});

		it('uses the page revalidate interval for a dynamic route', async () => {
			const response = await site.get('/dynamic/blog-post');

			expect(response.status).toBe(200);
			expect(response.headers.get('cache-control')).toContain('max-age=10');
			expect(response.headers.get('cache-control')).toContain('stale-while-revalidate');
		});
	});

	describe('serving from the cache', () => {
		it('serves a static page from the cache on repeated requests', async () => {
			const first = await site.get('/static-page');
			const second = await site.get('/static-page');

			expect(first.headers.get('x-cache')).toBe('MISS');
			expect(second.headers.get('x-cache')).toBe('HIT');
			expect(second.timestamp).toBe(first.timestamp);
		});

		it('renders a dynamic page again on every request', async () => {
			const first = await site.get('/dynamic-nocache');
			const second = await site.get('/dynamic-nocache');

			expect(first.headers.get('x-cache')).toBe('DISABLED');
			expect(second.headers.get('x-cache')).toBe('DISABLED');
			expect(second.timestamp).toBeGreaterThan(first.timestamp);
		});

		it('caches each slug of a dynamic route independently', async () => {
			const first = await site.get('/dynamic/blog-post');
			const other = await site.get('/dynamic/another-blog-post');
			const firstAgain = await site.get('/dynamic/blog-post');

			expect(other.headers.get('x-cache')).toBe('MISS');
			expect(other.timestamp).toBeGreaterThan(first.timestamp);
			expect(firstAgain.headers.get('x-cache')).toBe('HIT');
			expect(firstAgain.timestamp).toBe(first.timestamp);
		});

		it('counts the cached pages in the cache stats', async () => {
			await site.get('/static-page');

			expect(await site.entryCount()).toBe(1);
		});
	});

	describe('time-based revalidation', () => {
		it('serves the stale copy once the interval has passed, then the renewed page', async () => {
			const first = await site.get('/revalidate');
			expect(first.timestamp).toBeGreaterThan(0);
			expect((await site.get('/revalidate')).headers.get('x-cache')).toBe('HIT');

			vi.advanceTimersByTime(2500);

			const stale = await site.get('/revalidate');
			expect(stale.headers.get('x-cache')).toBe('STALE');
			expect(stale.timestamp).toBe(first.timestamp);

			await vi.waitFor(async () => {
				const renewed = await site.get('/revalidate');
				expect(renewed.headers.get('x-cache')).toBe('HIT');
				expect(renewed.timestamp).toBeGreaterThan(first.timestamp);
			});
		});
	});

	describe('tag-based invalidation', () => {
		it('renders a page again after one of its tags is invalidated', async () => {
			const first = await site.get('/tagged-page');
			expect(first.timestamp).toBeGreaterThan(0);
			expect((await site.get('/tagged-page')).headers.get('x-cache')).toBe('HIT');

			const result = await site.revalidate({ tags: ['tagged'] });

			expect(result.invalidated.tags).toBe(1);
			const renewed = await site.get('/tagged-page');
			expect(renewed.headers.get('x-cache')).toBe('MISS');
			expect(renewed.timestamp).toBeGreaterThan(first.timestamp);
		});

		it('invalidates every page that carries the tag', async () => {
			await site.get('/dynamic/blog-post');
			await site.get('/dynamic/another-blog-post');
			expect(await site.entryCount()).toBe(2);

			const result = await site.revalidate({ tags: ['blog'] });

			expect(result.invalidated.tags).toBe(2);
			expect((await site.get('/dynamic/blog-post')).headers.get('x-cache')).toBe('MISS');
			expect((await site.get('/dynamic/another-blog-post')).headers.get('x-cache')).toBe('MISS');
		});
	});

	describe('path-based invalidation', () => {
		it('renders a page again after its path is invalidated', async () => {
			const first = await site.get('/static-page');
			expect((await site.get('/static-page')).headers.get('x-cache')).toBe('HIT');

			const result = await site.revalidate({ paths: ['/static-page'] });

			expect(result.invalidated.paths).toBe(1);
			const renewed = await site.get('/static-page');
			expect(renewed.headers.get('x-cache')).toBe('MISS');
			expect(renewed.timestamp).toBeGreaterThan(first.timestamp);
		});

		it('leaves the other cached paths alone', async () => {
			await site.get('/static-page');
			await site.get('/tagged-page');

			await site.revalidate({ paths: ['/static-page'] });

			expect((await site.get('/static-page')).headers.get('x-cache')).toBe('MISS');
			expect((await site.get('/tagged-page')).headers.get('x-cache')).toBe('HIT');
		});
	});

	describe('combined invalidation', () => {
		it('invalidates by tags and paths in one request', async () => {
			await site.get('/static-page');
			await site.get('/tagged-page');
			await site.get('/revalidate');

			const result = await site.revalidate({ tags: ['tagged'], paths: ['/static-page'] });

			expect(result.invalidated).toEqual({ tags: 1, paths: 1 });
			expect((await site.get('/static-page')).headers.get('x-cache')).toBe('MISS');
			expect((await site.get('/tagged-page')).headers.get('x-cache')).toBe('MISS');
			expect((await site.get('/revalidate')).headers.get('x-cache')).toBe('HIT');
		});
	});
});
