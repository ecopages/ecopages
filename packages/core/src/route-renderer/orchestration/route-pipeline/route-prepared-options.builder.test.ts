import { describe, expect, it, vi } from 'vitest';
import type { EcoPagesAppConfig } from '../../../config/internal-types.ts';
import type {
	EcoComponent,
	EcoPageComponent,
	HtmlTemplateProps,
	RouteRendererOptions,
} from '../../../types/contracts.ts';
import { buildPreparedRenderOptions } from './route-prepared-options.builder.ts';

describe('buildPreparedRenderOptions static pages', () => {
	it('gives a static page no locals and keeps them out of its page props', () => {
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<unknown>;
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
		} as EcoPagesAppConfig;

		const result = buildPreparedRenderOptions({
			routeOptions: {
				file: '/app/pages/index.tsx',
				params: {},
				query: {},
			} as RouteRendererOptions,
			resolvedInputs: {
				Page,
				HtmlTemplate,
				Layouts: [],
				props: {},
				metadata: { title: 'Page', description: 'Page' },
				integrationSpecificProps: {},
			},
			resolvedDependencies: [],
			allDependencies: [],
			appConfig,
		});

		expect(result.locals).toBeUndefined();
		expect(result.pageProps).toEqual({ params: {}, query: {} });
		expect(result).not.toHaveProperty('pageLocals');
	});

	it('does not call a cache function while planning a route whose props hook is skipped', () => {
		const cache = vi.fn(({ props }: { props: { product: { id: string } } }) => ({
			revalidate: 60,
			tags: [props.product.id],
		}));
		const Page = Object.assign(() => '<main>Page</main>', { cache }) as unknown as EcoPageComponent<unknown>;

		const result = buildPreparedRenderOptions({
			routeOptions: {
				file: '/app/pages/products/[slug].tsx',
				skipPropsHook: true,
			} as RouteRendererOptions,
			resolvedInputs: {
				Page,
				HtmlTemplate: (() => '<html></html>') as EcoComponent<HtmlTemplateProps>,
				Layouts: [],
				props: {},
				metadata: { title: 'Page', description: 'Page' },
				integrationSpecificProps: {},
			},
			resolvedDependencies: [],
			allDependencies: [],
			appConfig: { cache: { defaultStrategy: 'static' } } as EcoPagesAppConfig,
		});

		expect(cache).not.toHaveBeenCalled();
		expect(result.cacheStrategy).toBeUndefined();
	});

	it('calls a cache function when the props hook is skipped but the caller passed props', () => {
		const cache = vi.fn(({ props }: { props: { id: string } }) => ({ revalidate: 60, tags: [props.id] }));
		const Page = Object.assign(() => '<main>Page</main>', { cache }) as unknown as EcoPageComponent<unknown>;

		const result = buildPreparedRenderOptions({
			routeOptions: {
				file: '/app/pages/view.tsx',
				skipPropsHook: true,
				props: { id: 'v1' },
			} as unknown as RouteRendererOptions,
			resolvedInputs: {
				Page,
				HtmlTemplate: (() => '<html></html>') as EcoComponent<HtmlTemplateProps>,
				Layouts: [],
				props: { id: 'v1' },
				metadata: { title: 'Page', description: 'Page' },
				integrationSpecificProps: {},
			},
			resolvedDependencies: [],
			allDependencies: [],
			appConfig: { cache: { defaultStrategy: 'static' } } as EcoPagesAppConfig,
		});

		expect(result.cacheStrategy).toEqual({ revalidate: 60, tags: ['v1'] });
	});

	it('resolves a cache function from the Params, Query and props of the render', () => {
		const Page = Object.assign(() => '<main>Page</main>', {
			cache: ({
				params,
				query,
				props,
			}: {
				params: Record<string, unknown>;
				query: Record<string, unknown>;
				props: Record<string, unknown>;
			}) => ({
				revalidate: 60,
				tags: [`product:${params.slug}`, `tab:${query.tab}`, `category:${props.category}`],
			}),
		}) as unknown as EcoPageComponent<unknown>;
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;

		const result = buildPreparedRenderOptions({
			routeOptions: {
				file: '/app/pages/products/[slug].tsx',
				params: { slug: 'chair-1' },
				query: { tab: 'specs' },
			} as RouteRendererOptions,
			resolvedInputs: {
				Page,
				HtmlTemplate,
				Layouts: [],
				props: { category: 'seating' },
				metadata: { title: 'Page', description: 'Page' },
				integrationSpecificProps: {},
			},
			resolvedDependencies: [],
			allDependencies: [],
			appConfig: { cache: { defaultStrategy: 'static' } } as EcoPagesAppConfig,
		});

		expect(result.cacheStrategy).toEqual({
			revalidate: 60,
			tags: ['product:chair-1', 'tab:specs', 'category:seating'],
		});
	});
});
