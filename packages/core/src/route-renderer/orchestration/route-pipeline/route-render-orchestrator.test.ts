import { path } from '@ecopages/file-system/path';
import { describe, expect, it } from 'vitest';
import type { AssetProcessingService, ProcessedAsset } from '../../../assets/asset-processing-service/index.ts';
import { ProcessedAssetLedger } from '../../../assets/asset-processing-service/processed-asset-ledger.ts';
import type { EcoPagesAppConfig } from '../../../config/internal-types.ts';
import type { EcoComponent, IntegrationRendererRenderOptions } from '../../../types/contracts.ts';
import { buildRouteHtmlFinalization } from './route-html-finalization.service.ts';
import { RouteRenderOrchestrator } from './route-render-orchestrator.ts';
import { createFlowRenderer, createRouteOptions } from './route-render-orchestrator.test-fixtures.ts';
import { BuildInputDependencyIndex } from '../../../build/cache/build-input-dependency-index.ts';
import { requireAppRuntime } from '../../../utils/app-runtime.ts';
import type { AppRuntime } from '../../../config/assembly/app-runtime.ts';
import { SessionPageBrowserGraphCache } from '../page-browser-graph/page-browser-graph-session.ts';

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
		appRuntime: {
			buildInputIndex: new BuildInputDependencyIndex(),
			pageBrowserGraphSession: new SessionPageBrowserGraphCache(),
		} as AppRuntime,
	} as unknown as EcoPagesAppConfig;
	const assetProcessingService = {
		processDependencies: async () => [],
	} as unknown as AssetProcessingService;
	const createFlow = () => new RouteRenderOrchestrator(appConfig, assetProcessingService);
	const cachedPage = Object.assign(() => '<main>Page</main>', {
		cache: { revalidate: 60 },
	}) as unknown as EcoComponent;

	it('captures streamed render bodies before final HTML handling', async () => {
		const html = await createFlow().captureHtmlRender(async () =>
			createHtmlStream('<html><body><main>Streamed</main></body></html>'),
		);

		expect(html).toContain('<main>Streamed</main>');
	});

	it('executes prepared route renders and preserves cache strategy', async () => {
		const result = await createFlow().execute(
			createRouteOptions(path.resolve('/app/pages/index.tsx')),
			createFlowRenderer({
				Page: cachedPage,
				renderRouteBody: async () => createHtmlStream('<html><body><main>Streamed</main></body></html>'),
				transformRouteHtml: async (html) => html,
			}),
		);

		expect(result.cacheStrategy).toEqual({ revalidate: 60 });
		expect(result.body).toContain('<main>Streamed</main>');
	});

	describe('shell Dependencies', () => {
		const stylesheet = { kind: 'stylesheet', inline: false, srcUrl: '/assets/page.css' } as ProcessedAsset;
		const shellConfig = (ledger: ProcessedAssetLedger) =>
			({
				...appConfig,
				rootDir: path.resolve('/app'),
				appRuntime: { ...appConfig.appRuntime, processedAssets: ledger } as AppRuntime,
			}) as EcoPagesAppConfig;
		const identified = <T extends object>(value: T, id: string, file: string) =>
			Object.assign(value, { config: { identity: { id, file, integration: 'string' } } });
		const Page = identified(() => '<main>Page</main>', 'page', 'src/pages/index.tsx') as unknown as EcoComponent;
		const HtmlTemplate = identified(() => '<html></html>', 'html', 'src/includes/html.tsx') as EcoComponent<never>;
		const routeOptions = createRouteOptions(path.resolve('/app/src/pages/index.tsx'));
		const countingRenderer = () => {
			const counter = { calls: 0 };
			const renderer = createFlowRenderer({
				Page,
				HtmlTemplate,
				resolveDependencies: async () => {
					counter.calls += 1;
					return [stylesheet];
				},
			});
			return { counter, renderer };
		};

		it.each([
			[true, 1],
			[false, 2],
		])('processes them once per Page when recording is %s', async (records, expectedCalls) => {
			const ledger = new ProcessedAssetLedger('/app');
			const flow = new RouteRenderOrchestrator(shellConfig(ledger), assetProcessingService, {
				recordsShellDependencies: () => records,
			});
			const { counter, renderer } = countingRenderer();

			await flow.prepareRenderOptions(routeOptions, renderer);
			const prepared = await flow.prepareRenderOptions(routeOptions, renderer);

			expect(counter.calls).toBe(expectedCalls);
			expect(prepared.resolvedDependencies).toEqual([stylesheet]);
			expect(Object.keys(ledger.serialize().shells ?? {})).toHaveLength(records ? 1 : 0);
		});

		it('reads the shell a build recorded once start sealed the ledger, holding only its lazy entries', async () => {
			const built = new ProcessedAssetLedger('/build');
			const build = new RouteRenderOrchestrator(shellConfig(built), assetProcessingService, {
				recordsShellDependencies: () => true,
			});
			await build.prepareRenderOptions(routeOptions, countingRenderer().renderer);
			const started = new ProcessedAssetLedger('/srv');
			started.restore(JSON.parse(JSON.stringify(built.serialize())));
			started.seal();
			const start = new RouteRenderOrchestrator(shellConfig(started), assetProcessingService, {
				recordsShellDependencies: () => true,
			});
			const { counter, renderer } = countingRenderer();
			const lazyPreparations: unknown[] = [];
			renderer.prepareRouteLazyDependencies = (components) => lazyPreparations.push(components);

			const prepared = await start.prepareRenderOptions(routeOptions, renderer);

			expect(counter.calls).toBe(0);
			expect(prepared.resolvedDependencies).toEqual([stylesheet]);
			expect(lazyPreparations).toHaveLength(1);
		});

		it('fails a sealed start for a Page whose shell the build did not record', async () => {
			const ledger = new ProcessedAssetLedger('/srv');
			ledger.seal();
			const flow = new RouteRenderOrchestrator(shellConfig(ledger), assetProcessingService, {
				recordsShellDependencies: () => true,
			});

			await expect(flow.prepareRenderOptions(routeOptions, countingRenderer().renderer)).rejects.toThrow(
				'The production build did not record the shell Dependencies of src/pages/index.tsx#page.',
			);
		});
	});

	it('adds the HTML template module closure to the cached document inputs', async () => {
		const shellConfig = {
			...appConfig,
			absolutePaths: { htmlTemplatePath: path.resolve('/app/includes/html.tsx') },
			appRuntime: {
				buildInputIndex: new BuildInputDependencyIndex(),
			} as AppRuntime,
		} as unknown as EcoPagesAppConfig;
		requireAppRuntime(shellConfig).buildInputIndex.register(
			{ consumer: 'server-route-module', key: path.resolve('/app/includes/html.tsx') },
			[path.resolve('/app/includes/html.tsx'), path.resolve('/app/includes/seo.tsx')],
		);

		const result = await new RouteRenderOrchestrator(shellConfig, assetProcessingService).executePrepared(
			{
				sourceDependencyPaths: [path.resolve('/app/pages/index.tsx')],
			} as unknown as IntegrationRendererRenderOptions<unknown>,
			createFlowRenderer({ renderRouteBody: async () => '<html><body><main>Page</main></body></html>' }),
		);

		expect(result.sourceDependencyPaths).toEqual([
			path.resolve('/app/pages/index.tsx'),
			path.resolve('/app/includes/html.tsx'),
			path.resolve('/app/includes/seo.tsx'),
		]);
	});

	it('applies document attributes to fully resolved route HTML', async () => {
		const result = await createFlow().execute(
			createRouteOptions(path.resolve('/app/pages/index.tsx')),
			createFlowRenderer({
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
});
