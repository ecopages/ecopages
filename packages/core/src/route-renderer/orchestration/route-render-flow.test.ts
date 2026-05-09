import { describe, expect, it } from 'vitest';
import type {
	EcoComponent,
	HtmlTemplateProps,
	RouteRendererBody,
	RouteRendererOptions,
} from '../../types/public-types.ts';
import { RouteRenderFlow } from './route-render-flow.ts';

describe('RouteRenderFlow', () => {
	const appConfig = {
		cache: { defaultStrategy: 'static' },
		defaultMetadata: { title: 'Default title', description: 'Default description' },
		integrations: [],
	} as any;
	const assetProcessingService = {
		processDependencies: async () => [],
	} as any;

	it('captures streamed render bodies before final HTML handling', async () => {
		const flow = new RouteRenderFlow(appConfig, assetProcessingService);
		const encoder = new TextEncoder();

		const result = await flow.captureHtmlRender(
			async () =>
				new ReadableStream({
					start(controller) {
						controller.enqueue(encoder.encode('<html><body><main>Streamed</main></body></html>'));
						controller.close();
					},
				}) as unknown as BodyInit,
		);

		expect(result.body).toBeInstanceOf(ReadableStream);
		expect(result.html).toContain('<main>Streamed</main>');
	});

	it('preserves streamed bodies when no boundary resolution or attribute stamping is required', async () => {
		const flow = new RouteRenderFlow(appConfig, assetProcessingService);
		const encoder = new TextEncoder();
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as EcoComponent<Record<string, unknown>>;
		(Page as EcoComponent<Record<string, unknown>> & { cache?: unknown }).cache = { revalidate: 60 };

		const result = await flow.execute(
			{
				file: '/app/pages/index.tsx',
				params: {},
				query: {},
			} as unknown as RouteRendererOptions,
			'ghtml',
			{
				resolvePageModule: async () => ({ Page, integrationSpecificProps: {} }),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({ props: {}, metadata: appConfig.defaultMetadata }),
				resolveDependencies: async () => [],
				buildPageBrowserGraph: async () => undefined,
				shouldRenderPageComponent: () => true,
				renderPageComponent: async () => ({
					html: '<main>Page</main>',
					canAttachAttributes: true,
					integrationName: 'ghtml',
				}),
				render: async () =>
					new ReadableStream({
						start(controller) {
							controller.enqueue(encoder.encode('<html><body><main>Streamed</main></body></html>'));
							controller.close();
						},
					}) as unknown as BodyInit,
				getDocumentAttributes: () => undefined,
				applyAttributesToHtmlElement: (html) => html,
				applyAttributesToFirstBodyElement: (html) => html,
				transformResponse: async (response) => response.body as RouteRendererBody,
			},
		);

		expect(result.cacheStrategy).toEqual({ revalidate: 60 });
		expect(result.body).toBeInstanceOf(ReadableStream);
		expect(await new Response(result.body as BodyInit).text()).toContain('<main>Streamed</main>');
	});

	it('applies root and document attributes to fully resolved route HTML', async () => {
		const flow = new RouteRenderFlow(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as EcoComponent<Record<string, unknown>>;
		(Page as EcoComponent<Record<string, unknown>> & { cache?: unknown }).cache = { revalidate: 60 };

		const result = await flow.execute(
			{
				file: '/app/pages/index.tsx',
				params: {},
				query: {},
			} as unknown as RouteRendererOptions,
			'ghtml',
			{
				resolvePageModule: async () => ({ Page, integrationSpecificProps: {} }),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({ props: {}, metadata: appConfig.defaultMetadata }),
				resolveDependencies: async () => [],
				buildPageBrowserGraph: async () => undefined,
				shouldRenderPageComponent: () => true,
				renderPageComponent: async () => ({
					html: '<main>Page</main>',
					canAttachAttributes: true,
					integrationName: 'ghtml',
					rootAttributes: { 'data-eco-component-id': 'eco-page-root' },
				}),
				render: async () => '<html><body><main>Resolved</main></body></html>',
				getDocumentAttributes: () => ({ 'data-eco-document-owner': 'react-router' }),
				applyAttributesToHtmlElement: (html, attributes) =>
					html.replace('<html', `<html data-eco-document-owner="${attributes['data-eco-document-owner']}"`),
				applyAttributesToFirstBodyElement: (html, attributes) =>
					html.replace('<main', `<main data-eco-component-id="${attributes['data-eco-component-id']}"`),
				transformResponse: async (response) => await response.text(),
			},
		);

		expect(result.cacheStrategy).toEqual({ revalidate: 60 });
		expect(result.body).toContain('<html data-eco-document-owner="react-router"><body>');
		expect(result.body).toContain('<main data-eco-component-id="eco-page-root">Resolved</main>');
	});

	it('throws when route HTML contains escaped unresolved boundary artifacts', async () => {
		const flow = new RouteRenderFlow(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as EcoComponent<Record<string, unknown>>;

		await expect(
			flow.execute(
				{
					file: '/app/pages/index.tsx',
					params: {},
					query: {},
				} as unknown as RouteRendererOptions,
				'ghtml',
				{
					resolvePageModule: async () => ({ Page, integrationSpecificProps: {} }),
					getHtmlTemplate: async () => HtmlTemplate,
					resolvePageData: async () => ({ props: {}, metadata: appConfig.defaultMetadata }),
					resolveDependencies: async () => [],
					buildPageBrowserGraph: async () => undefined,
					shouldRenderPageComponent: () => true,
					renderPageComponent: async () => ({
						html: '<main>Page</main>',
						canAttachAttributes: true,
						integrationName: 'ghtml',
					}),
					render: async () =>
						'<html><body>&amp;lt;eco-marker data-eco-node-id=&quot;n_2&quot; data-eco-component-ref=&quot;page-component&quot; data-eco-props-ref=&quot;p_2&quot;&amp;gt;&amp;lt;/eco-marker&amp;gt;</body></html>',
					getDocumentAttributes: () => undefined,
					applyAttributesToHtmlElement: (html) => html,
					applyAttributesToFirstBodyElement: (html) => html,
					transformResponse: async (response) => await response.text(),
				},
			),
		).rejects.toThrow('Full-route unresolved-boundary fallback has been removed');
	});

	it('throws when route HTML returns unresolved boundary artifact HTML', async () => {
		const flow = new RouteRenderFlow(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as EcoComponent<Record<string, unknown>>;

		await expect(
			flow.execute(
				{
					file: '/app/pages/index.tsx',
					params: {},
					query: {},
				} as unknown as RouteRendererOptions,
				'ghtml',
				{
					resolvePageModule: async () => ({ Page, integrationSpecificProps: {} }),
					getHtmlTemplate: async () => HtmlTemplate,
					resolvePageData: async () => ({ props: {}, metadata: appConfig.defaultMetadata }),
					resolveDependencies: async () => [],
					buildPageBrowserGraph: async () => undefined,
					shouldRenderPageComponent: () => true,
					renderPageComponent: async () => ({
						html: '<main>Page</main>',
						canAttachAttributes: true,
						integrationName: 'ghtml',
					}),
					render: async () =>
						'<html><body><eco-marker data-eco-node-id="n_1" data-eco-component-ref="unexpected-marker" data-eco-props-ref="p_1"></eco-marker></body></html>',
					getDocumentAttributes: () => undefined,
					applyAttributesToHtmlElement: (html) => html,
					applyAttributesToFirstBodyElement: (html) => html,
					transformResponse: async (response) => await response.text(),
				},
			),
		).rejects.toThrow('Full-route unresolved-boundary fallback has been removed');
	});
});
