import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import { useRouter } from '../src/context.ts';
import { EcoRouter, PageContent } from '../src/router.ts';
import {
	createDeferred,
	createMultiLinkPage,
	createNavigablePageHtml,
	flushTasks,
	getRequestPath,
	htmlPageResponse,
	useRouterTestEnvironment,
	waitUntil,
} from './react-router.harness.ts';

describe('EcoRouter link navigation', () => {
	const ctx = useRouterTestEnvironment();

	it('intercepts clicks that originate from a text node inside the anchor', async () => {
		const Page = createMultiLinkPage('TextNodeClick', [{ href: '/fast', label: 'fast-link' }]);
		const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
		const createHtml = (label: string) => createNavigablePageHtml(moduleUrl, { label });

		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(htmlPageResponse(createHtml('fast'), { status: 200 }));

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
		const link = ctx.container.querySelector('[data-testid="TextNodeClick-fast-link"]') as HTMLAnchorElement | null;
		const textNode = link?.firstChild;
		expect(link).not.toBeNull();
		expect(textNode).not.toBeNull();

		textNode?.dispatchEvent(
			new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0 }),
		);

		await waitUntil(() => expect(window.__ECO_PAGES__?.page?.props).toEqual({ label: 'fast' }));
		expect(ctx.container.textContent).toContain('fast');
	});

	it('does not navigate to a hovered link when a click lands on a non-link target during a slow navigation', async () => {
		const Page = createMultiLinkPage('HoverRecovery', [
			{ href: '/slow', label: 'slow-link' },
			{ href: '/fast', label: 'fast-link' },
		]);
		const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
		const createHtml = (label: string) => createNavigablePageHtml(moduleUrl, { label });
		const slowFetch = createDeferred();
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
			const url = getRequestPath(input);
			if (url === '/slow') {
				return new Promise<Response>((resolve, reject) => {
					const abortSignal = init?.signal;
					const handleAbort = () => {
						reject(new DOMException('Aborted', 'AbortError'));
					};

					abortSignal?.addEventListener('abort', handleAbort, { once: true });
					slowFetch.promise.then(() => {
						abortSignal?.removeEventListener('abort', handleAbort);
						resolve(htmlPageResponse(createHtml('slow'), { status: 200 }));
					});
				});
			}
			if (url === '/fast') {
				return Promise.resolve(htmlPageResponse(createHtml('fast'), { status: 200 }));
			}
			throw new Error(`Unexpected fetch: ${url}`);
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
		const slowLink = ctx.container.querySelector(
			'[data-testid="HoverRecovery-slow-link"]',
		) as HTMLAnchorElement | null;
		const fastLink = ctx.container.querySelector(
			'[data-testid="HoverRecovery-fast-link"]',
		) as HTMLAnchorElement | null;
		expect(slowLink).not.toBeNull();
		expect(fastLink).not.toBeNull();

		await ctx.user.click(slowLink as HTMLAnchorElement);
		await ctx.user.hover(fastLink as HTMLAnchorElement);
		fastLink?.remove();
		await ctx.user.click(ctx.container);
		slowFetch.resolve();

		await waitUntil(() => expect(window.__ECO_PAGES__?.page?.props).toEqual({ label: 'slow' }));
		const fetchUrls = fetchSpy.mock.calls.map((call) => getRequestPath(call[0]));
		expect(fetchUrls).not.toContain('/fast');
		expect(ctx.container.textContent).toContain('slow');
		expect(ctx.container.textContent).not.toContain('fast');
	});

	it('does not swap the queued navigation href when the user merely hovers unrelated links during a slow navigation', async () => {
		const Page = createMultiLinkPage('HoverQueueLeak', [
			{ href: '/clicked', label: 'clicked-link' },
			{ href: '/hovered-a', label: 'hovered-a-link' },
			{ href: '/hovered-b', label: 'hovered-b-link' },
			{ href: '/hovered-c', label: 'hovered-c-link' },
		]);
		const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
		const createHtml = (label: string) => createNavigablePageHtml(moduleUrl, { label });
		const slowFetch = createDeferred();
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
			const url = getRequestPath(input);
			if (url === '/clicked') {
				return new Promise<Response>((resolve, reject) => {
					const abortSignal = init?.signal;
					const handleAbort = () => {
						reject(new DOMException('Aborted', 'AbortError'));
					};
					abortSignal?.addEventListener('abort', handleAbort, { once: true });
					slowFetch.promise.then(() => {
						abortSignal?.removeEventListener('abort', handleAbort);
						resolve(htmlPageResponse(createHtml('clicked'), { status: 200 }));
					});
				});
			}
			return Promise.resolve(htmlPageResponse(createHtml(url.slice(1)), { status: 200 }));
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
		const clickedLink = ctx.container.querySelector(
			'[data-testid="HoverQueueLeak-clicked-link"]',
		) as HTMLAnchorElement | null;
		const hoveredA = ctx.container.querySelector(
			'[data-testid="HoverQueueLeak-hovered-a-link"]',
		) as HTMLAnchorElement | null;
		const hoveredB = ctx.container.querySelector(
			'[data-testid="HoverQueueLeak-hovered-b-link"]',
		) as HTMLAnchorElement | null;
		const hoveredC = ctx.container.querySelector(
			'[data-testid="HoverQueueLeak-hovered-c-link"]',
		) as HTMLAnchorElement | null;
		expect(clickedLink).not.toBeNull();
		expect(hoveredA).not.toBeNull();
		expect(hoveredB).not.toBeNull();
		expect(hoveredC).not.toBeNull();

		await ctx.user.click(clickedLink as HTMLAnchorElement);
		await waitUntil(() => expect(fetchSpy.mock.calls.map((call) => getRequestPath(call[0]))).toEqual(['/clicked']));

		for (const hovered of [hoveredA, hoveredB, hoveredC] as HTMLAnchorElement[]) {
			hovered.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, composed: true }));
			hovered.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, composed: true }));
			hovered.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, cancelable: true, composed: true }));
			hovered.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, composed: true }));
		}

		slowFetch.resolve();
		await waitUntil(() => expect(window.__ECO_PAGES__?.page?.props).toEqual({ label: 'clicked' }));
		const fetchUrls = fetchSpy.mock.calls.map((call) => getRequestPath(call[0]));
		expect(fetchUrls).toContain('/clicked');
		expect(fetchUrls).not.toContain('/hovered-a');
		expect(fetchUrls).not.toContain('/hovered-b');
		expect(fetchUrls).not.toContain('/hovered-c');
		expect(ctx.container.textContent).toContain('clicked');
		expect(ctx.container.textContent).not.toContain('hovered-a');
		expect(ctx.container.textContent).not.toContain('hovered-b');
		expect(ctx.container.textContent).not.toContain('hovered-c');
	});

	it('ignores stale navigation results when a newer route finishes first', async () => {
		const Page = createMultiLinkPage('RaceStart', [
			{ href: '/slow', label: 'slow-link' },
			{ href: '/fast', label: 'fast-link' },
		]);
		const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
		const createHtml = (label: string) => createNavigablePageHtml(moduleUrl, { label });

		const slowFetch = createDeferred<Response>();
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = getRequestPath(input);
			if (url === '/slow') return slowFetch.promise;
			if (url === '/fast') {
				return htmlPageResponse(createHtml('fast'), { status: 200 });
			}
			throw new Error(`Unexpected fetch: ${url}`);
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
		const slowLink = ctx.container.querySelector('[data-testid="RaceStart-slow-link"]') as HTMLAnchorElement | null;
		const fastLink = ctx.container.querySelector('[data-testid="RaceStart-fast-link"]') as HTMLAnchorElement | null;
		expect(slowLink).not.toBeNull();
		expect(fastLink).not.toBeNull();

		await ctx.user.click(slowLink as HTMLAnchorElement);
		await waitUntil(() => expect(fetchSpy).toHaveBeenCalledOnce());
		await ctx.user.click(fastLink as HTMLAnchorElement);

		await waitUntil(() => expect(window.__ECO_PAGES__?.page?.props).toEqual({ label: 'fast' }));
		slowFetch.resolve(htmlPageResponse(createHtml('slow'), { status: 200 }));
		await flushTasks();

		expect(window.__ECO_PAGES__?.page?.props).toEqual({ label: 'fast' });
		await expect.element(page.getByTestId('page-label')).toHaveTextContent(/^fast$/);
	});

	it('ignores stale browser-router handoff when a newer React route finishes first', async () => {
		const Page = createMultiLinkPage('FallbackRace', [
			{ href: '/outside-react', label: 'outside-link' },
			{ href: '/fast', label: 'fast-link' },
		]);
		const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
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
		const createHtml = (label: string) => createNavigablePageHtml(moduleUrl, { label });

		const outsideFetch = createDeferred<Response>();
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = getRequestPath(input);
			if (url === '/outside-react') return outsideFetch.promise;
			if (url === '/fast') {
				return htmlPageResponse(createHtml('fast'), { status: 200 });
			}
			throw new Error(`Unexpected fetch: ${url}`);
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
		const outsideLink = ctx.container.querySelector(
			'[data-testid="FallbackRace-outside-link"]',
		) as HTMLAnchorElement | null;
		const fastLink = ctx.container.querySelector(
			'[data-testid="FallbackRace-fast-link"]',
		) as HTMLAnchorElement | null;
		expect(outsideLink).not.toBeNull();
		expect(fastLink).not.toBeNull();

		await ctx.user.click(outsideLink as HTMLAnchorElement);
		await waitUntil(() => expect(fetchSpy).toHaveBeenCalledOnce());
		await ctx.user.click(fastLink as HTMLAnchorElement);

		await waitUntil(() => expect(window.__ECO_PAGES__?.page?.props).toEqual({ label: 'fast' }));
		outsideFetch.resolve(htmlPageResponse('<html><body><main>Outside React</main></body></html>', { status: 200 }));
		await flushTasks();

		expect(cleanupSpy).not.toHaveBeenCalled();
		expect(handoffSpy).not.toHaveBeenCalled();
		await expect.element(page.getByTestId('page-label')).toHaveTextContent(/^fast$/);
		unregister();
	});

	it('clears isNavigating after a successful SPA navigation', async () => {
		const Page = createMultiLinkPage('NavTerminal', [{ href: '/next', label: 'next-link' }]);
		const NavigatingProbe = () => {
			const { isNavigating } = useRouter();
			return createElement('span', { 'data-testid': 'is-navigating' }, isNavigating ? 'yes' : 'no');
		};
		const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();

		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			htmlPageResponse(createNavigablePageHtml(moduleUrl, { label: 'next' }), { status: 200 }),
		);

		ctx.root = createRoot(ctx.container);
		ctx.root.render(
			createElement(EcoRouter, {
				page: Page,
				pageProps: {},
				options: { viewTransitions: false },
				// oxlint-disable-next-line no-children-prop
				children: createElement('div', null, createElement(PageContent), createElement(NavigatingProbe)),
			}),
		);

		await ctx.ready();
		await expect.element(page.getByTestId('is-navigating')).toHaveTextContent('no');

		const link = ctx.container.querySelector('[data-testid="NavTerminal-next-link"]') as HTMLAnchorElement | null;
		expect(link).not.toBeNull();
		await ctx.user.click(link as HTMLAnchorElement);

		await waitUntil(() => expect(window.__ECO_PAGES__?.page?.props).toEqual({ label: 'next' }));
		await expect.element(page.getByTestId('is-navigating')).toHaveTextContent('no');
	});
});
