import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import { EcoRouter, PageContent } from '../src/router.ts';
import {
	createMockPageComponent,
	createMultiLinkPage,
	flushTasks,
	htmlPageResponse,
	useRouterTestEnvironment,
	waitUntil,
} from './react-router.harness.ts';

describe('EcoRouter navigation runtime ownership', () => {
	const ctx = useRouterTestEnvironment();

	it('sets and clears the router ownership flag', async () => {
		const PageA = createMockPageComponent('PageA');

		ctx.root = createRoot(ctx.container);
		ctx.root.render(
			createElement(EcoRouter, {
				page: PageA,
				pageProps: {},
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await ctx.ready();
		expect(getEcoNavigationRuntime(window).getOwnerState().owner).toBe('react-router');

		ctx.root.unmount();
		await waitUntil(() => expect(getEcoNavigationRuntime(window).getOwnerState().owner).toBe('none'));
	});

	it('registers current-page reload through the navigation coordinator', async () => {
		const PageA = createMockPageComponent('PageA');

		ctx.root = createRoot(ctx.container);
		ctx.root.render(
			createElement(EcoRouter, {
				page: PageA,
				pageProps: {},
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await ctx.ready();

		expect(getEcoNavigationRuntime(window).getOwnerState()).toEqual({
			owner: 'react-router',
			canHandleSpaNavigation: true,
		});
	});

	it('cleans up the registered current-page reload handler on unmount', async () => {
		const PageA = createMockPageComponent('PageA');

		ctx.root = createRoot(ctx.container);
		ctx.root.render(
			createElement(EcoRouter, {
				page: PageA,
				pageProps: {},
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await ctx.ready();
		expect(getEcoNavigationRuntime(window).getOwnerState().owner).toBe('react-router');

		ctx.root.unmount();
		await waitUntil(() =>
			expect(getEcoNavigationRuntime(window).getOwnerState()).toEqual({
				owner: 'none',
				canHandleSpaNavigation: false,
			}),
		);
	});

	it('unregisters the react-router runtime during cleanup-before-handoff', async () => {
		const Page = createMockPageComponent('PageA');
		const runtime = getEcoNavigationRuntime(window);

		ctx.root = createRoot(ctx.container);
		ctx.root.render(
			createElement(EcoRouter, {
				page: Page,
				pageProps: {},
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await ctx.ready();
		await runtime.cleanupOwner('react-router');

		expect(runtime.getOwnerState()).toEqual({
			owner: 'none',
			canHandleSpaNavigation: false,
		});

		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(htmlPageResponse('<html></html>', { status: 200 }));
		const handled = await runtime.requestNavigation({ href: '/still-registered', source: 'browser-router' });

		expect(handled).toBe(false);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('stops intercepting document clicks after cleanup-before-handoff releases the runtime', async () => {
		const Page = createMultiLinkPage('ReleasedRuntime', [{ href: '/after-cleanup', label: 'after-cleanup' }]);
		const runtime = getEcoNavigationRuntime(window);
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(htmlPageResponse('<html></html>', { status: 200 }));

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
		await runtime.cleanupOwner('react-router');

		const link = ctx.container.querySelector(
			'[data-testid="ReleasedRuntime-after-cleanup"]',
		) as HTMLAnchorElement | null;
		expect(link).not.toBeNull();
		link?.addEventListener('click', (event) => event.preventDefault(), { once: true });
		await ctx.user.click(link as HTMLAnchorElement);

		await flushTasks();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('delegates non-React documents to browser-router when it is registered', async () => {
		const Page = createMultiLinkPage('LeaveReact', [{ href: '/outside-react', label: 'outside-link' }]);
		const cleanupSpy = vi.fn();
		const handoffSpy = vi.fn(async () => true);
		window.__ECO_PAGES__ = {
			...window.__ECO_PAGES__,
			react: {
				...window.__ECO_PAGES__?.react,
				cleanupPageRoot: cleanupSpy,
			},
		};
		const unregister = getEcoNavigationRuntime(window).register({
			owner: 'browser-router',
			handoffNavigation: handoffSpy,
		});

		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			htmlPageResponse('<html><body><main>Outside React</main></body></html>', { status: 200 }),
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
		const link = ctx.container.querySelector('[data-testid="LeaveReact-outside-link"]') as HTMLAnchorElement | null;
		expect(link).not.toBeNull();
		await ctx.user.click(link as HTMLAnchorElement);

		await waitUntil(() => expect(handoffSpy).toHaveBeenCalledOnce());

		expect(cleanupSpy).not.toHaveBeenCalled();
		expect(handoffSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				href: '/outside-react',
				finalHref: '/outside-react',
				direction: 'forward',
				source: 'react-router',
				targetOwner: 'browser-router',
				document: expect.any(Document),
				html: '<html><body><main>Outside React</main></body></html>',
			}),
		);
		unregister();
	});
});
