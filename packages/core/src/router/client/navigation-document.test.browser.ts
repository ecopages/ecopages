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

			it('ignores s-maxage, which is for shared caches', async () => {
				const fetchMock = vi.fn(async () => htmlResponse('public, s-maxage=10'));
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage('https://example.test/about');
				at(61);
				await fetchNavigationPage('https://example.test/about');

				expect(fetchMock).toHaveBeenCalledOnce();
			});

			it('counts the Age of a shared cache against the max-age', async () => {
				const fetchMock = vi.fn(async () => {
					const response = htmlResponse('max-age=60');
					response.headers.set('Age', '50');
					return response;
				});
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage('https://example.test/news');
				at(9);
				await fetchNavigationPage('https://example.test/news');
				expect(fetchMock).toHaveBeenCalledOnce();

				at(11);
				await fetchNavigationPage('https://example.test/news');
				expect(fetchMock).toHaveBeenCalledTimes(2);
			});

			it('does not keep a page that arrives with its max-age used up', async () => {
				const fetchMock = vi.fn(async () => {
					const response = htmlResponse('max-age=60');
					response.headers.set('Age', '60');
					return response;
				});
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage('https://example.test/news');
				await fetchNavigationPage('https://example.test/news');

				expect(fetchMock).toHaveBeenCalledTimes(2);
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

		describe('one-use hold of a prefetched no-store page', () => {
			const href = 'https://example.test/cart';
			const at = (ms: number) => vi.setSystemTime(new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + ms));

			beforeEach(() => {
				vi.useFakeTimers({ toFake: ['Date'] });
				at(0);
			});

			afterEach(() => {
				vi.useRealTimers();
			});

			it('serves the prefetched copy to the next navigation without a request', async () => {
				const fetchMock = vi.fn(async () => htmlResponse('no-store'));
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage(href, { prefetch: true });
				const page = await fetchNavigationPage(href);

				expect(fetchMock).toHaveBeenCalledOnce();
				expect(page?.html).toContain('<body>');
			});

			it('uses the copy once, then fetches again', async () => {
				const fetchMock = vi.fn(async () => htmlResponse('no-store'));
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage(href, { prefetch: true });
				await fetchNavigationPage(href);
				await fetchNavigationPage(href);

				expect(fetchMock).toHaveBeenCalledTimes(2);
			});

			it('serves the copy up to the end of the short window', async () => {
				const fetchMock = vi.fn(async () => htmlResponse('no-store'));
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage(href, { prefetch: true });
				at(4_000);
				await fetchNavigationPage(href);

				expect(fetchMock).toHaveBeenCalledOnce();
			});

			it('fetches again once the short window has passed', async () => {
				const fetchMock = vi.fn(async () => htmlResponse('no-store'));
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage(href, { prefetch: true });
				at(6_000);
				await fetchNavigationPage(href);

				expect(fetchMock).toHaveBeenCalledTimes(2);
			});

			it('holds nothing for a navigation fetch', async () => {
				const fetchMock = vi.fn(async () => htmlResponse('no-store'));
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage(href);
				await fetchNavigationPage(href);

				expect(fetchMock).toHaveBeenCalledTimes(2);
			});

			it('keeps the fragment of the click and the redirect target of the prefetch', async () => {
				const fetchMock = vi.fn(async () => {
					const response = htmlResponse('no-store');
					Object.defineProperty(response, 'url', { value: 'https://example.test/cart/current' });
					return response;
				});
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage(href, { prefetch: true });
				const page = await fetchNavigationPage(`${href}#items`);

				expect(fetchMock).toHaveBeenCalledOnce();
				expect(page?.finalUrl.href).toBe('https://example.test/cart/current#items');
			});

			it('drops the copy when a fetch that bypasses the cache has made it stale', async () => {
				const fetchMock = vi.fn(async () => htmlResponse('no-store'));
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage(href, { prefetch: true });
				await fetchNavigationPage(href, { bypassCache: true });
				await fetchNavigationPage(href);

				expect(fetchMock).toHaveBeenCalledTimes(3);
			});

			it('drops the copy when its URL is invalidated', async () => {
				const fetchMock = vi.fn(async () => htmlResponse('no-store'));
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage(href, { prefetch: true });
				invalidateNavigationHtml(href);
				await fetchNavigationPage(href);

				expect(fetchMock).toHaveBeenCalledTimes(2);
			});

			it('drops the copy held for an alias when the page it redirects to is invalidated', async () => {
				const fetchMock = vi.fn(async () => {
					const response = htmlResponse('no-store');
					Object.defineProperty(response, 'url', { value: 'https://example.test/cart/current' });
					return response;
				});
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage('https://example.test/basket', { prefetch: true });
				invalidateNavigationHtml('https://example.test/cart/current');
				await fetchNavigationPage('https://example.test/basket');

				expect(fetchMock).toHaveBeenCalledTimes(2);
			});

			it('lets a navigation that starts during the prefetch wait for it, so the page is requested once', async () => {
				let release!: () => void;
				const gate = new Promise<void>((resolve) => {
					release = resolve;
				});
				const fetchMock = vi.fn(async () => {
					await gate;
					return htmlResponse('no-store');
				});
				vi.stubGlobal('fetch', fetchMock);

				const prefetch = fetchNavigationPage(href, { prefetch: true });
				const navigation = fetchNavigationPage(href);
				release();
				await Promise.all([prefetch, navigation]);

				expect(fetchMock).toHaveBeenCalledOnce();
			});

			it('lets a navigation that starts during a prefetch of a cacheable page share its response', async () => {
				let release!: () => void;
				const gate = new Promise<void>((resolve) => {
					release = resolve;
				});
				const fetchMock = vi.fn(async () => {
					await gate;
					return htmlResponse('public, max-age=60');
				});
				vi.stubGlobal('fetch', fetchMock);

				const prefetch = fetchNavigationPage(href, { prefetch: true });
				const navigation = fetchNavigationPage(href);
				release();
				await Promise.all([prefetch, navigation]);

				expect(fetchMock).toHaveBeenCalledOnce();
			});

			it('fetches for itself when the prefetch it waited for failed', async () => {
				const fetchMock = vi
					.fn()
					.mockImplementationOnce(async () => {
						throw new TypeError('network down');
					})
					.mockImplementation(async () => htmlResponse('no-store'));
				vi.stubGlobal('fetch', fetchMock);

				const prefetch = fetchNavigationPage(href, { prefetch: true }).catch(() => null);
				const page = await fetchNavigationPage(href);
				await prefetch;

				expect(page?.html).toContain('<body>');
				expect(fetchMock).toHaveBeenCalledTimes(2);
			});

			it('stops waiting for a prefetch when the navigation is aborted', async () => {
				let release!: () => void;
				const gate = new Promise<void>((resolve) => {
					release = resolve;
				});
				vi.stubGlobal(
					'fetch',
					vi.fn(async () => {
						await gate;
						return htmlResponse('no-store');
					}),
				);
				const controller = new AbortController();

				const prefetch = fetchNavigationPage(href, { prefetch: true });
				const navigation = fetchNavigationPage(href, { signal: controller.signal });
				controller.abort();

				await expect(navigation).rejects.toMatchObject({ name: 'AbortError' });
				release();
				await prefetch;
			});

			it('does not hold a prefetched page that arrived with its max-age used up', async () => {
				const fetchMock = vi.fn(async () => {
					const response = htmlResponse('max-age=60');
					response.headers.set('Age', '61');
					return response;
				});
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage(href, { prefetch: true });
				await fetchNavigationPage(href);

				expect(fetchMock).toHaveBeenCalledTimes(2);
			});

			it('keeps a prefetch that redirected from storing over a newer fetch of its final URL', async () => {
				let release!: () => void;
				const gate = new Promise<void>((resolve) => {
					release = resolve;
				});
				let visit = 0;
				const fetchMock = vi.fn(async (input: string | URL | Request) => {
					visit += 1;
					const current = visit;
					const isOld = String(input).endsWith('/old');
					if (isOld) await gate;
					const response = new Response(`<html><body>visit ${current}</body></html>`, {
						headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=60' },
					});
					Object.defineProperty(response, 'url', { value: 'https://example.test/new' });
					return response;
				});
				vi.stubGlobal('fetch', fetchMock);

				const prefetch = fetchNavigationPage('https://example.test/old', { prefetch: true });
				await fetchNavigationPage('https://example.test/new', { bypassCache: true });
				release();
				await prefetch;
				const next = await fetchNavigationPage('https://example.test/new');

				expect(next?.html).toContain('visit 2');
			});

			it('does not let a navigation wait for a prefetch that was invalidated while in flight', async () => {
				let release!: () => void;
				const gate = new Promise<void>((resolve) => {
					release = resolve;
				});
				let visit = 0;
				const fetchMock = vi.fn(async () => {
					visit += 1;
					const current = visit;
					if (current === 1) await gate;
					return new Response(`<html><body>visit ${current}</body></html>`, {
						headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' },
					});
				});
				vi.stubGlobal('fetch', fetchMock);

				const prefetch = fetchNavigationPage(href, { prefetch: true });
				invalidateNavigationHtml(href);
				const next = await fetchNavigationPage(href);
				release();
				await prefetch;
				const after = await fetchNavigationPage(href);

				expect(next?.html).toContain('visit 2');
				expect(after?.html).toContain('visit 3');
			});

			it('keeps a prefetch that a newer fetch of the URL overtook from storing its older copy', async () => {
				let release!: () => void;
				const gate = new Promise<void>((resolve) => {
					release = resolve;
				});
				let visit = 0;
				const fetchMock = vi.fn(async () => {
					visit += 1;
					const current = visit;
					if (current === 1) await gate;
					return new Response(`<html><body>visit ${current}</body></html>`, {
						headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' },
					});
				});
				vi.stubGlobal('fetch', fetchMock);

				const prefetch = fetchNavigationPage(href, { prefetch: true });
				await fetchNavigationPage(href, { bypassCache: true });
				release();
				await prefetch;
				const next = await fetchNavigationPage(href);

				expect(next?.html).toContain('visit 3');
			});

			it('stores a cacheable prefetched page as it always did', async () => {
				const fetchMock = vi.fn(async () => htmlResponse('public, max-age=60'));
				vi.stubGlobal('fetch', fetchMock);

				await fetchNavigationPage(href, { prefetch: true });
				await fetchNavigationPage(href);
				await fetchNavigationPage(href);

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
