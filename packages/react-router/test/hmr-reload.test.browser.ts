import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { EcoRouter, PageContent } from '../src/router';

declare global {
	interface Window {
		__ecopages_router_active__?: boolean;
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

describe('EcoRouter HMR Integration', () => {
	let container: HTMLDivElement;
	let root: ReturnType<typeof createRoot>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);

		delete window.__ecopages_reload_current_page__;
	});

	afterEach(() => {
		if (root) {
			root.unmount();
		}
		if (container && container.parentNode) {
			container.parentNode.removeChild(container);
		}
		vi.restoreAllMocks();
	});

	describe('HMR reload hook registration', () => {
		it('should register __ecopages_reload_current_page__ callback', async () => {
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

			expect(window.__ecopages_reload_current_page__).toBeDefined();
			expect(typeof window.__ecopages_reload_current_page__).toBe('function');
		});

		it('should clean up __ecopages_reload_current_page__ on unmount', async () => {
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
			expect(window.__ecopages_reload_current_page__).toBeDefined();

			root.unmount();
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(window.__ecopages_reload_current_page__).toBeUndefined();
		});

		it('should return a promise when called', async () => {
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

			expect(window.__ecopages_reload_current_page__).toBeDefined();

			const result = window.__ecopages_reload_current_page__?.({ clearCache: false });

			expect(result).toBeInstanceOf(Promise);
			await expect(result).resolves.toBeUndefined();
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
	});
});
