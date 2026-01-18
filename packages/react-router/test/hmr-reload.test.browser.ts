import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { EcoRouter, PageContent } from '../src/router';

declare global {
	interface Window {
		__ecopages_router_active__?: boolean;
		__ecopages_reload_current_page__?: () => Promise<void>;
	}
}

function createMockPageComponent(name: string) {
	const Component = () => createElement('div', { 'data-testid': name }, `Page: ${name}`);
	Component.displayName = name;
	return Component;
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

			const result = window.__ecopages_reload_current_page__?.();

			expect(result).toBeInstanceOf(Promise);
		});
	});
});
