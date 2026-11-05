import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ECO_NAVIGATION_LIFECYCLE_EVENTS } from '@ecopages/core/client';
import { EcoRouter, PageContent, clearLayoutCache } from '../src/router.ts';
import { flushTasks } from './react-router.harness.ts';

function htmlPageResponse(body: string, init: ResponseInit = {}): Response {
	return new Response(body, {
		status: 200,
		...init,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			...(init.headers ?? {}),
		},
	});
}

function createLinkPage(name: string, href: string, label: string) {
	const Component = () => createElement('a', { href, 'data-testid': `${name}-link` }, label);
	Component.displayName = name;
	return Component;
}

function createNavigablePageHtml(moduleUrl: string, props: Record<string, unknown> = {}) {
	return `<html data-eco-document-owner="react-router"><body>
		<script id="__ECO_PAGE_DATA__" type="application/json">${JSON.stringify({
			schemaVersion: 1,
			navigationOwner: 'react-router',
			moduleUrl,
			props,
		})}</script>
	</body></html>`;
}

describe('react-router navigation lifecycle', () => {
	let container: HTMLDivElement;
	let root: ReturnType<typeof createRoot>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.append(container);
	});

	afterEach(() => {
		root?.unmount();
		container?.remove();
		vi.restoreAllMocks();
		clearLayoutCache();
		delete window.__ECO_PAGES__;
	});

	it('dispatches lifecycle events for SPA navigation', async () => {
		const PageA = createLinkPage('PageA', '/next', 'Next');
		const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
		const events: string[] = [];
		const requestAnimationFrameSpy = vi
			.spyOn(window, 'requestAnimationFrame')
			.mockImplementation((callback: FrameRequestCallback): number => {
				callback(performance.now());
				return 1;
			});

		for (const eventName of Object.values(ECO_NAVIGATION_LIFECYCLE_EVENTS)) {
			document.addEventListener(eventName, () => {
				events.push(eventName);
			});
		}

		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			htmlPageResponse(createNavigablePageHtml(moduleUrl, { label: 'done' }), { status: 200 }),
		);

		root = createRoot(container);
		root.render(
			createElement(EcoRouter, {
				page: PageA,
				pageProps: {},
				options: { viewTransitions: false },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		const link = await vi.waitFor(() => {
			const node = container.querySelector('[data-testid="PageA-link"]') as HTMLAnchorElement | null;
			expect(node).not.toBeNull();
			return node as HTMLAnchorElement;
		});
		await userEvent.click(link);

		await vi.waitFor(
			() => {
				expect(events).toEqual([
					ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD,
					ECO_NAVIGATION_LIFECYCLE_EVENTS.BEFORE_SWAP,
					ECO_NAVIGATION_LIFECYCLE_EVENTS.AFTER_SWAP,
					ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD,
				]);
				expect(container.textContent).toContain('done');
			},
			{ timeout: 2000 },
		);
		requestAnimationFrameSpy.mockRestore();
	});

	it('only emits post-commit lifecycle events for the winning stale race', async () => {
		const Page = createLinkPage('RacePage', '/fast', 'Fast');
		const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
		let resolveSlowFetch!: (response: Response) => void;
		const requestAnimationFrameSpy = vi
			.spyOn(window, 'requestAnimationFrame')
			.mockImplementation((callback: FrameRequestCallback): number => {
				callback(performance.now());
				return 1;
			});
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
			const url = String(input);
			if (url.includes('/slow')) {
				return new Promise<Response>((resolve) => {
					resolveSlowFetch = resolve;
				});
			}

			return Promise.resolve(
				htmlPageResponse(createNavigablePageHtml(moduleUrl, { label: 'fast' }), { status: 200 }),
			);
		});
		const afterSwapSpy = vi.fn();
		const pageLoadSpy = vi.fn();
		document.addEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.AFTER_SWAP, afterSwapSpy);
		document.addEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD, pageLoadSpy);

		root = createRoot(container);
		root.render(
			createElement(EcoRouter, {
				page: Page,
				pageProps: {},
				options: { viewTransitions: false },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		const fastLink = await vi.waitFor(() => {
			const node = container.querySelector('[data-testid="RacePage-link"]') as HTMLAnchorElement | null;
			expect(node).not.toBeNull();
			return node as HTMLAnchorElement;
		});

		const slowLink = document.createElement('a');
		slowLink.href = '/slow';
		slowLink.textContent = 'Slow';
		container.append(slowLink);

		await userEvent.click(slowLink);
		await userEvent.click(fastLink);

		await vi.waitFor(
			() => {
				expect(afterSwapSpy).toHaveBeenCalledTimes(1);
				expect(pageLoadSpy).toHaveBeenCalledTimes(2);
			},
			{ timeout: 2000 },
		);
		expect(fetchSpy).toHaveBeenCalledTimes(2);

		resolveSlowFetch(htmlPageResponse(createNavigablePageHtml(moduleUrl, { label: 'slow' }), { status: 200 }));
		await flushTasks();

		expect(afterSwapSpy).toHaveBeenCalledTimes(1);
		expect(pageLoadSpy).toHaveBeenCalledTimes(2);
		requestAnimationFrameSpy.mockRestore();
	});
	function renderRouter(page: ReturnType<typeof createLinkPage>) {
		root = createRoot(container);
		root.render(
			createElement(EcoRouter, {
				page,
				pageProps: {},
				options: { viewTransitions: false },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);
	}

	async function clickLink(name: string) {
		const link = await vi.waitFor(() => {
			const node = container.querySelector(`[data-testid="${name}-link"]`) as HTMLAnchorElement | null;
			expect(node).not.toBeNull();
			return node as HTMLAnchorElement;
		});
		await userEvent.click(link);
	}

	it('dispatches page-load once on the first load', async () => {
		const pageLoadPaths: string[] = [];
		const record = (event: Event) => pageLoadPaths.push((event as CustomEvent).detail.url.pathname);
		document.addEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD, record);

		try {
			renderRouter(createLinkPage('FirstLoad', '/next', 'Next'));

			await vi.waitFor(() => expect(pageLoadPaths).toEqual([window.location.pathname]));
		} finally {
			document.removeEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD, record);
		}
	});

	it('dispatches page-load after a committed navigation on a real animation frame', async () => {
		const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			htmlPageResponse(createNavigablePageHtml(moduleUrl, { label: 'done' }), { status: 200 }),
		);
		const pageLoadPaths: string[] = [];
		const record = (event: Event) => pageLoadPaths.push((event as CustomEvent).detail.url.pathname);
		document.addEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD, record);

		try {
			renderRouter(createLinkPage('RealFrame', '/next', 'Next'));
			await clickLink('RealFrame');

			await vi.waitFor(() => expect(pageLoadPaths.filter((path) => path === '/next')).toHaveLength(1), {
				timeout: 2000,
			});
		} finally {
			document.removeEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD, record);
		}
	});

	it('skips page-load only for a navigation superseded before its frame runs', async () => {
		const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
		vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
			Promise.resolve(htmlPageResponse(createNavigablePageHtml(moduleUrl, { label: 'done' }), { status: 200 })),
		);
		const frames: FrameRequestCallback[] = [];
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback): number => {
			frames.push(callback);
			return frames.length;
		});
		const pageLoadPaths: string[] = [];
		const record = (event: Event) => pageLoadPaths.push((event as CustomEvent).detail.url.pathname);
		const afterSwap = vi.fn();
		document.addEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD, record);
		document.addEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.AFTER_SWAP, afterSwap);

		try {
			renderRouter(createLinkPage('Superseded', '/first', 'First'));
			await clickLink('Superseded');
			await vi.waitFor(() => expect(afterSwap).toHaveBeenCalledTimes(1));

			const secondLink = document.createElement('a');
			secondLink.href = '/second';
			secondLink.textContent = 'Second';
			container.append(secondLink);
			await userEvent.click(secondLink);
			await vi.waitFor(() => expect(afterSwap).toHaveBeenCalledTimes(2));

			for (const frame of frames) frame(performance.now());

			expect(pageLoadPaths.filter((path) => path === '/first' || path === '/second')).toEqual(['/second']);
		} finally {
			document.removeEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD, record);
			document.removeEventListener(ECO_NAVIGATION_LIFECYCLE_EVENTS.AFTER_SWAP, afterSwap);
		}
	});
});
