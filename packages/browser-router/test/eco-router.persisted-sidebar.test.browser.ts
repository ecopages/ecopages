import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createRouter } from '../src/client/eco-router';
import {
	htmlFetchResponse,
	installEcoRouterTestHooks,
	waitForNavigation,
	type EcoRouterTestFixtures,
} from './eco-router.harness';

const SIDEBAR_LINKS = ['/docs/start', '/docs/install', '/docs/config'];

/**
 * A docs-style shell: a scrollable sidebar marked `data-eco-persist` beside the page content.
 *
 * @remarks
 * The sidebar is taller than its box, so it has a real scroll range. Its markup is identical on every
 * page, apart from `data-rendered-for`, which records the page that rendered it so a test can tell a
 * kept element from one the swap updated. The router runs with its default options: view transitions on
 * selects the morph swap, which leaves the persisted element in place. The replace swap re-parents it,
 * and a re-parented element loses its scroll offset.
 */
function docsPage(name: string): string {
	const filler = Array.from({ length: 40 }, (_, index) => `<li style="height:30px">Filler ${index}</li>`).join('');
	const links = SIDEBAR_LINKS.map((href) => `<li style="height:30px"><a href="${href}">${href}</a></li>`).join('');
	return `<aside id="sidebar" data-eco-persist="docs-sidebar" data-rendered-for="${name}" style="height:120px;overflow:auto"><ul>${links}${filler}</ul></aside>
		<main><h1>${name}</h1><a href="/docs/start" id="content-link">Content link</a></main>`;
}

describe('EcoRouter with a persisted sidebar', () => {
	const fixtures: EcoRouterTestFixtures = {
		router: null,
		fetchSpy: null,
	};

	installEcoRouterTestHooks(fixtures);

	function mountDocs(initial: string): HTMLElement {
		document.body.innerHTML = docsPage(initial);
		fixtures.router = createRouter({ prefetch: false });
		fixtures.fetchSpy?.mockImplementation(async (url: string | URL | Request) => {
			const pathname = new URL(url.toString(), window.location.href).pathname;
			return htmlFetchResponse(`<html><head></head><body>${docsPage(pathname)}</body></html>`);
		});
		return document.getElementById('sidebar')!;
	}

	it('keeps the sidebar element and its scroll position across a swap and back', async () => {
		const sidebar = mountDocs('index');
		sidebar.scrollTop = 100;
		Object.assign(sidebar, { fixtureMarker: 'kept' });
		expect(sidebar.scrollTop).toBe(100);

		await Promise.all([waitForNavigation(), userEvent.click(page.getByRole('link', { name: 'Content link' }))]);

		await expect.element(page.getByRole('heading', { name: '/docs/start' })).toBeVisible();
		expect(document.getElementById('sidebar')).toBe(sidebar);
		expect(sidebar).toHaveProperty('fixtureMarker', 'kept');
		expect(sidebar).toHaveAttribute('data-rendered-for', 'index');
		expect(sidebar.scrollTop).toBe(100);

		const navigation = waitForNavigation();
		window.history.back();
		await navigation;

		await expect.element(page.getByRole('heading', { name: '/', exact: true })).toBeVisible();
		expect(window.location.pathname).toBe('/');
		expect(document.getElementById('sidebar')).toBe(sidebar);
		expect(sidebar).toHaveProperty('fixtureMarker', 'kept');
		expect(sidebar).toHaveAttribute('data-rendered-for', 'index');
		expect(sidebar.scrollTop).toBe(100);
	});

	it('swaps the content on every sidebar click and keeps one sidebar through the chain', async () => {
		const sidebar = mountDocs('index');

		for (const href of SIDEBAR_LINKS) {
			await Promise.all([waitForNavigation(), userEvent.click(page.getByRole('link', { name: href }))]);

			await expect.element(page.getByRole('heading', { name: href })).toBeVisible();
			expect(window.location.pathname).toBe(href);
			expect(document.querySelectorAll('#sidebar')).toHaveLength(1);
			expect(document.getElementById('sidebar')).toBe(sidebar);
			expect(sidebar).toHaveAttribute('data-rendered-for', 'index');
		}
	});
});
