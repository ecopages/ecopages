import { describe, expect, it, vi } from 'vitest';
import { eco } from '../../eco/eco.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type {
	BoundaryPlan,
	EcoComponent,
	EcoPageComponent,
	HtmlTemplateProps,
	RouteRendererOptions,
} from '../../types/public-types.ts';
import { LocalsAccessError } from '../../errors/locals-access-error.ts';
import { BoundaryPlanningService } from './boundary-planning.service.ts';
import type {
	AssetDefinition,
	AssetProcessingService,
	ProcessedAsset,
} from '../../services/assets/asset-processing-service/index.ts';
import { BoundaryOwnershipValidationService } from './boundary-ownership-validation.service.ts';
import { type RouteRenderFlowCallbacks, RouteRenderFlow } from './route-render-flow.ts';

declare module '../../types/public-types.ts' {
	interface RequestLocals {
		user?: string;
		guarded?: boolean;
	}
}

function createFlowCallbacks<C>(
	callbacks: Omit<
		RouteRenderFlowCallbacks<C>,
		| 'render'
		| 'getDocumentAttributes'
		| 'applyAttributesToHtmlElement'
		| 'applyAttributesToFirstBodyElement'
		| 'transformResponse'
	>,
): RouteRenderFlowCallbacks<C> {
	return {
		...callbacks,
		render: async () => '',
		getDocumentAttributes: () => undefined,
		applyAttributesToHtmlElement: (html) => html,
		applyAttributesToFirstBodyElement: (html) => html,
		transformResponse: async (response) => await response.text(),
	};
}

describe('RouteRenderFlow prepareRenderOptions', () => {
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
		const flow = new RouteRenderFlow(appConfig, assetProcessingService);
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
			'ghtml',
			createFlowCallbacks({
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
				buildPageBrowserGraph: async () => ({ assets: [pageDependency] }),
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
				assets: [resolvedDependency, integrationDependency, pageDependency, componentAsset],
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
		const flow = new RouteRenderFlow(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const DeferredChild = eco.component<{}, string>({
			integration: 'react',
			render: () => '<span>Deferred</span>',
		});
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;

		const result = await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			'ghtml',
			createFlowCallbacks({
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
				buildPageBrowserGraph: async () => ({ assets: [] }),
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
		const flow = new RouteRenderFlow(appConfig, assetProcessingService);
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
			'ghtml',
			createFlowCallbacks({
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
				buildPageBrowserGraph: async () => ({ assets: [] }),
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

	it('should guard page locals for static pages and skip page-root rendering when disabled', async () => {
		const assetProcessingService = {
			processDependencies: vi.fn(async () => []),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [],
		} as unknown as EcoPagesAppConfig;
		const flow = new RouteRenderFlow(appConfig, assetProcessingService);
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
			'ghtml',
			createFlowCallbacks({
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
				buildPageBrowserGraph: async () => ({ assets: [] }),
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
		const flow = new RouteRenderFlow(appConfig, assetProcessingService);
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
			'ghtml',
			createFlowCallbacks({
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
				buildPageBrowserGraph: async () => ({ assets: [] }),
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
		const flow = new RouteRenderFlow(appConfig, assetProcessingService);
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
			'ghtml',
			createFlowCallbacks({
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
				buildPageBrowserGraph: async () => ({ assets: [] }),
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
		const flow = new RouteRenderFlow(appConfig, assetProcessingService);
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
				'ghtml',
				createFlowCallbacks({
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
					buildPageBrowserGraph: async () => ({ assets: [] }),
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
			'ghtml',
			createFlowCallbacks({
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
				buildPageBrowserGraph: async () => ({ assets: [] }),
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

	it('uses an injected boundary planning service when provided', async () => {
		const assetProcessingService = {
			processDependencies: vi.fn(async () => []),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [],
		} as unknown as EcoPagesAppConfig;
		const boundaryPlan = {
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
		} satisfies BoundaryPlan;
		const injectedBoundaryPlanningService = {
			buildPlan: vi.fn(() => boundaryPlan),
		} as unknown as BoundaryPlanningService;
		const injectedBoundaryOwnershipValidationService = {
			validate: vi.fn(() => []),
		} as unknown as BoundaryOwnershipValidationService;
		const flow = new RouteRenderFlow(appConfig, assetProcessingService, {
			boundaryPlanningService: injectedBoundaryPlanningService,
			boundaryOwnershipValidationService: injectedBoundaryOwnershipValidationService,
		});
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;

		const result = await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			'ghtml',
			createFlowCallbacks({
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
				buildPageBrowserGraph: async () => ({ assets: [] }),
				shouldRenderPageComponent: () => false,
				renderPageComponent: vi.fn(),
			}),
		);

		expect(injectedBoundaryPlanningService.buildPlan).toHaveBeenCalledWith({
			routeFile: '/app/pages/index.tsx',
			currentIntegrationName: 'ghtml',
			HtmlTemplate,
			Layout: undefined,
			Page,
			validationErrors: [],
		});
		expect(result.boundaryPlan).toBe(boundaryPlan);
	});
});
