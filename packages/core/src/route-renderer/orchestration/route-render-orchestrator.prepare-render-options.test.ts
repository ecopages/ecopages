import { describe, expect, it, vi } from 'vitest';
import { eco } from '../../eco/eco.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type {
	OwnershipPlan,
	EcoComponent,
	EcoPageComponent,
	HtmlTemplateProps,
	PageBrowserGraphContribution,
	PageMetadataProps,
	RouteRendererOptions,
} from '../../types/public-types.ts';
import { LocalsAccessError } from '../../errors/locals-access-error.ts';
import { OwnershipPlanningService } from './ownership-planning.service.ts';
import type {
	AssetDefinition,
	AssetProcessingService,
	ProcessedAsset,
} from '../../services/assets/asset-processing-service/index.ts';
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
			integrations: [],
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
			integrations: [],
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

	it('uses an injected ownership planning service when provided', async () => {
		const assetProcessingService = {
			processDependencies: vi.fn(async () => []),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [],
		} as unknown as EcoPagesAppConfig;
		const ownershipPlan = {
			root: {
				id: 'route:/app/pages/index.tsx',
				source: 'route',
				ownership: {
					integrationName: 'ghtml',
					componentId: 'route:/app/pages/index.tsx',
					componentFile: '/app/pages/index.tsx',
					isPageEntry: false,
					isForeignToParent: false,
				},
				children: [],
				declaredDependenciesValid: true,
			},
			rendererNames: ['ghtml'],
			foreignEdgeCount: 0,
			hasValidationErrors: false,
			validationErrors: [],
		} satisfies OwnershipPlan;
		const injectedOwnershipPlanningService = {
			buildPlan: vi.fn(() => ownershipPlan),
		} as unknown as OwnershipPlanningService;
		const injectedOwnershipValidationService = {
			validate: vi.fn(() => []),
		} as unknown as OwnershipValidationService;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService, {
			ownershipPlanningService: injectedOwnershipPlanningService,
			ownershipValidationService: injectedOwnershipValidationService,
		});
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
				collectPageBrowserGraphContribution: async () => ({ assets: [] }),
				shouldRenderPageComponent: () => false,
				renderPageComponent: vi.fn(),
			}),
		);

		expect(injectedOwnershipPlanningService.buildPlan).toHaveBeenCalledWith({
			routeFile: '/app/pages/index.tsx',
			currentIntegrationName: 'ghtml',
			HtmlTemplate,
			Layout: undefined,
			Page,
			validationErrors: [],
		});
		expect(result.ownershipPlan).toBe(ownershipPlan);
	});
});
