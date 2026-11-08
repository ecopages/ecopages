import { describe, expect, test, vi } from 'vitest';
import type { FileRouteMiddleware } from '../types/contracts.ts';
import { eco } from './eco.browser.ts';

describe('browser eco facade', () => {
	test('creates browser-safe page components without server runtime imports', () => {
		const Layout = eco.layout({
			render: ({ children }) => `<main>${children ?? ''}</main>`,
		});

		const staticPaths = async () => ({ paths: [{ params: { slug: 'intro' } }] });
		const metadata = async () => ({ title: 'Docs', description: 'Docs page' });
		const middleware: FileRouteMiddleware[] = [async (_ctx, next) => next()];

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
		expect(Page.config?.layouts).toEqual([Layout]);
		expect(Page.config?.dependencies?.components).toEqual([Layout]);
		expect(Page.staticPaths).toBe(staticPaths);
		expect(Page.metadata).toBe(metadata);
		expect(Page.middleware).toBe(middleware);
	});

	test('renders every Component inline for its caller, whatever Integration owns it or is rendering', () => {
		const LitCounter = eco.component<{ count: number }, string>({
			identity: { id: 'lit-counter', file: 'src/lit-counter.lit.tsx', integration: 'lit' },
			render: ({ count }) => `lit ${count}`,
		});
		const ReactCounter = eco.component<{ count: number }, string>({
			integration: 'react',
			render: ({ count }) => `react ${count}`,
		});
		const UnownedCounter = eco.component<{ count: number }, string>({
			render: ({ count }) => `unowned ${count}`,
		});

		vi.stubGlobal('window', {
			__ECO_PAGES__: {
				foreignChildHost: {
					integration: 'react',
					renderForeignChild: (component: unknown, props: Record<string, unknown>) => ({ component, props }),
				},
			},
		});

		expect(LitCounter({ count: 1 })).toBe('lit 1');
		expect(ReactCounter({ count: 2 })).toBe('react 2');
		expect(UnownedCounter({ count: 3 })).toBe('unowned 3');
		vi.unstubAllGlobals();
	});
});
