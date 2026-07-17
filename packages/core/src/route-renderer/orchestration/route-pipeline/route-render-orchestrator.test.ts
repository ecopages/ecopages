import { describe, expect, it } from 'vitest';
import type {
	EcoComponent,
	HtmlTemplateProps,
	IntegrationRendererRenderOptions,
	PageBrowserGraphContribution,
	PageMetadataProps,
	RouteRendererBody,
	RouteRendererOptions,
} from '../../../types/public-types.ts';
import { createUnresolvedMarkerArtifact } from '../integration-renderer.test-fixtures.ts';
import { buildRouteHtmlFinalization } from './route-html-finalization.service.ts';
import {
	type RouteHtmlFinalization,
	type RouteRenderOrchestratorAdapter,
	RouteRenderOrchestrator,
} from './route-render-orchestrator.ts';
import { resolvePageLayoutComponents } from '../document-shell/layout-shell-props.service.ts';

function createFlowAdapter(input: {
	resolvePageModule: (file: string) => Promise<{
		Page: EcoComponent<Record<string, unknown>>;
		integrationSpecificProps: Record<string, unknown>;
		getStaticProps?: unknown;
		getMetadata?: unknown;
	}>;
	getHtmlTemplate: () => Promise<EcoComponent<HtmlTemplateProps>>;
	resolvePageData: (
		pageModule: {
			getStaticProps?: unknown;
			getMetadata?: unknown;
		},
		routeOptions: RouteRendererOptions,
	) => Promise<{ props: Record<string, unknown>; metadata: PageMetadataProps }>;
	resolveDependencies: (components: (EcoComponent | Partial<EcoComponent>)[]) => Promise<any[]>;
	collectPageBrowserGraphContribution: (routeFile: string) => Promise<PageBrowserGraphContribution | undefined>;
	renderRouteBody: () => Promise<RouteRendererBody>;
	getRouteHtmlFinalization?: () => RouteHtmlFinalization;
	transformRouteResponse: (response: Response) => Promise<RouteRendererBody>;
}): RouteRenderOrchestratorAdapter<unknown> {
	return {
		name: 'test-renderer',
		resolveRouteRenderInputs: async (routeOptions) => {
			const pageModule = await input.resolvePageModule(routeOptions.file);
			const HtmlTemplate = await input.getHtmlTemplate();
			const Layouts = resolvePageLayoutComponents(pageModule.Page.config?.layouts);
			const Layout = Layouts[Layouts.length - 1];
			const { props, metadata } = await input.resolvePageData(pageModule, routeOptions);

			return {
				Page: pageModule.Page,
				HtmlTemplate,
				Layouts,
				Layout,
				layoutEntries: pageModule.Page.config?.layoutEntries,
				props,
				metadata,
				integrationSpecificProps: pageModule.integrationSpecificProps,
			};
		},
		resolveRouteDependencies: async ({ components }) => ({
			resolvedDependencies: await input.resolveDependencies(components),
		}),
		collectPageBrowserGraphContribution: async (routeFile) =>
			await input.collectPageBrowserGraphContribution(routeFile),
		renderRouteBody: input.renderRouteBody,
		getRouteHtmlFinalization: input.getRouteHtmlFinalization ?? (() => ({})),
		transformRouteResponse: input.transformRouteResponse,
	};
}

describe('RouteRenderOrchestrator', () => {
	const appConfig = {
		cache: { defaultStrategy: 'static' },
		defaultMetadata: { title: 'Default title', description: 'Default description' },
		integrations: [],
	} as any;
	const assetProcessingService = {
		processDependencies: async () => [],
	} as any;

	it('captures streamed render bodies before final HTML handling', async () => {
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
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

	it('executes prepared route renders and preserves cache strategy', async () => {
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
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
			createFlowAdapter({
				resolvePageModule: async () => ({ Page, integrationSpecificProps: {} }),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({ props: {}, metadata: appConfig.defaultMetadata }),
				resolveDependencies: async () => [],
				collectPageBrowserGraphContribution: async () => undefined,
				renderRouteBody: async () =>
					new ReadableStream({
						start(controller) {
							controller.enqueue(encoder.encode('<html><body><main>Streamed</main></body></html>'));
							controller.close();
						},
					}) as unknown as BodyInit,
				transformRouteResponse: async (response) => response.body as RouteRendererBody,
			}),
		);

		expect(result.cacheStrategy).toEqual({ revalidate: 60 });
		expect(result.body).toBeInstanceOf(ReadableStream);
		expect(await new Response(result.body as BodyInit).text()).toContain('<main>Streamed</main>');
	});

	it('applies document attributes to fully resolved route HTML', async () => {
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as EcoComponent<Record<string, unknown>>;
		(Page as EcoComponent<Record<string, unknown>> & { cache?: unknown }).cache = { revalidate: 60 };

		const result = await flow.execute(
			{
				file: '/app/pages/index.tsx',
				params: {},
				query: {},
			} as unknown as RouteRendererOptions,
			createFlowAdapter({
				resolvePageModule: async () => ({ Page, integrationSpecificProps: {} }),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({ props: {}, metadata: appConfig.defaultMetadata }),
				resolveDependencies: async () => [],
				collectPageBrowserGraphContribution: async () => undefined,
				renderRouteBody: async () => '<html><body><main>Resolved</main></body></html>',
				getRouteHtmlFinalization: () =>
					buildRouteHtmlFinalization({
						renderOptions: {} as IntegrationRendererRenderOptions,
						getDocumentAttributes: () => ({ 'data-eco-document-owner': 'react-router' }),
						getHtmlDocumentContributions: () => undefined,
						applyAttributesToHtmlElement: (html, attributes) =>
							html.replace(
								'<html',
								`<html ${Object.entries(attributes)
									.map(([key, value]) => `${key}="${value}"`)
									.join(' ')}`,
							),
					}),
				transformRouteResponse: async (response) => await response.text(),
			}),
		);

		expect(result.cacheStrategy).toEqual({ revalidate: 60 });
		expect(result.body).toContain('<html data-eco-document-owner="react-router"><body>');
		expect(result.body).toContain('<main>Resolved</main>');
	});

	it('throws when route HTML contains escaped unresolved eco-marker artifacts', async () => {
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as EcoComponent<Record<string, unknown>>;

		await expect(
			flow.execute(
				{
					file: '/app/pages/index.tsx',
					params: {},
					query: {},
				} as unknown as RouteRendererOptions,
				createFlowAdapter({
					resolvePageModule: async () => ({ Page, integrationSpecificProps: {} }),
					getHtmlTemplate: async () => HtmlTemplate,
					resolvePageData: async () => ({ props: {}, metadata: appConfig.defaultMetadata }),
					resolveDependencies: async () => [],
					collectPageBrowserGraphContribution: async () => undefined,
					renderRouteBody: async () =>
						'<html><body>&amp;lt;eco-marker data-eco-node-id=&quot;n_2&quot; data-eco-component-ref=&quot;page-component&quot; data-eco-props-ref=&quot;p_2&quot;&amp;gt;&amp;lt;/eco-marker&amp;gt;</body></html>',
					transformRouteResponse: async (response) => await response.text(),
				}),
			),
		).rejects.toThrow('Full-route unresolved-marker fallback has been removed');
	});

	it('throws when route HTML returns unresolved eco-marker artifact HTML', async () => {
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as EcoComponent<Record<string, unknown>>;

		await expect(
			flow.execute(
				{
					file: '/app/pages/index.tsx',
					params: {},
					query: {},
				} as unknown as RouteRendererOptions,
				createFlowAdapter({
					resolvePageModule: async () => ({ Page, integrationSpecificProps: {} }),
					getHtmlTemplate: async () => HtmlTemplate,
					resolvePageData: async () => ({ props: {}, metadata: appConfig.defaultMetadata }),
					resolveDependencies: async () => [],
					collectPageBrowserGraphContribution: async () => undefined,
					renderRouteBody: async () =>
						'<html><body><eco-marker data-eco-node-id="n_1" data-eco-component-ref="unexpected-marker" data-eco-props-ref="p_1"></eco-marker></body></html>',
					transformRouteResponse: async (response) => await response.text(),
				}),
			),
		).rejects.toThrow('Full-route unresolved-marker fallback has been removed');
	});

	it('fails route execution when unresolved eco-marker artifact HTML is returned', async () => {
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Test Page</main>') as EcoComponent<Record<string, unknown>>;

		await expect(
			flow.execute(
				{
					file: '/app/pages/index.ts',
					params: {},
					query: {},
				} as unknown as RouteRendererOptions,
				createFlowAdapter({
					resolvePageModule: async () => ({ Page, integrationSpecificProps: {} }),
					getHtmlTemplate: async () => HtmlTemplate,
					resolvePageData: async () => ({ props: {}, metadata: appConfig.defaultMetadata }),
					resolveDependencies: async () => [],
					collectPageBrowserGraphContribution: async () => undefined,
					renderRouteBody: async () =>
						`<html><body><main>Before${createUnresolvedMarkerArtifact('n_1', 'nested-component', 'props-1')}After</main></body></html>`,
					transformRouteResponse: async (response) => await response.text(),
				}),
			),
		).rejects.toThrow('Full-route unresolved-marker fallback has been removed');
	});

	it('fails route execution when unresolved eco-marker artifact HTML remains inside surrounding shell html', async () => {
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Test Page</main>') as EcoComponent<Record<string, unknown>>;

		await expect(
			flow.execute(
				{
					file: '/app/pages/index.ts',
					params: {},
					query: {},
				} as unknown as RouteRendererOptions,
				createFlowAdapter({
					resolvePageModule: async () => ({ Page, integrationSpecificProps: {} }),
					getHtmlTemplate: async () => HtmlTemplate,
					resolvePageData: async () => ({ props: {}, metadata: appConfig.defaultMetadata }),
					resolveDependencies: async () => [],
					collectPageBrowserGraphContribution: async () => undefined,
					renderRouteBody: async () =>
						`<html><body><main><section data-shell="outer">Before${createUnresolvedMarkerArtifact('n_1', 'nested-component', 'props-1')}After</section></main></body></html>`,
					transformRouteResponse: async (response) => await response.text(),
				}),
			),
		).rejects.toThrow('Full-route unresolved-marker fallback has been removed');
	});

	it('fails route execution for deep multi-level unresolved eco-marker artifacts', async () => {
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Test Page</main>') as EcoComponent<Record<string, unknown>>;

		await expect(
			flow.execute(
				{
					file: '/app/pages/index.ts',
					params: {},
					query: {},
				} as unknown as RouteRendererOptions,
				createFlowAdapter({
					resolvePageModule: async () => ({ Page, integrationSpecificProps: {} }),
					getHtmlTemplate: async () => HtmlTemplate,
					resolvePageData: async () => ({ props: {}, metadata: appConfig.defaultMetadata }),
					resolveDependencies: async () => [],
					collectPageBrowserGraphContribution: async () => undefined,
					renderRouteBody: async () =>
						`<html><body><main>${createUnresolvedMarkerArtifact('n_1', 'root-component', 'props-root')}</main></body></html>`,
					transformRouteResponse: async (response) => await response.text(),
				}),
			),
		).rejects.toThrow('Full-route unresolved-marker fallback has been removed');
	});

	it('fails route execution when props reference is missing', async () => {
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Test Page</main>') as EcoComponent<Record<string, unknown>>;

		await expect(
			flow.execute(
				{
					file: '/app/pages/index.ts',
					params: {},
					query: {},
				} as unknown as RouteRendererOptions,
				createFlowAdapter({
					resolvePageModule: async () => ({ Page, integrationSpecificProps: {} }),
					getHtmlTemplate: async () => HtmlTemplate,
					resolvePageData: async () => ({ props: {}, metadata: appConfig.defaultMetadata }),
					resolveDependencies: async () => [],
					collectPageBrowserGraphContribution: async () => undefined,
					renderRouteBody: async () =>
						`<html><body><main>${createUnresolvedMarkerArtifact('n_1', 'nested-component', 'props-missing')}</main></body></html>`,
					transformRouteResponse: async (response) => await response.text(),
				}),
			),
		).rejects.toThrow('Full-route unresolved-marker fallback has been removed');
	});

	it('fails route execution when deep mixed-integration eco-marker artifacts are returned at the route level', async () => {
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Test Page</main>') as EcoComponent<Record<string, unknown>>;

		await expect(
			flow.execute(
				{
					file: '/app/pages/index.ts',
					params: {},
					query: {},
				} as unknown as RouteRendererOptions,
				createFlowAdapter({
					resolvePageModule: async () => ({ Page, integrationSpecificProps: {} }),
					getHtmlTemplate: async () => HtmlTemplate,
					resolvePageData: async () => ({ props: {}, metadata: appConfig.defaultMetadata }),
					resolveDependencies: async () => [],
					collectPageBrowserGraphContribution: async () => undefined,
					renderRouteBody: async () =>
						`<html><body><main><div data-shell="deep">${createUnresolvedMarkerArtifact('n_1', 'root-component', 'props-root')}</div></main></body></html>`,
					transformRouteResponse: async (response) => await response.text(),
				}),
			),
		).rejects.toThrow('Full-route unresolved-marker fallback has been removed');
	});
});
