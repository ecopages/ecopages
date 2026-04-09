import { describe, expect, test } from 'vitest';
import type { Middleware } from '../types/public-types.ts';
import { eco } from './eco.browser.ts';

describe('browser eco facade', () => {
	test('creates browser-safe page components without server runtime imports', () => {
		const Layout = eco.layout({
			render: ({ children }) => `<main>${children ?? ''}</main>`,
		});

		const staticPaths = async () => ({ paths: [{ params: { slug: 'intro' } }] });
		const metadata = async () => ({ title: 'Docs', description: 'Docs page' });
		const middleware: Middleware[] = [async (_ctx, next) => next()];

		const Page = eco.page({
			layout: Layout,
			dependencies: {
				components: [Layout],
			},
			cache: 'dynamic',
			staticPaths,
			metadata,
			middleware,
			render: () => '<article>Docs</article>',
		});

		expect(Page({})).toBe('<article>Docs</article>');
		expect(Page.config?.layout).toBe(Layout);
		expect(Page.config?.dependencies?.components).toEqual([Layout, Layout]);
		expect(Page.staticPaths).toBe(staticPaths);
		expect(Page.metadata).toBe(metadata);
		expect(Page.middleware).toBe(middleware);
	});

	test('preserves the metadata helper contract', async () => {
		const getMetadata = eco.metadata(async () => ({ title: 'Browser title', description: 'Browser desc' }));

		await expect(getMetadata({} as never)).resolves.toEqual({
			title: 'Browser title',
			description: 'Browser desc',
		});
	});
});
