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

	test('hands only a Component another Integration owns to the registered Foreign Child host', () => {
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

		expect(LitCounter({ count: 1 })).toBe('lit 1');

		vi.stubGlobal('window', {
			__ECO_PAGES__: {
				foreignChildHost: {
					integration: 'react',
					isRendering: () => true,
					renderForeignChild: (component: unknown, props: Record<string, unknown>) => ({ component, props }),
				},
			},
		});

		expect(LitCounter({ count: 1 })).toEqual({ component: LitCounter, props: { count: 1 } });
		expect(ReactCounter({ count: 2 })).toBe('react 2');
		expect(UnownedCounter({ count: 3 })).toBe('unowned 3');
	});

	test('renders a Component inline when the host is not rendering', () => {
		const LitCounter = eco.component<{ count: number }, string>({
			identity: { id: 'lit-counter', file: 'src/lit-counter.lit.tsx', integration: 'lit' },
			render: ({ count }) => `lit ${count}`,
		});
		let rendering = false;
		vi.stubGlobal('window', {
			__ECO_PAGES__: {
				foreignChildHost: {
					integration: 'react',
					isRendering: () => rendering,
					renderForeignChild: () => 'react element',
				},
			},
		});

		expect(LitCounter({ count: 1 })).toBe('lit 1');
		rendering = true;
		expect(LitCounter({ count: 1 })).toBe('react element');
		rendering = false;
		expect(LitCounter({ count: 2 })).toBe('lit 2');
	});
});
