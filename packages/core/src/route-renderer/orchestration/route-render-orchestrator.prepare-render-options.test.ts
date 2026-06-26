import { describe, expect, it, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { eco } from '../../eco/eco.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type {
	EcoComponent,
	EcoPageComponent,
	HtmlTemplateProps,
	PageBrowserGraphContribution,
	PageMetadataProps,
	RouteRendererOptions,
} from '../../types/public-types.ts';
import { LocalsAccessError } from '../../errors/locals-access-error.ts';
import type {
	AssetDefinition,
	AssetProcessingService,
	ProcessedAsset,
} from '../../services/assets/asset-processing-service/index.ts';
import type { GroupedScriptBundle } from '../../services/assets/asset-processing-service/assets.types.ts';
import { OwnershipValidationService } from './ownership-validation.service.ts';
import { type RouteRenderOrchestratorAdapter, RouteRenderOrchestrator } from './route-render-orchestrator.ts';

declare module '../../types/public-types.ts' {
	interface RequestLocals {
		user?: string;
		guarded?: boolean;
	}
}

function createFlowAdapter<C>(input: {
	resolvePageModule: (file: string) => Promise<{
		Page: EcoPageComponent<any> | EcoComponent;
		getStaticProps?: unknown;
		getMetadata?: unknown;
		integrationSpecificProps: Record<string, unknown>;
	}>;
	getHtmlTemplate: () => Promise<EcoComponent<HtmlTemplateProps>>;
	resolvePageData: (
		pageModule: {
			getStaticProps?: unknown;
			getMetadata?: unknown;
		},
		routeOptions: RouteRendererOptions,
	) => Promise<{ props: Record<string, unknown>; metadata: PageMetadataProps }>;
	resolveDependencies: (components: (EcoComponent | Partial<EcoComponent>)[]) => Promise<ProcessedAsset[]>;
	collectPageBrowserGraphContribution: (routeFile: string) => Promise<PageBrowserGraphContribution | undefined>;
	shouldRenderPageComponent: (input: {
		Page: EcoComponent;
		Layout?: EcoComponent;
		options: RouteRendererOptions;
	}) => boolean;
	renderPageComponent: (input: {
		Page: EcoComponent;
		Layout?: EcoComponent;
		props: Record<string, unknown>;
		routeOptions: RouteRendererOptions;
	}) => Promise<any>;
}): RouteRenderOrchestratorAdapter<C> {
	return {
		name: 'ghtml',
		resolveRouteRenderInputs: async (routeOptions) => {
			const pageModule = await input.resolvePageModule(routeOptions.file);
			const HtmlTemplate = await input.getHtmlTemplate();
			const Layout = pageModule.Page.config?.layout;
			const { props, metadata } = await input.resolvePageData(pageModule, routeOptions);

			return {
				Page: pageModule.Page,
				HtmlTemplate,
				Layout,
				props,
				metadata,
				integrationSpecificProps: pageModule.integrationSpecificProps,
				shouldRenderPageComponent: input.shouldRenderPageComponent({
					Page: pageModule.Page as EcoComponent,
					Layout,
					options: routeOptions,
				}),
			};
		},
		resolveRouteDependencies: async ({ components }) => ({
			resolvedDependencies: await input.resolveDependencies(components),
		}),
		collectPageBrowserGraphContribution: async (routeFile) =>
			await input.collectPageBrowserGraphContribution(routeFile),
		resolveRoutePageComponentRender: async (renderInput) => {
			if (
				!input.shouldRenderPageComponent({
					Page: renderInput.Page,
					Layout: renderInput.Layout,
					options: renderInput.routeOptions,
				})
			) {
				return undefined;
			}

			return await input.renderPageComponent(renderInput);
		},
		renderRouteBody: async () => '',
		getRouteHtmlFinalization: () => ({}),
		transformRouteResponse: async (response) => await response.text(),
	};
}

function createProcessedGroupedScriptAsset(groupedBundle: GroupedScriptBundle, srcUrl: string): ProcessedAsset {
	return {
		kind: 'script',
		srcUrl,
		position: 'head',
		packageRole: 'page-script',
		groupedBundle,
	};
}

function isGroupedContentScriptDependency(asset: AssetDefinition): asset is Extract<
	AssetDefinition,
	{ kind: 'script'; source: 'content' }
> & {
	groupedBundle: GroupedScriptBundle;
} {
	return asset.kind === 'script' && asset.source === 'content' && Boolean(asset.groupedBundle);
}

function createGroupedPageScriptDependency(
	content: string,
	name: string,
	groupedBundle: GroupedScriptBundle,
): Extract<AssetDefinition, { kind: 'script'; source: 'content' }> {
	return {
		kind: 'script',
		source: 'content',
		content,
		name,
		packageRole: 'page-script',
		groupedBundle,
	};
}

describe('RouteRenderOrchestrator prepareRenderOptions', () => {
	it('should prepare dynamic render options and merge renderer-owned assets', async () => {
		const integrationDependency = {
			kind: 'script',
			srcUrl: '/assets/react-runtime.js',
			position: 'head',
		} as ProcessedAsset;
		const componentAsset = {
			kind: 'script',
			srcUrl: '/assets/page-root.js',
			position: 'head',
		} as ProcessedAsset;
		const resolvedDependency = {
			kind: 'stylesheet',
			srcUrl: '/assets/page.css',
			position: 'head',
		} as ProcessedAsset;
		const pageDependency = {
			kind: 'script',
			srcUrl: '/assets/page-entry.js',
			position: 'head',
		} as ProcessedAsset;
		const assetProcessingService = {
			processDependencies: vi.fn(async () => []),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [
				{
					name: 'react',
					initializeRenderer: vi.fn(),
					getResolvedIntegrationDependencies: () => [integrationDependency],
				},
			],
		} as unknown as EcoPagesAppConfig;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Nested = (() => '<aside>Nested</aside>') as EcoComponent<Record<string, unknown>>;
		Nested.config = {
			integration: 'react',
			__eco: { id: 'nested', file: '/app/components/nested.tsx', integration: 'react' },
		};
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;
		Page.cache = 'dynamic';
		Page.config = {
			dependencies: {
				components: [Nested],
			},
		};
		const routeOptions = {
			file: '/app/pages/index.tsx',
			params: { slug: 'hello' },
			query: { preview: '1' },
			locals: { user: 'andee' },
		} as unknown as RouteRendererOptions;
		const result = await flow.prepareRenderOptions(
			routeOptions,
			createFlowAdapter({
				resolvePageModule: async () => ({
					Page,
					integrationSpecificProps: { layoutMode: 'full' },
				}),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({
					props: { title: 'Hello' },
					metadata: { title: 'Hello', description: 'Hello description' },
				}),
				resolveDependencies: async () => [resolvedDependency],
				collectPageBrowserGraphContribution: async () => ({ assets: [pageDependency] }),
				shouldRenderPageComponent: () => true,
				renderPageComponent: async () => ({
					html: '<main>Page</main>',
					canAttachAttributes: true,
					rootTag: 'main',
					integrationName: 'ghtml',
					assets: [componentAsset],
				}),
			}),
		);

		expect(result.locals).toEqual({ user: 'andee' });
		expect(result.pageLocals).toEqual({ user: 'andee' });
		expect(result.pageProps).toEqual({ title: 'Hello', params: { slug: 'hello' }, query: { preview: '1' } });
		expect((result as typeof result & { layoutMode?: string }).layoutMode).toBe('full');
		expect(result.componentRender?.assets).toEqual([componentAsset]);
		expect(result.pagePackage).toEqual(
			expect.objectContaining({
				assets: expect.arrayContaining([
					resolvedDependency,
					integrationDependency,
					pageDependency,
					componentAsset,
				]),
				pageBrowserGraph: {
					entryAssets: [pageDependency],
					chunkAssets: [],
				},
			}),
		);
	});

	it('renders page-root output directly during preparation', async () => {
		const assetProcessingService = {
			processDependencies: vi.fn(async () => []),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [],
		} as unknown as EcoPagesAppConfig;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const DeferredChild = eco.component<{}, string>({
			integration: 'react',
			render: () => '<span>Deferred</span>',
		});
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;

		const result = await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			createFlowAdapter({
				resolvePageModule: async () => ({
					Page,
					integrationSpecificProps: {},
				}),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({
					props: {},
					metadata: { title: 'Page', description: 'Page description' },
				}),
				resolveDependencies: async () => [],
				collectPageBrowserGraphContribution: async () => ({ assets: [] }),
				shouldRenderPageComponent: () => true,
				renderPageComponent: async () => ({
					html: DeferredChild({}),
					canAttachAttributes: true,
					rootTag: 'span',
					integrationName: 'ghtml',
				}),
			}),
		);

		expect(result.componentRender).toEqual(
			expect.objectContaining({
				canAttachAttributes: true,
				rootTag: 'span',
				integrationName: 'ghtml',
			}),
		);
		expect(result.componentRender?.html).toBe('<span>Deferred</span>');
	});

	it('inlines the global injector bootstrap when resolved lazy triggers are present', async () => {
		const processDependencies = vi.fn<AssetProcessingService['processDependencies']>().mockImplementation(
			async (dependencies) =>
				dependencies.map((dependency) => ({
					kind: dependency.kind,
					position: dependency.position,
					attributes: dependency.attributes,
					content: dependency.source === 'content' ? dependency.content : undefined,
					inline: dependency.inline,
					packageRole: dependency.packageRole,
				})) as ProcessedAsset[],
		);
		const assetProcessingService = {
			processDependencies,
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [],
		} as unknown as EcoPagesAppConfig;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;
		Page.config = {
			_resolvedLazyTriggers: [
				{
					triggerId: 'eco-trigger-theme-toggle',
					rules: [{ 'on:interaction': { value: 'click', scripts: ['/assets/lazy-theme-toggle.js'] } }],
				},
			],
		};

		await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			createFlowAdapter({
				resolvePageModule: async () => ({
					Page,
					integrationSpecificProps: {},
				}),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({
					props: {},
					metadata: { title: 'Page', description: 'Page description' },
				}),
				resolveDependencies: async () => [],
				collectPageBrowserGraphContribution: async () => ({ assets: [] }),
				shouldRenderPageComponent: () => false,
				renderPageComponent: vi.fn(),
			}),
		);

		expect(processDependencies).toHaveBeenCalledOnce();
		expect(processDependencies).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'ecopages-global-injector-bootstrap',
					inline: true,
					bundle: true,
					attributes: { type: 'module' },
				}),
			]),
			'ghtml',
		);
	});

	it('caches page browser graph resolution across repeated route preparation when HMR is disabled', async () => {
		const pageBrowserAsset = {
			kind: 'script',
			srcUrl: '/assets/page.js',
			position: 'head',
		} as ProcessedAsset;
		const collectPageBrowserGraphContribution = vi.fn(
			async (): Promise<PageBrowserGraphContribution> => ({
				dependencies: [
					{
						kind: 'script',
						source: 'content',
						content: 'console.log("page")',
						name: 'page',
						attributes: { type: 'module' },
					},
				],
			}),
		);
		const processDependencies = vi.fn(async () => [pageBrowserAsset]);
		const assetProcessingService = {
			processDependencies,
			getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [],
		} as unknown as EcoPagesAppConfig;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;

		const adapter = createFlowAdapter({
			resolvePageModule: async () => ({
				Page,
				integrationSpecificProps: {},
			}),
			getHtmlTemplate: async () => HtmlTemplate,
			resolvePageData: async () => ({
				props: {},
				metadata: { title: 'Page', description: 'Page description' },
			}),
			resolveDependencies: async () => [],
			collectPageBrowserGraphContribution,
			shouldRenderPageComponent: () => false,
			renderPageComponent: vi.fn(),
		});

		await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			adapter,
		);
		await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			adapter,
		);

		expect(collectPageBrowserGraphContribution).toHaveBeenCalledOnce();
		expect(processDependencies).toHaveBeenCalledOnce();
	});

	it('bypasses the page browser graph cache when HMR is enabled', async () => {
		const pageBrowserAsset = {
			kind: 'script',
			srcUrl: '/assets/page.js',
			position: 'head',
		} as ProcessedAsset;
		const collectPageBrowserGraphContribution = vi.fn(
			async (): Promise<PageBrowserGraphContribution> => ({
				dependencies: [
					{
						kind: 'script',
						source: 'content',
						content: 'console.log("page")',
						name: 'page',
						attributes: { type: 'module' },
					},
				],
			}),
		);
		const processDependencies = vi.fn(async () => [pageBrowserAsset]);
		const assetProcessingService = {
			processDependencies,
			getHmrManager: vi.fn(() => ({ isEnabled: () => true })),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [],
		} as unknown as EcoPagesAppConfig;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;

		const adapter = createFlowAdapter({
			resolvePageModule: async () => ({
				Page,
				integrationSpecificProps: {},
			}),
			getHtmlTemplate: async () => HtmlTemplate,
			resolvePageData: async () => ({
				props: {},
				metadata: { title: 'Page', description: 'Page description' },
			}),
			resolveDependencies: async () => [],
			collectPageBrowserGraphContribution,
			shouldRenderPageComponent: () => false,
			renderPageComponent: vi.fn(),
		});

		await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			adapter,
		);
		await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			adapter,
		);

		expect(collectPageBrowserGraphContribution).toHaveBeenCalledTimes(2);
		expect(processDependencies).toHaveBeenCalledTimes(2);
	});

	it('threads the structured page browser graph through the returned page package', async () => {
		const entryAsset = {
			kind: 'script',
			srcUrl: '/assets/page.js',
			position: 'head',
			packageRole: 'page-script',
		} as ProcessedAsset;
		const chunkAsset = {
			kind: 'script',
			srcUrl: '/assets/page.chunk.js',
			position: 'body',
			packageRole: 'dynamic-chunk',
		} as ProcessedAsset;
		const processDependencies = vi.fn(async () => [entryAsset]);
		const assetProcessingService = {
			processDependencies,
			getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [],
		} as unknown as EcoPagesAppConfig;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;

		const result = await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			createFlowAdapter({
				resolvePageModule: async () => ({
					Page,
					integrationSpecificProps: {},
				}),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({
					props: {},
					metadata: { title: 'Page', description: 'Page description' },
				}),
				resolveDependencies: async () => [],
				collectPageBrowserGraphContribution: async () => ({
					dependencies: [
						{
							kind: 'script',
							source: 'content',
							content: 'console.log("page")',
							name: 'page',
							attributes: { type: 'module' },
						},
					],
					assets: [chunkAsset],
				}),
				shouldRenderPageComponent: () => false,
				renderPageComponent: vi.fn(),
			}),
		);

		expect(result.pagePackage).toEqual(
			expect.objectContaining({
				pageBrowserGraph: {
					entryAssets: [entryAsset],
					chunkAssets: [chunkAsset],
				},
				dynamicChunks: [chunkAsset],
				assets: [entryAsset, chunkAsset],
			}),
		);
	});

	it('reuses one grouped page-browser build across sibling routes for the same integration', async () => {
		vi.spyOn(fileSystem, 'glob').mockResolvedValue(['index.tsx', 'dashboard.tsx']);
		const processDependencies = vi.fn(async (dependencies: AssetDefinition[], key: string) => {
			if (key === 'react:grouped-page-browser-graph') {
				return dependencies
					.filter(isGroupedContentScriptDependency)
					.map((dependency, index) =>
						createProcessedGroupedScriptAsset(
							dependency.groupedBundle,
							`/assets/grouped-${dependency.groupedBundle.entryName}-${index}.js`,
						),
					);
			}

			return [];
		});
		const assetProcessingService = {
			processDependencies,
			getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [
				{
					name: 'react',
					extensions: ['.tsx'],
					initializeRenderer: vi.fn(),
					getResolvedIntegrationDependencies: () => [],
				},
			],
			absolutePaths: {
				pagesDir: '/app/pages',
			},
		} as unknown as EcoPagesAppConfig;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;
		const groupedDependencyByRoute = new Map<
			string,
			Extract<AssetDefinition, { kind: 'script'; source: 'content' }>
		>([
			[
				'/app/pages/index.tsx',
				createGroupedPageScriptDependency('console.log("index")', 'index-entry', {
					id: 'react-router-pages',
					entryName: 'index',
				}),
			],
			[
				'/app/pages/dashboard.tsx',
				createGroupedPageScriptDependency('console.log("dashboard")', 'dashboard-entry', {
					id: 'react-router-pages',
					entryName: 'dashboard',
				}),
			],
		]);
		const collectPageBrowserGraphContribution = vi.fn(
			async (routeFile: string): Promise<PageBrowserGraphContribution> => ({
				dependencies: [groupedDependencyByRoute.get(routeFile)!],
			}),
		);
		const createReactFlowAdapter = () => ({
			...createFlowAdapter({
				resolvePageModule: async () => ({
					Page,
					integrationSpecificProps: {},
				}),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({
					props: {},
					metadata: { title: 'Page', description: 'Page description' },
				}),
				resolveDependencies: async () => [],
				collectPageBrowserGraphContribution,
				shouldRenderPageComponent: () => false,
				renderPageComponent: vi.fn(),
			}),
			name: 'react' as const,
		});

		const firstResult = await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			createReactFlowAdapter(),
		);

		const secondResult = await flow.prepareRenderOptions(
			{ file: '/app/pages/dashboard.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			createReactFlowAdapter(),
		);

		expect(processDependencies).toHaveBeenCalledTimes(1);
		expect(processDependencies.mock.calls[0]?.[1]).toBe('react:grouped-page-browser-graph');
		expect(collectPageBrowserGraphContribution).toHaveBeenCalledWith('/app/pages/dashboard.tsx');
		expect(firstResult.pagePackage?.pageBrowserGraph?.entryAssets).toEqual([
			expect.objectContaining({ groupedBundle: { id: 'react-router-pages', entryName: 'index' } }),
		]);
		expect(secondResult.pagePackage?.pageBrowserGraph?.entryAssets).toEqual([
			expect.objectContaining({ groupedBundle: { id: 'react-router-pages', entryName: 'dashboard' } }),
		]);
	});

	it('keeps rendering the current route when a sibling grouped contribution fails', async () => {
		vi.spyOn(fileSystem, 'glob').mockResolvedValue(['index.tsx', 'broken.tsx']);
		const processDependencies = vi.fn(async (dependencies: AssetDefinition[], key: string) => {
			if (key === 'react:grouped-page-browser-graph') {
				return dependencies
					.filter(isGroupedContentScriptDependency)
					.map((dependency) =>
						createProcessedGroupedScriptAsset(
							dependency.groupedBundle,
							`/assets/${dependency.groupedBundle.entryName}.js`,
						),
					);
			}

			return [];
		});
		const assetProcessingService = {
			processDependencies,
			getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [
				{
					name: 'react',
					extensions: ['.tsx'],
					initializeRenderer: vi.fn(),
					getResolvedIntegrationDependencies: () => [],
				},
			],
			absolutePaths: {
				pagesDir: '/app/pages',
			},
		} as unknown as EcoPagesAppConfig;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;
		const collectPageBrowserGraphContribution = vi.fn(
			async (routeFile: string): Promise<PageBrowserGraphContribution> => {
				if (routeFile === '/app/pages/broken.tsx') {
					throw new Error('broken sibling');
				}

				return {
					dependencies: [
						createGroupedPageScriptDependency('console.log("index")', 'index-entry', {
							id: 'react-router-pages',
							entryName: 'index',
						}),
					],
				};
			},
		);
		const createReactFlowAdapter = () => ({
			...createFlowAdapter({
				resolvePageModule: async () => ({
					Page,
					integrationSpecificProps: {},
				}),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({
					props: {},
					metadata: { title: 'Page', description: 'Page description' },
				}),
				resolveDependencies: async () => [],
				collectPageBrowserGraphContribution,
				shouldRenderPageComponent: () => false,
				renderPageComponent: vi.fn(),
			}),
			name: 'react' as const,
		});

		const result = await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			createReactFlowAdapter(),
		);

		expect(result.pagePackage?.pageBrowserGraph?.entryAssets).toEqual([
			expect.objectContaining({
				srcUrl: '/assets/index.js',
				groupedBundle: { id: 'react-router-pages', entryName: 'index' },
			}),
		]);
		expect(processDependencies).toHaveBeenCalledTimes(1);
		expect(collectPageBrowserGraphContribution).toHaveBeenCalledWith('/app/pages/index.tsx');
		expect(collectPageBrowserGraphContribution).toHaveBeenCalledWith('/app/pages/broken.tsx');
	});

	it('does not cache grouped page-browser assets when a sibling contribution fails', async () => {
		vi.spyOn(fileSystem, 'glob').mockResolvedValue(['index.tsx', 'dashboard.tsx', 'broken.tsx']);
		const processDependencies = vi.fn(async (dependencies: AssetDefinition[], key: string) => {
			if (key === 'react:grouped-page-browser-graph') {
				return dependencies
					.filter(isGroupedContentScriptDependency)
					.map((dependency) =>
						createProcessedGroupedScriptAsset(
							dependency.groupedBundle,
							`/assets/${dependency.groupedBundle.entryName}.js`,
						),
					);
			}

			return [];
		});
		const assetProcessingService = {
			processDependencies,
			getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [
				{
					name: 'react',
					extensions: ['.tsx'],
					initializeRenderer: vi.fn(),
					getResolvedIntegrationDependencies: () => [],
				},
			],
			absolutePaths: {
				pagesDir: '/app/pages',
			},
		} as unknown as EcoPagesAppConfig;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;
		const groupedDependencyByRoute = new Map<
			string,
			Extract<AssetDefinition, { kind: 'script'; source: 'content' }>
		>([
			[
				'/app/pages/index.tsx',
				createGroupedPageScriptDependency('console.log("index")', 'index-entry', {
					id: 'react-router-pages',
					entryName: 'index',
				}),
			],
			[
				'/app/pages/dashboard.tsx',
				createGroupedPageScriptDependency('console.log("dashboard")', 'dashboard-entry', {
					id: 'react-router-pages',
					entryName: 'dashboard',
				}),
			],
		]);
		const collectPageBrowserGraphContribution = vi.fn(
			async (routeFile: string): Promise<PageBrowserGraphContribution> => {
				if (routeFile === '/app/pages/broken.tsx') {
					throw new Error('broken sibling');
				}

				return {
					dependencies: [groupedDependencyByRoute.get(routeFile)!],
				};
			},
		);
		const createReactFlowAdapter = () => ({
			...createFlowAdapter({
				resolvePageModule: async () => ({
					Page,
					integrationSpecificProps: {},
				}),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({
					props: {},
					metadata: { title: 'Page', description: 'Page description' },
				}),
				resolveDependencies: async () => [],
				collectPageBrowserGraphContribution,
				shouldRenderPageComponent: () => false,
				renderPageComponent: vi.fn(),
			}),
			name: 'react' as const,
		});

		await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			createReactFlowAdapter(),
		);

		await flow.prepareRenderOptions(
			{ file: '/app/pages/dashboard.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			createReactFlowAdapter(),
		);

		expect(processDependencies).toHaveBeenCalledTimes(2);
	});

	it('keeps grouped page-browser assets scoped by bundle id when routes reuse the same entry name', async () => {
		vi.spyOn(fileSystem, 'glob').mockResolvedValue(['marketing.tsx', 'docs.tsx']);
		const processDependencies = vi.fn(async (dependencies: AssetDefinition[], key: string) => {
			if (key === 'react:grouped-page-browser-graph') {
				return dependencies
					.filter(isGroupedContentScriptDependency)
					.map((dependency) =>
						createProcessedGroupedScriptAsset(
							dependency.groupedBundle,
							`/assets/${dependency.groupedBundle.id}-${dependency.groupedBundle.entryName}.js`,
						),
					);
			}

			return [];
		});
		const assetProcessingService = {
			processDependencies,
			getHmrManager: vi.fn(() => ({ isEnabled: () => false })),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [
				{
					name: 'react',
					extensions: ['.tsx'],
					initializeRenderer: vi.fn(),
					getResolvedIntegrationDependencies: () => [],
				},
			],
			absolutePaths: {
				pagesDir: '/app/pages',
			},
		} as unknown as EcoPagesAppConfig;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;
		const groupedDependencyByRoute = new Map<
			string,
			Extract<AssetDefinition, { kind: 'script'; source: 'content' }>
		>([
			[
				'/app/pages/marketing.tsx',
				createGroupedPageScriptDependency('console.log("marketing")', 'marketing-entry', {
					id: 'marketing-layout',
					entryName: 'index',
				}),
			],
			[
				'/app/pages/docs.tsx',
				createGroupedPageScriptDependency('console.log("docs")', 'docs-entry', {
					id: 'docs-layout',
					entryName: 'index',
				}),
			],
		]);
		const collectPageBrowserGraphContribution = vi.fn(
			async (routeFile: string): Promise<PageBrowserGraphContribution> => ({
				dependencies: [groupedDependencyByRoute.get(routeFile)!],
			}),
		);
		const createReactFlowAdapter = () => ({
			...createFlowAdapter({
				resolvePageModule: async () => ({
					Page,
					integrationSpecificProps: {},
				}),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({
					props: {},
					metadata: { title: 'Page', description: 'Page description' },
				}),
				resolveDependencies: async () => [],
				collectPageBrowserGraphContribution,
				shouldRenderPageComponent: () => false,
				renderPageComponent: vi.fn(),
			}),
			name: 'react' as const,
		});

		const marketingResult = await flow.prepareRenderOptions(
			{ file: '/app/pages/marketing.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			createReactFlowAdapter(),
		);

		const docsResult = await flow.prepareRenderOptions(
			{ file: '/app/pages/docs.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			createReactFlowAdapter(),
		);

		expect(marketingResult.pagePackage?.pageBrowserGraph?.entryAssets).toEqual([
			expect.objectContaining({
				srcUrl: '/assets/marketing-layout-index.js',
				groupedBundle: { id: 'marketing-layout', entryName: 'index' },
			}),
		]);
		expect(docsResult.pagePackage?.pageBrowserGraph?.entryAssets).toEqual([
			expect.objectContaining({
				srcUrl: '/assets/docs-layout-index.js',
				groupedBundle: { id: 'docs-layout', entryName: 'index' },
			}),
		]);
	});

	it('rebuilds grouped page-browser assets on each request when HMR is enabled', async () => {
		vi.spyOn(fileSystem, 'glob').mockResolvedValue(['index.tsx', 'dashboard.tsx']);
		let groupedVersion = 1;
		const processDependencies = vi.fn(async (dependencies: AssetDefinition[], key: string) => {
			if (key === 'react:grouped-page-browser-graph') {
				return dependencies
					.filter(isGroupedContentScriptDependency)
					.map((dependency) =>
						createProcessedGroupedScriptAsset(
							dependency.groupedBundle,
							`/assets/${dependency.groupedBundle.entryName}-v${groupedVersion}.js`,
						),
					);
			}

			return [];
		});
		const assetProcessingService = {
			processDependencies,
			getHmrManager: vi.fn(() => ({ isEnabled: () => true })),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [
				{
					name: 'react',
					extensions: ['.tsx'],
					initializeRenderer: vi.fn(),
					getResolvedIntegrationDependencies: () => [],
				},
			],
			absolutePaths: {
				pagesDir: '/app/pages',
			},
		} as unknown as EcoPagesAppConfig;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;
		const collectPageBrowserGraphContribution = vi.fn(
			async (routeFile: string): Promise<PageBrowserGraphContribution> => ({
				dependencies: [
					createGroupedPageScriptDependency(
						`console.log("${routeFile}-v${groupedVersion}")`,
						`${routeFile}-entry`,
						{
							id: 'react-router-pages',
							entryName: routeFile.includes('dashboard') ? 'dashboard' : 'index',
						},
					),
				],
			}),
		);
		const createReactFlowAdapter = () => ({
			...createFlowAdapter({
				resolvePageModule: async () => ({
					Page,
					integrationSpecificProps: {},
				}),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({
					props: {},
					metadata: { title: 'Page', description: 'Page description' },
				}),
				resolveDependencies: async () => [],
				collectPageBrowserGraphContribution,
				shouldRenderPageComponent: () => false,
				renderPageComponent: vi.fn(),
			}),
			name: 'react' as const,
		});

		const firstResult = await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			createReactFlowAdapter(),
		);

		groupedVersion = 2;

		const secondResult = await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			createReactFlowAdapter(),
		);

		expect(firstResult.pagePackage?.pageBrowserGraph?.entryAssets).toEqual([
			expect.objectContaining({ srcUrl: '/assets/index-v1.js' }),
		]);
		expect(secondResult.pagePackage?.pageBrowserGraph?.entryAssets).toEqual([
			expect.objectContaining({ srcUrl: '/assets/index-v2.js' }),
		]);
		expect(processDependencies).toHaveBeenCalledTimes(2);
	});

	it('should guard page locals for static pages and skip page-root rendering when disabled', async () => {
		const assetProcessingService = {
			processDependencies: vi.fn(async () => []),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [],
		} as unknown as EcoPagesAppConfig;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;
		const renderPageComponent = vi.fn();

		const result = await flow.prepareRenderOptions(
			{
				file: '/app/pages/index.tsx',
				params: {},
				query: {},
				locals: { hidden: true },
			} as unknown as RouteRendererOptions,
			createFlowAdapter({
				resolvePageModule: async () => ({
					Page,
					integrationSpecificProps: {},
				}),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({
					props: {},
					metadata: { title: 'Static page', description: 'Static page description' },
				}),
				resolveDependencies: async () => [],
				collectPageBrowserGraphContribution: async () => ({ assets: [] }),
				shouldRenderPageComponent: () => false,
				renderPageComponent,
			}),
		);

		expect(result.locals).toBeUndefined();
		expect(() => Reflect.get(result.pageLocals as object, 'guarded')).toThrow(LocalsAccessError);
		expect(result.componentRender).toBeUndefined();
		expect(renderPageComponent).not.toHaveBeenCalled();
	});

	it('eagerly emits lazy SSR component scripts for shared non-owning routes', async () => {
		const eagerSsrLazyAsset = {
			kind: 'script',
			srcUrl: '/assets/components/lit-counter.script.js',
			position: 'head',
			packageRole: 'dynamic-chunk',
		} as ProcessedAsset;
		const processDependencies = vi.fn(async (dependencies: AssetDefinition[]) => {
			const hasEagerSsrLazyDependency = dependencies.some((dependency) => {
				if (dependency.kind !== 'script' || dependency.source !== 'file') {
					return false;
				}

				return String(dependency.filepath).endsWith('/lit-counter.script.ts');
			});

			return hasEagerSsrLazyDependency ? [eagerSsrLazyAsset] : [];
		});
		const assetProcessingService = {
			processDependencies,
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [{ name: 'lit' }],
		} as unknown as EcoPagesAppConfig;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const LitCounter = (() => '<lit-counter count="0"></lit-counter>') as unknown as EcoComponent<object>;
		LitCounter.config = {
			__eco: { id: 'lit-counter', file: '/app/components/lit-counter.lit.tsx', integration: 'lit' },
			dependencies: {
				scripts: [{ src: './lit-counter.script.ts', lazy: { 'on:interaction': 'click' }, ssr: true }],
			},
		};
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;
		Page.config = {
			dependencies: {
				components: [LitCounter],
			},
		};

		await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			createFlowAdapter({
				resolvePageModule: async () => ({
					Page,
					integrationSpecificProps: {},
				}),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({
					props: {},
					metadata: { title: 'Static page', description: 'Static page description' },
				}),
				resolveDependencies: async () => [],
				collectPageBrowserGraphContribution: async () => ({ assets: [] }),
				shouldRenderPageComponent: () => false,
				renderPageComponent: vi.fn(),
			}),
		);

		expect(processDependencies).toHaveBeenCalledOnce();
		expect(processDependencies).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					kind: 'script',
					source: 'file',
					filepath: '/app/components/lit-counter.script.ts',
					packageRole: 'dynamic-chunk',
				}),
			],
			'ghtml:ssr-lazy',
		);
	});

	it('exposes eager lazy SSR assets through the returned page package', async () => {
		const eagerSsrLazyAsset = {
			kind: 'script',
			srcUrl: '/assets/components/lit-counter.script.js',
			position: 'head',
			packageRole: 'dynamic-chunk',
		} as ProcessedAsset;
		const assetProcessingService = {
			processDependencies: vi.fn(async (dependencies: AssetDefinition[]) => {
				const hasEagerSsrLazyDependency = dependencies.some((dependency) => {
					if (dependency.kind !== 'script' || dependency.source !== 'file') {
						return false;
					}

					return String(dependency.filepath).endsWith('/lit-counter.script.ts');
				});

				return hasEagerSsrLazyDependency ? [eagerSsrLazyAsset] : [];
			}),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [{ name: 'lit' }],
		} as unknown as EcoPagesAppConfig;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const LitCounter = (() => '<lit-counter count="0"></lit-counter>') as unknown as EcoComponent<object>;
		LitCounter.config = {
			__eco: { id: 'lit-counter', file: '/app/components/lit-counter.lit.tsx', integration: 'lit' },
			dependencies: {
				scripts: [{ src: './lit-counter.script.ts', lazy: { 'on:interaction': 'click' }, ssr: true }],
			},
		};
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;
		Page.config = {
			dependencies: {
				components: [LitCounter],
			},
		};

		const result = await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			createFlowAdapter({
				resolvePageModule: async () => ({
					Page,
					integrationSpecificProps: {},
				}),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({
					props: {},
					metadata: { title: 'Static page', description: 'Static page description' },
				}),
				resolveDependencies: async () => [],
				collectPageBrowserGraphContribution: async () => ({ assets: [] }),
				shouldRenderPageComponent: () => false,
				renderPageComponent: vi.fn(),
			}),
		);

		expect(result.pagePackage).toEqual(
			expect.objectContaining({
				dynamicChunks: [eagerSsrLazyAsset],
			}),
		);
	});

	it('skips undefined component entries while collecting integration dependencies and triggers', async () => {
		const integrationDependency = {
			kind: 'script',
			srcUrl: '/assets/react-runtime.js',
			position: 'head',
		} as ProcessedAsset;
		const assetProcessingService = {
			processDependencies: vi.fn(async () => []),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [
				{
					name: 'react',
					initializeRenderer: vi.fn(),
					getResolvedIntegrationDependencies: () => [integrationDependency],
				},
			],
		} as unknown as EcoPagesAppConfig;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Nested = (() => '<aside>Nested</aside>') as EcoComponent<Record<string, unknown>>;
		Nested.config = {
			integration: 'react',
			__eco: { id: 'nested', file: '/app/components/nested.tsx', integration: 'react' },
		};
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;
		Page.config = {
			dependencies: {
				components: [undefined, Nested] as unknown as EcoComponent[],
			},
		};
		await expect(
			flow.prepareRenderOptions(
				{ file: '/app/pages/404.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
				createFlowAdapter({
					resolvePageModule: async () => ({
						Page,
						integrationSpecificProps: {},
					}),
					getHtmlTemplate: async () => HtmlTemplate,
					resolvePageData: async () => ({
						props: {},
						metadata: { title: '404', description: 'Not found' },
					}),
					resolveDependencies: async () => [],
					collectPageBrowserGraphContribution: async () => ({ assets: [] }),
					shouldRenderPageComponent: () => false,
					renderPageComponent: vi.fn(),
				}),
			),
		).resolves.toEqual(
			expect.objectContaining({
				Page,
			}),
		);

		const result = await flow.prepareRenderOptions(
			{ file: '/app/pages/404.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			createFlowAdapter({
				resolvePageModule: async () => ({
					Page,
					integrationSpecificProps: {},
				}),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({
					props: {},
					metadata: { title: '404', description: 'Not found' },
				}),
				resolveDependencies: async () => [],
				collectPageBrowserGraphContribution: async () => ({ assets: [] }),
				shouldRenderPageComponent: () => false,
				renderPageComponent: vi.fn(),
			}),
		);

		expect(result.pagePackage).toEqual(
			expect.objectContaining({
				assets: [integrationDependency],
			}),
		);
	});

	it('uses an injected ownership validation service when provided', async () => {
		const assetProcessingService = {
			processDependencies: vi.fn(async () => []),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [],
		} as unknown as EcoPagesAppConfig;
		const injectedOwnershipValidationService = {
			validate: vi.fn(() => []),
		} as unknown as OwnershipValidationService;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService, {
			ownershipValidationService: injectedOwnershipValidationService,
		});
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;

		await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			createFlowAdapter({
				resolvePageModule: async () => ({
					Page,
					integrationSpecificProps: {},
				}),
				getHtmlTemplate: async () => HtmlTemplate,
				resolvePageData: async () => ({
					props: {},
					metadata: { title: 'Page', description: 'Page description' },
				}),
				resolveDependencies: async () => [],
				collectPageBrowserGraphContribution: async () => ({ assets: [] }),
				shouldRenderPageComponent: () => false,
				renderPageComponent: vi.fn(),
			}),
		);

		expect(injectedOwnershipValidationService.validate).toHaveBeenCalledWith({
			currentIntegrationName: 'ghtml',
			roots: [
				{ component: HtmlTemplate, source: 'html-template' },
				{ component: Page, source: 'page' },
			],
		});
	});

	it('throws when injected ownership validation reports errors', async () => {
		const assetProcessingService = {
			processDependencies: vi.fn(async () => []),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [],
		} as unknown as EcoPagesAppConfig;
		const injectedOwnershipValidationService = {
			validate: vi.fn(() => [
				{
					code: 'UNKNOWN_INTEGRATION_OWNER',
					message:
						'[ecopages] Foreign child "missing-foreign-component" references unknown integration owner "missing-renderer".',
					componentId: 'missing-foreign-component',
					integrationName: 'missing-renderer',
				},
			]),
		} as unknown as OwnershipValidationService;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService, {
			ownershipValidationService: injectedOwnershipValidationService,
		});
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;

		await expect(
			flow.prepareRenderOptions(
				{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
				createFlowAdapter({
					resolvePageModule: async () => ({
						Page,
						integrationSpecificProps: {},
					}),
					getHtmlTemplate: async () => HtmlTemplate,
					resolvePageData: async () => ({
						props: {},
						metadata: { title: 'Page', description: 'Page description' },
					}),
					resolveDependencies: async () => [],
					collectPageBrowserGraphContribution: async () => ({ assets: [] }),
					shouldRenderPageComponent: () => false,
					renderPageComponent: vi.fn(),
				}),
			),
		).rejects.toThrow(
			'[ecopages] Foreign child "missing-foreign-component" references unknown integration owner "missing-renderer".',
		);
	});
});
