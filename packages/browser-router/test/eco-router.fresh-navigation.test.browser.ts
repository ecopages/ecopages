import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { clearNavigationHtmlCache } from '@ecopages/core/client';
import { createRouter } from '../src/client/eco-router';
import {
	createLink,
	htmlFetchResponse,
	installEcoRouterTestHooks,
	waitForNavigation,
	type EcoRouterTestFixtures,
} from './eco-router.harness';

describe('EcoRouter fresh navigation', () => {
	const fixtures: EcoRouterTestFixtures = {
		router: null,
		fetchSpy: null,
	};

	installEcoRouterTestHooks(fixtures);

	beforeEach(() => {
		clearNavigationHtmlCache();
	});

	function serveVersionedPages(cacheControl: Record<string, string> = {}): void {
		const visits = new Map<string, number>();
		fixtures.fetchSpy?.mockImplementation(async (input: string | URL | Request) => {
			const path = new URL(input instanceof Request ? input.url : input.toString(), window.location.href)
				.pathname;
			const visit = (visits.get(path) ?? 0) + 1;
			visits.set(path, visit);
			const response = htmlFetchResponse(
				`<html><head></head><body><div id="content">${path} visit ${visit}</div></body></html>`,
			);
			if (cacheControl[path]) response.headers.set('Cache-Control', cacheControl[path]);
			return response;
		});
	}

	it('fetches every visit fresh when prefetch is disabled', async () => {
		serveVersionedPages();
		fixtures.router = createRouter({ prefetch: false });

		await fixtures.router.navigate('/fresh-a');
		expect(document.body.innerHTML).toContain('/fresh-a visit 1');
		await fixtures.router.navigate('/fresh-b');
		expect(document.body.innerHTML).toContain('/fresh-b visit 1');
		await fixtures.router.navigate('/fresh-a');

		expect(document.body.innerHTML).toContain('/fresh-a visit 2');
		expect(document.body.innerHTML).not.toContain('/fresh-a visit 1');
	});

	describe('Cache-Control', () => {
		it('fetches a no-store page again on each navigation', async () => {
			serveVersionedPages({ '/order': 'no-store, must-revalidate' });
			fixtures.router = createRouter();

			await fixtures.router.navigate('/order');
			await fixtures.router.navigate('/product');
			await fixtures.router.navigate('/order');

			expect(document.body.innerHTML).toContain('/order visit 2');
		});

		it('fetches a no-store page again whatever fragment the visitor asks for', async () => {
			serveVersionedPages({ '/order': 'no-store' });
			fixtures.router = createRouter();

			await fixtures.router.navigate('/order#a');
			await fixtures.router.navigate('/product');
			await fixtures.router.navigate('/order#b');

			expect(document.body.innerHTML).toContain('/order visit 2');
		});

		it('fetches a no-store page again when the visitor comes back with the back button', async () => {
			serveVersionedPages({ '/order': 'no-store' });
			fixtures.router = createRouter();

			await fixtures.router.navigate('/order');
			await fixtures.router.navigate('/product');
			const restored = waitForNavigation();
			window.history.back();
			await restored;

			expect(window.location.pathname).toBe('/order');
			expect(document.body.innerHTML).toContain('/order visit 2');
		});

		it('fetches a no-store page on click even when hovering the link prefetched it', async () => {
			serveVersionedPages({ '/order': 'no-store' });
			fixtures.router = createRouter({ prefetch: { strategy: 'hover', delay: 0 } });
			const link = createLink({ href: '/order', id: 'order-link' });

			await userEvent.hover(link);
			await vi.waitFor(() => expect(fixtures.fetchSpy).toHaveBeenCalledTimes(1));
			await Promise.all([waitForNavigation(), userEvent.click(link)]);

			expect(document.body.innerHTML).toContain('/order visit 2');
		});

		it('reuses a cacheable page it visited', async () => {
			serveVersionedPages({ '/about': 'public, max-age=0, must-revalidate' });
			fixtures.router = createRouter();

			await fixtures.router.navigate('/about');
			await fixtures.router.navigate('/product');
			await fixtures.router.navigate('/about');

			expect(document.body.innerHTML).toContain('/about visit 1');
		});

		it('fetches the page it started on when the visitor first returns to it, then reuses that copy', async () => {
			serveVersionedPages();
			fixtures.router = createRouter();

			await fixtures.router.navigate('/product');
			await fixtures.router.navigate('/');
			expect(document.body.innerHTML).toContain('/ visit 1');
			await fixtures.router.navigate('/product');
			await fixtures.router.navigate('/');

			expect(document.body.innerHTML).toContain('/ visit 1');
			expect(fixtures.fetchSpy).toHaveBeenCalledTimes(2);
		});
	});
});
