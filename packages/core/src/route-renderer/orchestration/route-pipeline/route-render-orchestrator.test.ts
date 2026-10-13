import { describe, expect, it } from 'vitest';
import type { AssetProcessingService } from '../../../services/assets/asset-processing-service/index.ts';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { EcoComponent, IntegrationRendererRenderOptions, RouteRendererBody } from '../../../types/public-types.ts';
import { createUnresolvedMarkerArtifact } from '../integration-renderer.test-fixtures.ts';
import { buildRouteHtmlFinalization } from './route-html-finalization.service.ts';
import { RouteRenderOrchestrator } from './route-render-orchestrator.ts';
import { createFlowAdapter, createRouteOptions } from './route-render-orchestrator.test-fixtures.ts';
import { getAppBuildInputIndex } from '../../../build/cache/build-input-dependency-index.ts';

function createHtmlStream(html: string): BodyInit {
	const encoder = new TextEncoder();

	return new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(html));
			controller.close();
		},
	}) as unknown as BodyInit;
}

describe('RouteRenderOrchestrator', () => {
	const appConfig = {
		cache: { defaultStrategy: 'static' },
		defaultMetadata: { title: 'Default title', description: 'Default description' },
		integrations: [],
	} as unknown as EcoPagesAppConfig;
	const assetProcessingService = {
		processDependencies: async () => [],
	} as unknown as AssetProcessingService;
	const createFlow = () => new RouteRenderOrchestrator(appConfig, assetProcessingService);
	const cachedPage = Object.assign(() => '<main>Page</main>', {
		cache: { revalidate: 60 },
	}) as unknown as EcoComponent;

	it('captures streamed render bodies before final HTML handling', async () => {
		const result = await createFlow().captureHtmlRender(async () =>
			createHtmlStream('<html><body><main>Streamed</main></body></html>'),
		);

		expect(result.body).toBeInstanceOf(ReadableStream);
		expect(result.html).toContain('<main>Streamed</main>');
	});

	it('executes prepared route renders and preserves cache strategy', async () => {
		const result = await createFlow().execute(
			createRouteOptions('/app/pages/index.tsx'),
			createFlowAdapter({
				Page: cachedPage,
				renderRouteBody: async () => createHtmlStream('<html><body><main>Streamed</main></body></html>'),
				transformRouteResponse: async (response) => response.body as RouteRendererBody,
			}),
		);

		expect(result.cacheStrategy).toEqual({ revalidate: 60 });
		expect(result.body).toBeInstanceOf(ReadableStream);
		expect(await new Response(result.body as BodyInit).text()).toContain('<main>Streamed</main>');
	});

	it('adds the HTML template module closure to the cached document inputs', async () => {
		const shellConfig = {
			...appConfig,
			absolutePaths: { htmlTemplatePath: '/app/includes/html.tsx' },
		} as unknown as EcoPagesAppConfig;
		getAppBuildInputIndex(shellConfig).register(
			{ consumer: 'server-route-module', key: '/app/includes/html.tsx' },
			['/app/includes/html.tsx', '/app/includes/seo.tsx'],
		);

		const result = await new RouteRenderOrchestrator(shellConfig, assetProcessingService).executePrepared(
			{ sourceDependencyPaths: ['/app/pages/index.tsx'] } as unknown as IntegrationRendererRenderOptions<unknown>,
			createFlowAdapter({ renderRouteBody: async () => '<html><body><main>Page</main></body></html>' }),
		);

		expect(result.sourceDependencyPaths).toEqual([
			'/app/pages/index.tsx',
			'/app/includes/html.tsx',
			'/app/includes/seo.tsx',
		]);
	});

	it('applies document attributes to fully resolved route HTML', async () => {
		const result = await createFlow().execute(
			createRouteOptions('/app/pages/index.tsx'),
			createFlowAdapter({
				Page: cachedPage,
				renderRouteBody: async () => '<html><body><main>Resolved</main></body></html>',
				getRouteHtmlFinalization: () =>
					buildRouteHtmlFinalization({
						appConfig,
						watch: false,
						integrationName: 'test',
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
			}),
		);

		expect(result.cacheStrategy).toEqual({ revalidate: 60 });
		expect(result.body).toContain('<html data-eco-document-owner="react-router"><body>');
		expect(result.body).toContain('<main>Resolved</main>');
	});

	it.each([
		[
			'a raw marker nested inside shell html',
			`<html><body><main><section data-shell="outer">Before${createUnresolvedMarkerArtifact('n_1', 'nested-component', 'props-1')}After</section></main></body></html>`,
		],
		[
			'an entity-escaped marker',
			'<html><body>&amp;lt;eco-marker data-eco-node-id=&quot;n_2&quot; data-eco-component-ref=&quot;page-component&quot; data-eco-props-ref=&quot;p_2&quot;&amp;gt;&amp;lt;/eco-marker&amp;gt;</body></html>',
		],
	])('throws when the route HTML contains %s', async (_name, html) => {
		await expect(
			createFlow().execute(
				createRouteOptions('/app/pages/index.tsx'),
				createFlowAdapter({ renderRouteBody: async () => html }),
			),
		).rejects.toThrow('Full-route unresolved-marker fallback has been removed');
	});
});
