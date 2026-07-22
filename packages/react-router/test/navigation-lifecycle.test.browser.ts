import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ECO_NAVIGATION_LIFECYCLE_EVENTS } from '@ecopages/core/router/navigation-lifecycle';
import { EcoRouter, PageContent, clearLayoutCache } from '../src/router.ts';

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

function createMockPageComponent(name: string) {
	const Component = () => createElement('div', { 'data-testid': `${name}-page` }, `Page: ${name}`);
	Component.displayName = name;
	return Component;
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
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.append(container);
		user = userEvent.setup();
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

		await new Promise((resolve) => setTimeout(resolve, 100));
		const link = container.querySelector('[data-testid="PageA-link"]') as HTMLAnchorElement | null;
		expect(link).not.toBeNull();
		await user.click(link as HTMLAnchorElement);

		await vi.waitFor(() => {
			expect(events).toEqual([
				ECO_NAVIGATION_LIFECYCLE_EVENTS.BEFORE_SWAP,
				ECO_NAVIGATION_LIFECYCLE_EVENTS.AFTER_SWAP,
				ECO_NAVIGATION_LIFECYCLE_EVENTS.PAGE_LOAD,
			]);
		});
		expect(container.textContent).toContain('done');
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

		await new Promise((resolve) => setTimeout(resolve, 100));

		const slowLink = document.createElement('a');
		slowLink.href = '/slow';
		slowLink.textContent = 'Slow';
		container.append(slowLink);
		const fastLink = container.querySelector('[data-testid="RacePage-link"]') as HTMLAnchorElement | null;

		void user.click(slowLink);
		await user.click(fastLink as HTMLAnchorElement);

		await vi.waitFor(() => {
			expect(afterSwapSpy).toHaveBeenCalledTimes(1);
		});
		expect(pageLoadSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy).toHaveBeenCalledTimes(2);

		resolveSlowFetch(htmlPageResponse(createNavigablePageHtml(moduleUrl, { label: 'slow' }), { status: 200 }));
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(afterSwapSpy).toHaveBeenCalledTimes(1);
		expect(pageLoadSpy).toHaveBeenCalledTimes(1);
		requestAnimationFrameSpy.mockRestore();
	});
});
