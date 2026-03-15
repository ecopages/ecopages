import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import { EcoRouter, PageContent } from '../src/router';

declare global {
	interface Window {
		__ecopages_cleanup_page_root__?: () => void;
	}
}

function createMockPageComponent(name: string) {
	const Component = () => createElement('div', { 'data-testid': name }, `Page: ${name}`);
	Component.displayName = name;
	return Component;
}

function createLayoutAwarePage(name: string) {
	const Layout = ({
		children,
		locals,
	}: {
		children: ReactNode;
		locals?: { session?: { user?: { name?: string } } };
	}) =>
		createElement(
			'div',
			{ 'data-testid': `${name}-layout` },
			`${locals?.session?.user?.name ?? 'anonymous'}`,
			children,
		);

	const Page = ((_props: { locals?: { session?: { user?: { name?: string } } } }) =>
		createElement('div', { 'data-testid': `${name}-page` }, name)) as ReturnType<typeof createMockPageComponent> & {
		config?: { layout?: typeof Layout };
	};

	Page.displayName = name;
	Page.config = { layout: Layout };
	return Page;
}

function createLinkPage(name: string, href: string) {
	const Component = () => createElement('a', { href, 'data-testid': `${name}-link` }, name);
	Component.displayName = name;
	return Component;
}

function createMultiLinkPage(name: string, links: Array<{ href: string; label: string }>) {
	const Component = () =>
		createElement(
			'div',
			{ 'data-testid': `${name}-page` },
			...links.map((link) =>
				createElement('a', { key: link.href, href: link.href, 'data-testid': `${name}-${link.label}` }, link.label),
			),
		);
	Component.displayName = name;
	return Component;
}

describe('EcoRouter HMR Integration', () => {
	let container: HTMLDivElement;
	let root: ReturnType<typeof createRoot>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	afterEach(() => {
		if (root) {
			root.unmount();
		}
		if (container && container.parentNode) {
			container.parentNode.removeChild(container);
		}
		vi.restoreAllMocks();
		delete window.__ecopages_cleanup_page_root__;
	});

	it('sets and clears the router ownership flag', async () => {
		const PageA = createMockPageComponent('PageA');

		root = createRoot(container);
		root.render(
			createElement(EcoRouter, {
				page: PageA,
				pageProps: {},
				children: createElement(PageContent),
			}),
		);

		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(getEcoNavigationRuntime(window).getOwnerState().owner).toBe('react-router');

		root.unmount();
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(getEcoNavigationRuntime(window).getOwnerState().owner).toBe('none');
	});

	describe('HMR reload hook registration', () => {
		it('registers current-page reload through the navigation coordinator', async () => {
			const PageA = createMockPageComponent('PageA');

			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: PageA,
					pageProps: {},
					// oxlint-disable-next-line no-children-prop
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(getEcoNavigationRuntime(window).getOwnerState()).toEqual({
				owner: 'react-router',
				canHandleSpaNavigation: true,
			});
		});

		it('cleans up the registered current-page reload handler on unmount', async () => {
			const PageA = createMockPageComponent('PageA');

			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: PageA,
					pageProps: {},
					// oxlint-disable-next-line no-children-prop
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));
			expect(getEcoNavigationRuntime(window).getOwnerState().owner).toBe('react-router');

			root.unmount();
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(getEcoNavigationRuntime(window).getOwnerState()).toEqual({
				owner: 'none',
				canHandleSpaNavigation: false,
			});
		});

		it('reloads the current page through the navigation coordinator', async () => {
			const PageA = createMockPageComponent('PageA');
			const moduleUrl = new URL('./fixtures/reloaded-page.tsx', import.meta.url).toString();
			const mockHtml = `
				<html>
					<body>
						<script id="__ECO_PAGE_DATA__" type="application/json">{}</script>
						<script type="module">import Page from '${moduleUrl}'; window.__ECO_PAGE__={module:'${moduleUrl}',props:{}}; hydrateRoot(document, Page);</script>
					</body>
				</html>
			`;
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(mockHtml, { status: 200 }));

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
			const result = getEcoNavigationRuntime(window).reloadCurrentPage({ clearCache: false });

			expect(result).toBeInstanceOf(Promise);
			await expect(result).resolves.toBe(true);
		});

		it('passes locals to layouts when persistLayouts is disabled', async () => {
			const Page = createLayoutAwarePage('PageWithLocals');

			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: Page,
					pageProps: { locals: { session: { user: { name: 'Andee' } } } },
					options: { persistLayouts: false },
					// oxlint-disable-next-line no-children-prop
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(container.textContent).toContain('Andee');
		});

		it('passes locals to layouts when persistLayouts is enabled', async () => {
			const Page = createLayoutAwarePage('PageWithPersistentLocals');

			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: Page,
					pageProps: { locals: { session: { user: { name: 'Andee' } } } },
					options: { persistLayouts: true },
					// oxlint-disable-next-line no-children-prop
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(container.textContent).toContain('Andee');
		});

		it('delegates to browser-router without tearing down the current page first', async () => {
			const Page = createLinkPage('LeaveReact', '/outside-react');
			const cleanupSpy = vi.fn();
			const browserNavigateSpy = vi.fn(async () => undefined);
			window.__ecopages_cleanup_page_root__ = cleanupSpy;
			const unregister = getEcoNavigationRuntime(window).register({
				owner: 'browser-router',
				navigate: async (request) => {
					await browserNavigateSpy(request.href, { direction: request.direction });
					return true;
				},
			});

			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response('<html><body><main>Outside React</main></body></html>', { status: 200 }),
			);

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
			const link = container.querySelector('[data-testid="LeaveReact-link"]') as HTMLAnchorElement | null;
			expect(link).not.toBeNull();
			link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(cleanupSpy).not.toHaveBeenCalled();
			expect(browserNavigateSpy).toHaveBeenCalledWith('/outside-react', { direction: 'forward' });
			unregister();
		});

		it('ignores stale navigation results when a newer route finishes first', async () => {
			const Page = createMultiLinkPage('RaceStart', [
				{ href: '/slow', label: 'slow-link' },
				{ href: '/fast', label: 'fast-link' },
			]);
			const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
			const createHtml = (label: string) => `
				<html>
					<body>
						<script id="__ECO_PAGE_DATA__" type="application/json">${JSON.stringify({ label })}</script>
						<script type="module">import Page from '${moduleUrl}'; window.__ECO_PAGE__={module:'${moduleUrl}',props:${JSON.stringify({ label })}}; hydrateRoot(document, Page);</script>
					</body>
				</html>
			`;

			vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
				const url = input.toString();
				if (url === '/slow') {
					await new Promise((resolve) => setTimeout(resolve, 60));
					return new Response(createHtml('slow'), { status: 200 });
				}
				if (url === '/fast') {
					return new Response(createHtml('fast'), { status: 200 });
				}
				throw new Error(`Unexpected fetch: ${url}`);
			});

			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: Page,
					pageProps: {},
					options: { viewTransitions: false },
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));
			const slowLink = container.querySelector('[data-testid="RaceStart-slow-link"]') as HTMLAnchorElement | null;
			const fastLink = container.querySelector('[data-testid="RaceStart-fast-link"]') as HTMLAnchorElement | null;
			expect(slowLink).not.toBeNull();
			expect(fastLink).not.toBeNull();

			slowLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
			fastLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

			await new Promise((resolve) => setTimeout(resolve, 160));

			expect(container.textContent).toContain('fast');
			expect(container.textContent).not.toContain('slow');
			expect(window.__ECO_PAGE__?.props).toEqual({ label: 'fast' });
		});

		it('ignores stale browser-router delegation when a newer React route finishes first', async () => {
			const Page = createMultiLinkPage('FallbackRace', [
				{ href: '/outside-react', label: 'outside-link' },
				{ href: '/fast', label: 'fast-link' },
			]);
			const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();
			const cleanupSpy = vi.fn();
			const browserNavigateSpy = vi.fn(async () => undefined);
			window.__ecopages_cleanup_page_root__ = cleanupSpy;
			const unregister = getEcoNavigationRuntime(window).register({
				owner: 'browser-router',
				navigate: async (request) => {
					await browserNavigateSpy(request.href, { direction: request.direction });
					return true;
				},
			});
			const createHtml = (label: string) => `
				<html>
					<body>
						<script id="__ECO_PAGE_DATA__" type="application/json">${JSON.stringify({ label })}</script>
						<script type="module">import Page from '${moduleUrl}'; window.__ECO_PAGE__={module:'${moduleUrl}',props:${JSON.stringify({ label })}}; hydrateRoot(document, Page);</script>
					</body>
				</html>
			`;

			vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
				const url = input.toString();
				if (url === '/outside-react') {
					await new Promise((resolve) => setTimeout(resolve, 60));
					return new Response('<html><body><main>Outside React</main></body></html>', { status: 200 });
				}
				if (url === '/fast') {
					return new Response(createHtml('fast'), { status: 200 });
				}
				throw new Error(`Unexpected fetch: ${url}`);
			});

			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: Page,
					pageProps: {},
					options: { viewTransitions: false },
					children: createElement(PageContent),
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 100));
			const outsideLink = container.querySelector('[data-testid="FallbackRace-outside-link"]') as HTMLAnchorElement | null;
			const fastLink = container.querySelector('[data-testid="FallbackRace-fast-link"]') as HTMLAnchorElement | null;
			expect(outsideLink).not.toBeNull();
			expect(fastLink).not.toBeNull();

			outsideLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
			fastLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

			await new Promise((resolve) => setTimeout(resolve, 160));

			expect(cleanupSpy).not.toHaveBeenCalled();
			expect(browserNavigateSpy).not.toHaveBeenCalled();
			expect(container.textContent).toContain('fast');
			expect(window.__ECO_PAGE__?.props).toEqual({ label: 'fast' });
			unregister();
		});
	});
});
