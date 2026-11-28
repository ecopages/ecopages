import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearNavigationHtmlCache,
	fetchNavigationPage,
	getCachedNavigationHtml,
	invalidateNavigationHtml,
	parseNavigationDocument,
} from './navigation-document.ts';

afterEach(() => {
	clearNavigationHtmlCache();
	vi.unstubAllGlobals();
});

describe('shared navigation document loading', () => {
	it('checks HTML status, keeps the fragment through redirects, and resolves the incoming base', async () => {
		const response = new Response('<html><head><base href="../assets/"></head><body></body></html>', {
			headers: { 'Content-Type': 'text/html; charset=utf-8' },
		});
		Object.defineProperty(response, 'url', { value: 'https://example.test/docs/current/' });
		const fetchMock = vi.fn(async () => response);
		vi.stubGlobal('fetch', fetchMock);

		const page = await fetchNavigationPage('https://example.test/old/page#install');

		expect(fetchMock).toHaveBeenCalledWith(
			'https://example.test/old/page',
			expect.objectContaining({ headers: { Accept: 'text/html' } }),
		);
		expect(page?.finalUrl.href).toBe('https://example.test/docs/current/#install');
		expect(page?.document.querySelector('base')?.href).toBe('https://example.test/docs/assets/');
	});

	it('shares cached HTML and the redirect target across router loads', async () => {
		const response = new Response('<html><head></head><body></body></html>', {
			headers: { 'Content-Type': 'text/html' },
		});
		Object.defineProperty(response, 'url', { value: 'https://example.test/docs/' });
		const fetchMock = vi.fn(async () => response);
		vi.stubGlobal('fetch', fetchMock);

		const firstPage = await fetchNavigationPage('https://example.test/old/#one');
		const cachedPage = await fetchNavigationPage('https://example.test/old/#two');

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(firstPage?.finalUrl.href).toBe('https://example.test/docs/#one');
		expect(cachedPage?.finalUrl.href).toBe('https://example.test/docs/#two');
	});

	it('invalidates every requested URL that redirected to the same page', async () => {
		const fetchMock = vi.fn(async () => {
			const response = new Response('<html><head></head><body></body></html>', {
				headers: { 'Content-Type': 'text/html' },
			});
			Object.defineProperty(response, 'url', { value: 'https://example.test/b' });
			return response;
		});
		vi.stubGlobal('fetch', fetchMock);

		await fetchNavigationPage('https://example.test/a');
		invalidateNavigationHtml('https://example.test/b');
		await fetchNavigationPage('https://example.test/a');

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('refetches when the cache is bypassed', async () => {
		const fetchMock = vi.fn(
			async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }),
		);
		vi.stubGlobal('fetch', fetchMock);

		await fetchNavigationPage('https://example.test/page');
		await fetchNavigationPage('https://example.test/page', { bypassCache: true });

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('passes low fetch priority through for prefetch requests', async () => {
		const response = new Response('<html><head></head><body></body></html>', {
			headers: { 'Content-Type': 'text/html' },
		});
		const fetchMock = vi.fn(async () => response);
		vi.stubGlobal('fetch', fetchMock);

		await fetchNavigationPage('https://example.test/prefetched', { priority: 'low' });

		expect(fetchMock).toHaveBeenCalledWith(
			'https://example.test/prefetched',
			expect.objectContaining({ priority: 'low' }),
		);
	});

	it('rejects non-HTML and non-success responses', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response('missing', { status: 404, headers: { 'Content-Type': 'text/html' } }))
			.mockResolvedValueOnce(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		expect(await fetchNavigationPage('https://example.test/missing')).toBeNull();
		expect(await fetchNavigationPage('https://example.test/data')).toBeNull();
	});

	describe('Cache-Control', () => {
		function htmlResponse(cacheControl: string | null): Response {
			const headers = new Headers({ 'Content-Type': 'text/html' });
			if (cacheControl !== null) headers.set('Cache-Control', cacheControl);
			return new Response('<html><head></head><body></body></html>', { headers });
		}

		it.each([
			'no-store',
			'no-store, must-revalidate',
			'private, no-cache',
			'public, NO-STORE',
			'no-cache',
			'max-age=60,no-store',
		])('fetches a page answered with "%s" again on each navigation', async (cacheControl) => {
			const fetchMock = vi.fn(async () => htmlResponse(cacheControl));
			vi.stubGlobal('fetch', fetchMock);

			await fetchNavigationPage('https://example.test/order');
			expect(getCachedNavigationHtml('https://example.test/order')).toBeNull();
			await fetchNavigationPage('https://example.test/order');

			expect(fetchMock).toHaveBeenCalledTimes(2);
		});

		it.each([
			null,
			'public, max-age=0, must-revalidate',
			'public, max-age=60, stale-while-revalidate=120',
			'private',
			'no-cache="set-cookie"',
			'public, no-cache="set-cookie, authorization", max-age=60',
		])('reuses a page answered with %j', async (cacheControl) => {
			const fetchMock = vi.fn(async () => htmlResponse(cacheControl));
			vi.stubGlobal('fetch', fetchMock);

			await fetchNavigationPage('https://example.test/about');
			await fetchNavigationPage('https://example.test/about');

			expect(fetchMock).toHaveBeenCalledOnce();
		});

		it('drops the copy it holds when the page turns to no-store', async () => {
			const fetchMock = vi
				.fn()
				.mockImplementationOnce(async () => htmlResponse(null))
				.mockImplementation(async () => htmlResponse('no-store'));
			vi.stubGlobal('fetch', fetchMock);

			await fetchNavigationPage('https://example.test/order');
			await fetchNavigationPage('https://example.test/order', { bypassCache: true });

			expect(getCachedNavigationHtml('https://example.test/order')).toBeNull();
		});

		it('drops the copy held under the URL a page redirected from when it turns to no-store', async () => {
			const fetchMock = vi.fn(async () => {
				const response = htmlResponse(fetchMock.mock.calls.length === 1 ? null : 'no-store');
				Object.defineProperty(response, 'url', { value: 'https://example.test/orders/current' });
				return response;
			});
			vi.stubGlobal('fetch', fetchMock);

			await fetchNavigationPage('https://example.test/order');
			await fetchNavigationPage('https://example.test/orders/current', { bypassCache: true });

			expect(getCachedNavigationHtml('https://example.test/order')).toBeNull();
			expect(getCachedNavigationHtml('https://example.test/orders/current')).toBeNull();
		});

		it('fetches a no-store page again whatever fragment the visitor asks for', async () => {
			const fetchMock = vi.fn(async () => htmlResponse('no-store'));
			vi.stubGlobal('fetch', fetchMock);

			await fetchNavigationPage('https://example.test/order#a');
			await fetchNavigationPage('https://example.test/order#b');

			expect(fetchMock).toHaveBeenCalledTimes(2);
		});

		describe('max-age', () => {
			const at = (seconds: number) => vi.setSystemTime(new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + seconds * 1000));

			beforeEach(() => {
				vi.useFakeTimers({ toFake: ['Date'] });
				at(0);
			});

			afterEach(() => {
				vi.useRealTimers();
			});

			it('fetches a page again once it is older than its max-age', async () => {
				const fetchMock = vi.fn(async () => htmlResponse('public, max-age=60, stale-while-revalidate=120'));
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage('https://example.test/news');
				at(61);
				await fetchNavigationPage('https://example.test/news');

				expect(fetchMock).toHaveBeenCalledTimes(2);
			});

			it('reuses a page that is younger than its max-age', async () => {
				const fetchMock = vi.fn(async () => htmlResponse('public, max-age=60, stale-while-revalidate=120'));
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage('https://example.test/news');
				at(10);
				await fetchNavigationPage('https://example.test/news');

				expect(fetchMock).toHaveBeenCalledOnce();
			});

			it('reports an expired copy as missing', async () => {
				vi.stubGlobal(
					'fetch',
					vi.fn(async () => htmlResponse('max-age=60')),
				);

				await fetchNavigationPage('https://example.test/news');
				at(61);

				expect(getCachedNavigationHtml('https://example.test/news')).toBeNull();
			});

			it('measures the age from the latest fetch', async () => {
				const fetchMock = vi.fn(async () => htmlResponse('max-age=60'));
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage('https://example.test/news');
				at(61);
				await fetchNavigationPage('https://example.test/news');
				at(100);
				await fetchNavigationPage('https://example.test/news');

				expect(fetchMock).toHaveBeenCalledTimes(2);
			});

			it('expires the redirect target together with the requested URL', async () => {
				const fetchMock = vi.fn(async () => {
					const response = htmlResponse('max-age=60');
					Object.defineProperty(response, 'url', { value: 'https://example.test/news/today' });
					return response;
				});
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage('https://example.test/news');
				at(61);
				await fetchNavigationPage('https://example.test/news/today');

				expect(fetchMock).toHaveBeenCalledTimes(2);
			});

			it('keeps reusing a page sent with max-age=0 for the session', async () => {
				const fetchMock = vi.fn(async () => htmlResponse('public, max-age=0, must-revalidate'));
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage('https://example.test/about');
				at(86_400);
				await fetchNavigationPage('https://example.test/about');

				expect(fetchMock).toHaveBeenCalledOnce();
			});

			it('keeps reusing a page with no max-age', async () => {
				const fetchMock = vi.fn(async () => htmlResponse('private'));
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage('https://example.test/about');
				at(86_400);
				await fetchNavigationPage('https://example.test/about');

				expect(fetchMock).toHaveBeenCalledOnce();
			});
		});

		it('stores the page again once its response allows reuse', async () => {
			const fetchMock = vi
				.fn()
				.mockImplementationOnce(async () => htmlResponse('no-store'))
				.mockImplementation(async () => htmlResponse('public, max-age=60'));
			vi.stubGlobal('fetch', fetchMock);

			await fetchNavigationPage('https://example.test/page');
			await fetchNavigationPage('https://example.test/page');
			await fetchNavigationPage('https://example.test/page');

			expect(fetchMock).toHaveBeenCalledTimes(2);
		});
	});

	it('adds a temporary base only when the page has none', () => {
		const document = parseNavigationDocument(
			'<html><head></head><body><a href="child">Child</a></body></html>',
			new URL('https://example.test/docs/'),
		);

		expect(document.querySelector<HTMLBaseElement>('base[data-eco-injected]')?.href).toBe(
			'https://example.test/docs/',
		);
		expect(document.querySelector('a')?.getAttribute('href')).toBe('child');
	});
});
