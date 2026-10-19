import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { EcoRouter, PageContent } from '../src/router.ts';
import ScrollSidebarPage from './fixtures/scroll-sidebar-page.tsx';
import {
	createNavigablePageHtml,
	getRequestPath,
	htmlPageResponse,
	useRouterTestEnvironment,
	waitUntil,
} from './react-router.harness.ts';

describe('EcoRouter persisted scroll', () => {
	const ctx = useRouterTestEnvironment();

	function pageLabel(): string | null | undefined {
		return ctx.container.querySelector('[data-testid="page-label"]')?.textContent;
	}

	function sidebar(): HTMLElement {
		return ctx.container.querySelector('#scroll-sidebar') as HTMLElement;
	}

	it('restores the scroll position of the page a back navigation returns to', async () => {
		const moduleUrl = new URL('./fixtures/scroll-sidebar-page.tsx', import.meta.url).toString();
		vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
			const path = getRequestPath(input);
			if (path === '/a' || path === '/b') {
				return Promise.resolve(htmlPageResponse(createNavigablePageHtml(moduleUrl, { label: path })));
			}
			throw new Error(`Unexpected fetch: ${path}`);
		});

		window.history.replaceState(null, '', '/a');
		ctx.root = createRoot(ctx.container);
		ctx.root.render(
			createElement(EcoRouter, {
				page: ScrollSidebarPage,
				pageProps: { label: '/a' },
				options: { viewTransitions: false },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);
		await ctx.ready();

		sidebar().scrollTop = 100;
		await userEvent.click(ctx.container.querySelector('[data-testid="link-b"]') as HTMLElement);
		await waitUntil(() => expect(pageLabel()).toBe('/b'));
		expect(window.location.pathname).toBe('/b');

		sidebar().scrollTop = 300;
		window.history.back();

		await waitUntil(() => expect(pageLabel()).toBe('/a'));
		expect(window.location.pathname).toBe('/a');
		await waitUntil(() => expect(sidebar().scrollTop).toBe(100));
	});
});
