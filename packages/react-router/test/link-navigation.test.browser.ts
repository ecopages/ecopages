import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
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

		await userEvent.click(slowLink as HTMLAnchorElement);
		await userEvent.hover(fastLink as HTMLAnchorElement);
		fastLink?.remove();
		const nonLink = document.createElement('div');
		nonLink.textContent = 'Not a link';
		ctx.container.appendChild(nonLink);
		await userEvent.click(nonLink);
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

		await userEvent.click(clickedLink as HTMLAnchorElement);
		await waitUntil(() => expect(fetchSpy.mock.calls.map((call) => getRequestPath(call[0]))).toEqual(['/clicked']));

		for (const hovered of [hoveredA, hoveredB, hoveredC] as HTMLAnchorElement[]) {
			await userEvent.hover(hovered);
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

		await userEvent.click(slowLink as HTMLAnchorElement);
		await waitUntil(() => expect(fetchSpy).toHaveBeenCalledOnce());
		await userEvent.click(fastLink as HTMLAnchorElement);

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

		await userEvent.click(outsideLink as HTMLAnchorElement);
		await waitUntil(() => expect(fetchSpy).toHaveBeenCalledOnce());
		await userEvent.click(fastLink as HTMLAnchorElement);

		await waitUntil(() => expect(window.__ECO_PAGES__?.page?.props).toEqual({ label: 'fast' }));
		outsideFetch.resolve(htmlPageResponse('<html><body><main>Outside React</main></body></html>', { status: 200 }));
		await flushTasks();

		expect(cleanupSpy).not.toHaveBeenCalled();
		expect(handoffSpy).not.toHaveBeenCalled();
		await expect.element(page.getByTestId('page-label')).toHaveTextContent(/^fast$/);
		unregister();
	});

	it('leaves a modified click to the browser instead of navigating', async () => {
		const Page = createMultiLinkPage('ModifiedClick', [{ href: '/next', label: 'next-link' }]);
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}));

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
		let defaultPreventedByRouter: boolean | null = null;
		const recordAndCancel = (event: MouseEvent) => {
			defaultPreventedByRouter = event.defaultPrevented;
			event.preventDefault();
		};
		window.addEventListener('click', recordAndCancel);
		try {
			const link = ctx.container.querySelector('[data-testid="ModifiedClick-next-link"]') as HTMLAnchorElement;
			await userEvent.click(link, { modifiers: ['Shift'] });
		} finally {
			window.removeEventListener('click', recordAndCancel);
		}

		expect(defaultPreventedByRouter).toBe(false);
		await flushTasks();
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(window.location.pathname).toBe('/');
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
		await userEvent.click(link as HTMLAnchorElement);

		await waitUntil(() => expect(window.__ECO_PAGES__?.page?.props).toEqual({ label: 'next' }));
		await expect.element(page.getByTestId('is-navigating')).toHaveTextContent('no');
	});
});
