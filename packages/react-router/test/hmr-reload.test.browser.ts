import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import { cacheNavigationHtml, getCachedNavigationHtml } from '../../core/src/router/client/navigation-document.ts';
import { EcoRouter, PageContent, clearLayoutCache } from '../src/router.ts';
import {
	createDeferred,
	createMockPageComponent,
	createMultiLinkPage,
	createNavigablePageHtml,
	createPageWithNamedLayout,
	renderAndFlushEffects,
	htmlPageResponse,
	useRouterTestEnvironment,
	waitUntil,
} from './react-router.harness.ts';

describe('EcoRouter HMR Integration', () => {
	const ctx = useRouterTestEnvironment();

	it('reloads the current page through the navigation coordinator', async () => {
		const PageA = createMockPageComponent('PageA');
		const moduleUrl = new URL('./fixtures/reloaded-page.tsx', import.meta.url).toString();
		const mockHtml = `
			<html data-eco-document-owner="react-router">
				<body>
					<script id="__ECO_PAGE_DATA__" type="application/json">${JSON.stringify({
						schemaVersion: 1,
						navigationOwner: 'react-router',
						moduleUrl,
						props: {},
					})}</script>
				</body>
			</html>
		`;
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(htmlPageResponse(mockHtml, { status: 200 }));

		ctx.root = createRoot(ctx.container);

		ctx.root.render(
			createElement(EcoRouter, {
				page: PageA,
				pageProps: {},
				options: { viewTransitions: false },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await ctx.ready();
		const result = getEcoNavigationRuntime(window).reloadCurrentPage({ clearCache: false });

		expect(result).toBeInstanceOf(Promise);
		await expect(result).resolves.toBe(true);
		await expect.element(ctx.container).toHaveTextContent('Reloaded page');
	});

	it('reloads fresh HTML instead of reusing the navigation cache', async () => {
		const PageA = createMockPageComponent('PageA');
		const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
		const currentUrl = new URL('/notes', window.location.origin);
		window.history.replaceState(null, '', currentUrl);
		cacheNavigationHtml(currentUrl, createNavigablePageHtml(moduleUrl, { label: 'cached' }));
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(htmlPageResponse(createNavigablePageHtml(moduleUrl, { label: 'fresh' })));

		ctx.root = createRoot(ctx.container);
		ctx.root.render(
			createElement(EcoRouter, {
				page: PageA,
				pageProps: {},
				options: { viewTransitions: false },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await ctx.ready();
		await expect(getEcoNavigationRuntime(window).reloadCurrentPage({ clearCache: false })).resolves.toBe(true);

		await expect.element(page.getByTestId('page-label')).toHaveTextContent(/^fresh$/);
		expect(fetchSpy).toHaveBeenCalledOnce();
	});

	it('clears a cached redirect target when a reload requests cache clearing', async () => {
		const PageA = createMockPageComponent('PageA');
		const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
		const currentUrl = new URL('/notes', window.location.origin);
		const cachedFinalUrl = new URL('/previous-notes', currentUrl);
		window.history.replaceState(null, '', currentUrl);
		cacheNavigationHtml(currentUrl, createNavigablePageHtml(moduleUrl, { label: 'cached' }), cachedFinalUrl);
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(htmlPageResponse(createNavigablePageHtml(moduleUrl, { label: 'fresh' })));

		ctx.root = createRoot(ctx.container);
		ctx.root.render(
			createElement(EcoRouter, {
				page: PageA,
				pageProps: {},
				options: { viewTransitions: false },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await ctx.ready();
		await expect(getEcoNavigationRuntime(window).reloadCurrentPage({ clearCache: true })).resolves.toBe(true);

		await expect.element(page.getByTestId('page-label')).toHaveTextContent(/^fresh$/);
		expect(fetchSpy).toHaveBeenCalledOnce();
		expect(getCachedNavigationHtml(cachedFinalUrl)).toBeNull();
	});

	it('replays a queued fragment-clearing link after reloading a fragment URL', async () => {
		const Page = createMultiLinkPage('FragmentReload', [{ href: '/docs', label: 'clear-fragment' }]);
		const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
		window.history.replaceState(null, '', '/docs#install');
		const reloadResponse = createDeferred<Response>();
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_, init) => {
			if (init?.signal?.aborted) {
				return Promise.reject(new DOMException('Aborted', 'AbortError'));
			}
			if (fetchSpy.mock.calls.length === 1) return reloadResponse.promise;
			return Promise.resolve(htmlPageResponse(createNavigablePageHtml(moduleUrl, { label: 'queued' })));
		});

		ctx.root = createRoot(ctx.container);
		ctx.root.render(
			createElement(EcoRouter, {
				page: Page,
				pageProps: {},
				options: { viewTransitions: false },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await ctx.ready();
		const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
		const pushStateSpy = vi.spyOn(window.history, 'pushState');
		const reloadPromise = getEcoNavigationRuntime(window).reloadCurrentPage({ clearCache: false });
		await waitUntil(() => expect(fetchSpy).toHaveBeenCalledOnce());
		const link = ctx.container.querySelector('[data-testid="FragmentReload-clear-fragment"]');
		expect(link).not.toBeNull();
		link?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, isPrimary: true }));
		reloadResponse.resolve(htmlPageResponse(createNavigablePageHtml(moduleUrl, { label: 'reloaded' })));

		await expect(reloadPromise).resolves.toBe(true);
		await waitUntil(() => expect(pushStateSpy).toHaveBeenCalledOnce());
		expect(replaceStateSpy.mock.calls.map(([, , href]) => href)).toEqual(['/docs#install']);
		expect(pushStateSpy.mock.calls.map(([, , href]) => href)).toEqual(['/docs']);
		expect(window.location.hash).toBe('');
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		await expect.element(page.getByTestId('page-label')).toHaveTextContent(/^queued$/);
	});

	it('ignores coordinator reloads while a navigation is still in flight', async () => {
		const Page = createMultiLinkPage('BusyPage', [{ href: '/next', label: 'next-link' }]);
		const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
		let resolveFetch!: (response: Response) => void;
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
			() =>
				new Promise<Response>((resolve) => {
					resolveFetch = resolve;
				}),
		);

		ctx.root = createRoot(ctx.container);
		ctx.root.render(
			createElement(EcoRouter, {
				page: Page,
				pageProps: {},
				options: { viewTransitions: false },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await ctx.ready();
		const link = ctx.container.querySelector('[data-testid="BusyPage-next-link"]') as HTMLAnchorElement | null;
		expect(link).not.toBeNull();
		await ctx.user.click(link as HTMLAnchorElement);

		await waitUntil(() => expect(fetchSpy).toHaveBeenCalledOnce());
		const reloadResult = await getEcoNavigationRuntime(window).reloadCurrentPage({ clearCache: false });

		expect(reloadResult).toBe(false);
		expect(fetchSpy).toHaveBeenCalledTimes(1);

		resolveFetch(
			htmlPageResponse(
				`<html data-eco-document-owner="react-router"><body>
					<script id="__ECO_PAGE_DATA__" type="application/json">${JSON.stringify({
						schemaVersion: 1,
						navigationOwner: 'react-router',
						moduleUrl,
						props: { label: 'done' },
					})}</script>
				</body></html>`,
				{ status: 200 },
			),
		);
		await waitUntil(() => expect(window.__ECO_PAGES__?.page?.props).toEqual({ label: 'done' }));
	});

	it('refreshes cached persisted layouts when HMR provides a new layout implementation', async () => {
		const FirstPage = createPageWithNamedLayout('PersistentPageA', 'Layout v1', 'shared-docs-layout');
		const UpdatedPage = createPageWithNamedLayout('PersistentPageB', 'Layout v2', 'shared-docs-layout');

		ctx.root = createRoot(ctx.container);
		ctx.root.render(
			createElement(EcoRouter, {
				page: FirstPage,
				pageProps: {},
				options: { persistLayouts: true },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await expect.element(page.getByTestId('PersistentPageA-layout')).toHaveTextContent('Layout v1');

		ctx.root.render(
			createElement(EcoRouter, {
				page: UpdatedPage,
				pageProps: {},
				options: { persistLayouts: true },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await expect.element(page.getByTestId('PersistentPageB-layout')).toHaveTextContent('Layout v2');
	});

	it('does not refresh persisted layouts on the initial bootstrap prop sync', async () => {
		let layoutMountCount = 0;
		const Layout = ({ children }: { children: ReactNode }) => {
			layoutMountCount += 1;
			return createElement('div', { 'data-testid': 'bootstrap-layout' }, children);
		};
		(Layout as typeof Layout & { config?: { identity?: { id: string } } }).config = {
			identity: { id: 'bootstrap-layout' },
		};

		const Page = (() => createElement('div', { 'data-testid': 'bootstrap-page' }, 'page')) as ReturnType<
			typeof createMockPageComponent
		> & {
			config?: { layout?: typeof Layout };
		};
		Page.config = { layouts: [Layout] };

		clearLayoutCache();
		ctx.root = createRoot(ctx.container);
		const routerProps = {
			page: Page,
			pageProps: {},
			options: { persistLayouts: true },
			children: createElement(PageContent),
		};

		ctx.root.render(createElement(EcoRouter, routerProps));
		await expect.element(page.getByTestId('bootstrap-layout')).toBeInTheDocument();
		expect(layoutMountCount).toBe(1);

		await renderAndFlushEffects(() => ctx.root.render(createElement(EcoRouter, routerProps)));
		expect(layoutMountCount).toBe(1);
	});
});
