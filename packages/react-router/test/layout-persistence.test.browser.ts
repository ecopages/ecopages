import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { EcoRouter, PageContent } from '../src/router.ts';
import {
	createLayoutAwarePage,
	createMockPageComponent,
	createPageWithCollidingDisplayNameLayout,
	useRouterTestEnvironment,
} from './react-router.harness.ts';

describe('EcoRouter layouts', () => {
	const ctx = useRouterTestEnvironment();

	it('passes locals to layouts when persistLayouts is disabled', async () => {
		const Page = createLayoutAwarePage('PageWithLocals');

		ctx.root = createRoot(ctx.container);
		ctx.root.render(
			createElement(EcoRouter, {
				page: Page,
				pageProps: { locals: { session: { user: { name: 'Andee' } } } },
				options: { persistLayouts: false },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await expect.element(ctx.container).toHaveTextContent('Andee');
	});

	it('passes locals to layouts when persistLayouts is enabled', async () => {
		const Page = createLayoutAwarePage('PageWithPersistentLocals');

		ctx.root = createRoot(ctx.container);
		ctx.root.render(
			createElement(EcoRouter, {
				page: Page,
				pageProps: { locals: { session: { user: { name: 'Andee' } } } },
				options: { persistLayouts: true },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await expect.element(ctx.container).toHaveTextContent('Andee');
	});

	it('applies layout entry prop factories when persistLayouts is enabled', async () => {
		const Layout = ({ children, label }: { children: ReactNode; label?: string }) =>
			createElement('section', { 'data-testid': 'factory-layout' }, label, children);
		const Page = (() => createElement('div', null, 'Factory page')) as ReturnType<
			typeof createMockPageComponent
		> & {
			config?: {
				layouts: [typeof Layout];
				layoutEntries: Array<{
					component: typeof Layout;
					props: (context: { query?: Record<string, string> }) => { label: string };
				}>;
			};
		};
		Page.config = {
			layouts: [Layout],
			layoutEntries: [
				{
					component: Layout,
					props: ({ query }) => ({ label: `preview:${query?.preview ?? 'off'}` }),
				},
			],
		};

		ctx.root = createRoot(ctx.container);
		ctx.root.render(
			createElement(EcoRouter, {
				page: Page,
				pageProps: { query: { preview: '1' } },
				options: { persistLayouts: true },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await expect.element(ctx.container).toHaveTextContent('preview:1');
	});

	it('does not reuse a persisted layout when plain layouts share the same display name', async () => {
		const DocsPage = createPageWithCollidingDisplayNameLayout('DocsPage', 'docs-layout', 'Docs Layout');
		const HomePage = createPageWithCollidingDisplayNameLayout('HomePage', 'base-layout', 'Base Layout');

		ctx.root = createRoot(ctx.container);
		ctx.root.render(
			createElement(EcoRouter, {
				page: DocsPage,
				pageProps: {},
				options: { persistLayouts: true },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await expect.element(page.getByTestId('docs-layout')).toHaveTextContent('Docs Layout');

		ctx.root.render(
			createElement(EcoRouter, {
				page: HomePage,
				pageProps: {},
				options: { persistLayouts: true },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await expect.element(page.getByTestId('base-layout')).toHaveTextContent('Base Layout');
		await expect.element(page.getByTestId('docs-layout')).not.toBeInTheDocument();
	});
});
