import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createElement, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { EcoRouter, PageContent } from '../src/router.ts';
import { useRouterTestEnvironment } from './react-router.harness.ts';

/** The browser renders each layout tier from props the server resolved and never runs a layout factory. */
describe('EcoRouter layouts rendered from server-resolved tier props', () => {
	const ctx = useRouterTestEnvironment();

	function setup() {
		const factory = vi.fn(() => {
			throw new Error('a layout props factory must not run in the browser');
		});
		const Shell = ({ children, user }: { children?: ReactNode; user?: string }) => {
			const [count, setCount] = useState(0);
			return createElement(
				'section',
				{ 'data-testid': 'shell' },
				createElement('span', { 'data-testid': 'user' }, user ?? 'guest'),
				createElement(
					'button',
					{ 'data-testid': 'inc', onClick: () => setCount((value) => value + 1) },
					`count:${count}`,
				),
				children,
			);
		};
		const makePage = (name: string) => {
			const Page = (() => createElement('div', { 'data-testid': 'page' }, name)) as (() => ReactNode) & {
				config?: unknown;
			};
			Page.config = {
				layouts: [Shell],
				layoutEntries: [{ component: Shell, props: factory }],
			};
			return Page;
		};
		return { Shell, factory, PageA: makePage('page-a'), PageB: makePage('page-b') };
	}

	function render(Page: ReturnType<typeof setup>['PageA'], tierProps: Record<string, unknown>[]) {
		ctx.root.render(
			createElement(EcoRouter, {
				page: Page,
				pageProps: {},
				tierProps,
				options: { persistLayouts: true },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);
	}

	it('renders a layout from tier props without calling its factory', async () => {
		const { PageA, factory } = setup();
		ctx.root = createRoot(ctx.container);

		render(PageA, [{ user: 'Ada' }]);

		await expect.element(page.getByTestId('user')).toHaveTextContent('Ada');
		expect(factory).not.toHaveBeenCalled();
	});

	it('keeps a layout mounted, with its state, when the next page brings new tier props', async () => {
		const { PageA, PageB, factory } = setup();
		ctx.root = createRoot(ctx.container);
		render(PageA, [{ user: 'Ada' }]);
		await expect.element(page.getByTestId('user')).toHaveTextContent('Ada');
		await userEvent.click(page.getByTestId('inc'));
		await expect.element(page.getByTestId('inc')).toHaveTextContent('count:1');

		render(PageB, [{ user: 'Bob' }]);

		await expect.element(page.getByTestId('page')).toHaveTextContent('page-b');
		await expect.element(page.getByTestId('user')).toHaveTextContent('Bob');
		await expect.element(page.getByTestId('inc')).toHaveTextContent('count:1');
		expect(factory).not.toHaveBeenCalled();
	});
});
