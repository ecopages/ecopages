import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import {
	createContext,
	createElement,
	useContext,
	useEffect,
	useState,
	type ComponentType,
	type FC,
	type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';

const loadPageModuleFromDocumentMock = vi.fn();

vi.mock('../src/navigation.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/navigation.ts')>();
	return {
		...actual,
		loadPageModuleFromDocument: (...args: Parameters<typeof actual.loadPageModuleFromDocument>) =>
			loadPageModuleFromDocumentMock(...args),
	};
});

import { EcoRouter, PageContent } from '../src/router.ts';
import { htmlPageResponse, useRouterTestEnvironment } from './react-router.harness.ts';

type LayoutComponent = FC<{ children?: ReactNode }> & {
	config?: { identity?: { id: string; file: string; integration: string } };
};

type RoutedPage = FC & { config?: { layouts: LayoutComponent[] } };

/**
 * Builds a layout the way each page bundle does: a new function per call, carrying
 * the injected component identity that persistence keys on.
 *
 * @remarks
 * Every layout shares one function source and name, as `eco.component` wrappers do, so only
 * the identity tells two layouts apart.
 */
function createLayout(
	testId: string,
	identity: { id: string; file: string },
	render: (testId: string, children: ReactNode) => ReactNode = (id, children) =>
		createElement('div', { 'data-testid': id }, children),
): LayoutComponent {
	const Layout: LayoutComponent = ({ children }) => render(testId, children);
	Layout.config = { identity: { ...identity, integration: 'react' } };
	return Layout;
}

function createPage(name: string, layouts: LayoutComponent[], body: ReactNode = name): RoutedPage {
	const Page: RoutedPage = () => createElement('div', { 'data-testid': `${name}-page` }, body);
	Page.displayName = name;
	Page.config = { layouts };
	return Page;
}

function link(href: string, testId: string): ReactNode {
	return createElement('a', { href, 'data-testid': testId }, href);
}

describe('react-router layout navigation', () => {
	const ctx = useRouterTestEnvironment();

	function mount(initial: RoutedPage, options: { persistLayouts: boolean }): void {
		ctx.root = createRoot(ctx.container);
		ctx.root.render(
			createElement(EcoRouter, {
				page: initial as ComponentType<unknown>,
				pageProps: {},
				options: { ...options, viewTransitions: false },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);
	}

	function routeTo(routes: Record<string, RoutedPage>): void {
		loadPageModuleFromDocumentMock.mockImplementation(async (doc: Document, finalPath: string) => ({
			Component: routes[new URL(finalPath, window.location.origin).pathname],
			props: {},
			doc,
			finalPath,
			moduleUrl: `virtual:${finalPath}`,
		}));
	}

	beforeEach(() => {
		loadPageModuleFromDocumentMock.mockReset();
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
			htmlPageResponse('<html><head></head><body></body></html>'),
		);
	});

	describe('eco.component layout switching', () => {
		it('swaps to the other layout on SPA navigation when both layouts share one wrapper shape', async () => {
			const minimal = createLayout('minimal-layout', {
				id: 'minimal-layout',
				file: '/app/src/layouts/minimal-eco-layout.tsx',
			});
			const appShell = createLayout(
				'app-shell-layout',
				{ id: 'app-shell-layout', file: '/app/src/layouts/app-shell-eco-layout.tsx' },
				(id, children) =>
					createElement(
						'div',
						{ 'data-testid': id },
						createElement('div', { className: 'layout__shell' }, children),
					),
			);
			const missing = createPage('missing', [minimal], link('/home', 'go-home'));
			const home = createPage('home', [appShell]);
			routeTo({ '/home': home });

			mount(missing, { persistLayouts: true });

			await expect.element(page.getByTestId('minimal-layout')).toBeVisible();
			await expect.element(page.getByTestId('missing-page')).toBeVisible();
			await expect.element(page.getByTestId('app-shell-layout')).not.toBeInTheDocument();

			await userEvent.click(page.getByTestId('go-home'));

			await expect.element(page.getByTestId('app-shell-layout')).toBeVisible();
			await expect.element(page.getByTestId('home-page')).toBeVisible();
			await expect.element(page.getByTestId('minimal-layout')).not.toBeInTheDocument();
			expect(ctx.container.querySelector('.layout__shell')).not.toBeNull();
			expect(window.location.pathname).toBe('/home');
		});
	});

	describe('persisted layouts', () => {
		const docsIdentity = { id: 'docs-layout', file: '/app/src/layouts/docs-layout.tsx' };

		it('keeps the same layout element mounted across pages that import their own copy of it', async () => {
			let mounts = 0;
			const MountCounter: FC = () => {
				useEffect(() => {
					mounts += 1;
					return () => {
						mounts -= 1;
					};
				}, []);
				return null;
			};
			const withMountCount = (id: string, children: ReactNode) =>
				createElement('div', { 'data-testid': id }, createElement(MountCounter), children);
			const indexPage = createPage(
				'docs-index',
				[createLayout('docs-layout', docsIdentity, withMountCount)],
				link('/docs/start', 'go-start'),
			);
			const startPage = createPage('docs-start', [createLayout('docs-layout', docsIdentity, withMountCount)]);
			routeTo({ '/docs/start': startPage });

			mount(indexPage, { persistLayouts: true });
			await expect.element(page.getByTestId('docs-layout')).toBeVisible();
			const layoutElement = page.getByTestId('docs-layout').element();
			Object.assign(layoutElement, { persistMarker: true });

			await userEvent.click(page.getByTestId('go-start'));

			await expect.element(page.getByTestId('docs-start-page')).toBeVisible();
			expect(page.getByTestId('docs-layout').element()).toBe(layoutElement);
			expect(layoutElement).toHaveProperty('persistMarker', true);
			expect(mounts).toBe(1);
		});

		it('keeps state held by the layout when the next page reads it', async () => {
			const CountContext = createContext<{ count: number; increment: () => void }>({
				count: -1,
				increment: () => {},
			});
			const CounterProvider: FC<{ testId: string; children?: ReactNode }> = ({ testId, children }) => {
				const [count, setCount] = useState(0);
				return createElement(
					CountContext.Provider,
					{ value: { count, increment: () => setCount((value) => value + 1) } },
					createElement('div', { 'data-testid': testId }, children),
				);
			};
			const withCounter = (id: string, children: ReactNode) =>
				createElement(CounterProvider, { testId: id }, children);
			const CountReadout: FC = () => {
				const { count, increment } = useContext(CountContext);
				return createElement(
					'div',
					null,
					createElement('p', { 'data-testid': 'count' }, String(count)),
					createElement('button', { type: 'button', onClick: increment, 'data-testid': 'increment' }, '+'),
				);
			};
			const indexPage = createPage(
				'docs-index',
				[createLayout('docs-layout', docsIdentity, withCounter)],
				createElement('div', null, createElement(CountReadout), link('/docs/start', 'go-start')),
			);
			const startPage = createPage(
				'docs-start',
				[createLayout('docs-layout', docsIdentity, withCounter)],
				createElement(CountReadout),
			);
			routeTo({ '/docs/start': startPage });

			mount(indexPage, { persistLayouts: true });
			await expect.element(page.getByTestId('count')).toHaveTextContent('0');

			await userEvent.click(page.getByTestId('increment'));
			await expect.element(page.getByTestId('count')).toHaveTextContent('1');

			await userEvent.click(page.getByTestId('go-start'));

			await expect.element(page.getByTestId('docs-start-page')).toBeVisible();
			await expect.element(page.getByTestId('count')).toHaveTextContent('1');
		});

		it('replaces the layout when the next page uses a different one', async () => {
			const docsPage = createPage(
				'docs-index',
				[createLayout('docs-layout', docsIdentity)],
				link('/', 'go-home'),
			);
			const homePage = createPage('home', [
				createLayout('base-layout', { id: 'base-layout', file: '/app/src/layouts/base-layout.tsx' }),
			]);
			routeTo({ '/': homePage });
			window.history.replaceState(null, '', '/docs');

			mount(docsPage, { persistLayouts: true });
			await expect.element(page.getByTestId('docs-layout')).toBeVisible();

			await userEvent.click(page.getByTestId('go-home'));

			await expect.element(page.getByTestId('base-layout')).toBeVisible();
			await expect.element(page.getByTestId('docs-layout')).not.toBeInTheDocument();
		});
	});
});
