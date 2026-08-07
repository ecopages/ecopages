import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type {
	EcoComponent,
	EcoPageComponent,
	EcoPageFile,
	HtmlTemplateProps,
	PageBrowserGraphContribution,
	PageBrowserGraphContributionContext,
	PageMetadataProps,
	RouteRendererOptions,
} from '../../../types/public-types.ts';
import { LocalsAccessError } from '../../../errors/locals-access-error.ts';
import type {
	AssetDefinition,
	AssetProcessingService,
	ProcessedAsset,
} from '../../../services/assets/asset-processing-service/index.ts';
import type { GroupedScriptBundle } from '../../../services/assets/asset-processing-service/assets.types.ts';
import { OwnershipValidationService } from '../ownership-graph/ownership-validation.service.ts';
import { resolvePageLayoutComponents } from '../document-shell/layout-shell-props.service.ts';
import { createPageDependencyInstanceKey } from '../page-browser-graph/route-instance-key.ts';
import { type RouteRenderOrchestratorAdapter, RouteRenderOrchestrator } from './route-render-orchestrator.ts';

declare module '../../../types/public-types.ts' {
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
	collectPageBrowserGraphContribution: (
		context: PageBrowserGraphContributionContext,
	) => Promise<PageBrowserGraphContribution | undefined>;
	resolvePageDependencies?: (
		context: PageBrowserGraphContributionContext,
	) => Promise<import('../../page-loading/resolved-page-dependencies.ts').ResolvedPageDependencies | undefined>;
}): RouteRenderOrchestratorAdapter<C> {
	return {
		name: 'ghtml',
		resolveRouteRenderInputs: async (routeOptions) => {
			const pageModule = await input.resolvePageModule(routeOptions.file);
			const HtmlTemplate = await input.getHtmlTemplate();
			const Layouts = resolvePageLayoutComponents(pageModule.Page.config?.layouts);
			const Layout = Layouts[Layouts.length - 1];
			const { props, metadata } = await input.resolvePageData(pageModule, routeOptions);

			return {
				Page: pageModule.Page,
				pageModule: {
					default: pageModule.Page,
					...pageModule.integrationSpecificProps,
				} as EcoPageFile,
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
		collectPageBrowserGraphContribution: async (context) =>
			await input.collectPageBrowserGraphContribution(context),
		resolvePageDependencies: input.resolvePageDependencies ?? (async () => undefined),
		buildPageBrowserGraphContributionContext: async (routeFile, routeOptions) => {
			const pageModule = await input.resolvePageModule(routeFile);
			const { props } = await input.resolvePageData(pageModule, {
				file: routeFile,
				params: routeOptions?.params,
				query: routeOptions?.query,
			});

			return {
				file: routeFile,
				pageModule: {
					default: pageModule.Page,
					...pageModule.integrationSpecificProps,
				} as EcoPageFile,
				props,
				params: routeOptions?.params,
				query: routeOptions?.query,
				dependencyInstanceKey: createPageDependencyInstanceKey({
					params: routeOptions?.params,
					query: routeOptions?.query,
				}),
			};
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
			identity: { id: 'nested', file: '/app/components/nested.tsx', integration: 'react' },
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
			props: { title: 'Overridden title' },
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
				collectPageBrowserGraphContribution: async (context) => {
					expect(context.props).toEqual({ title: 'Overridden title' });
					return { assets: [pageDependency] };
				},
			}),
		);

		expect(result.locals).toEqual({ user: 'andee' });
		expect(result.pageLocals).toEqual({ user: 'andee' });
		expect(result.pageProps).toEqual({
			title: 'Overridden title',
			params: { slug: 'hello' },
			query: { preview: '1' },
		});
		expect((result as typeof result & { layoutMode?: string }).layoutMode).toBe('full');
		expect(result.pagePackage).toEqual(
			expect.objectContaining({
				assets: expect.arrayContaining([resolvedDependency, integrationDependency, pageDependency]),
				pageBrowserGraph: {
					entryAssets: [pageDependency],
					chunkAssets: [],
				},
			}),
		);
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
		const fixtureRootDir = path.join(process.cwd(), 'playground/react');
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [],
			rootDir: fixtureRootDir,
			absolutePaths: { projectDir: fixtureRootDir },
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
		const collectPageBrowserGraphContribution = vi.fn(async (): Promise<PageBrowserGraphContribution> => ({
			dependencies: [
				{
					kind: 'script',
					source: 'content',
					content: 'console.log("page")',
					name: 'page',
					attributes: { type: 'module' },
				},
			],
		}));
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

	it('reuses the page browser graph cache when HMR is enabled and sources are unchanged', async () => {
		const pageBrowserAsset = {
			kind: 'script',
			srcUrl: '/assets/page.js',
			position: 'head',
		} as ProcessedAsset;
		const collectPageBrowserGraphContribution = vi.fn(async (): Promise<PageBrowserGraphContribution> => ({
			dependencies: [
				{
					kind: 'script',
					source: 'content',
					content: 'console.log("page")',
					name: 'page',
					attributes: { type: 'module' },
				},
			],
		}));
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
		expect(processDependencies).toHaveBeenCalledOnce();
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

	it('resolves grouped page-browser assets per route without a production build plan', async () => {
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
			async (context: PageBrowserGraphContributionContext): Promise<PageBrowserGraphContribution> => ({
				dependencies: [groupedDependencyByRoute.get(context.file)!],
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

		expect(processDependencies).toHaveBeenCalledTimes(2);
		expect(processDependencies.mock.calls[0]?.[1]).toBe('react:grouped-page-browser-graph');
		expect(collectPageBrowserGraphContribution).toHaveBeenCalledWith(
			expect.objectContaining({ file: '/app/pages/dashboard.tsx' }),
		);
		expect(firstResult.pagePackage?.pageBrowserGraph?.entryAssets).toEqual([
			expect.objectContaining({ groupedBundle: { id: 'react-router-pages', entryName: 'index' } }),
		]);
		expect(secondResult.pagePackage?.pageBrowserGraph?.entryAssets).toEqual([
			expect.objectContaining({ groupedBundle: { id: 'react-router-pages', entryName: 'dashboard' } }),
		]);
	});

	it('resolves grouped page-browser assets for the current route during prepareRenderOptions', async () => {
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
		const collectPageBrowserGraphContribution = vi.fn(async (): Promise<PageBrowserGraphContribution> => ({
			dependencies: [
				createGroupedPageScriptDependency('console.log("index")', 'index-entry', {
					id: 'react-router-pages',
					entryName: 'index',
				}),
			],
		}));
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
		expect(collectPageBrowserGraphContribution).toHaveBeenCalledWith(
			expect.objectContaining({ file: '/app/pages/index.tsx' }),
		);
	});

	it('does not cache route graphs built without a grouped production plan', async () => {
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
			async (context: PageBrowserGraphContributionContext): Promise<PageBrowserGraphContribution> => ({
				dependencies: [groupedDependencyByRoute.get(context.file)!],
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
			async (context: PageBrowserGraphContributionContext): Promise<PageBrowserGraphContribution> => ({
				dependencies: [groupedDependencyByRoute.get(context.file)!],
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

	it('rebuilds grouped page-browser assets when the contribution fingerprint changes under HMR', async () => {
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
			async (context: PageBrowserGraphContributionContext): Promise<PageBrowserGraphContribution> => ({
				dependencies: [
					createGroupedPageScriptDependency(
						`console.log("${context.file}-v${groupedVersion}")`,
						`${context.file}-entry`,
						{
							id: 'react-router-pages',
							entryName: context.file.includes('dashboard') ? 'dashboard' : 'index',
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

	it('processes only the current route grouped deps under HMR', async () => {
		vi.spyOn(fileSystem, 'glob').mockResolvedValue(['index.tsx', 'dashboard.tsx']);
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
			async (context: PageBrowserGraphContributionContext): Promise<PageBrowserGraphContribution> => ({
				dependencies: [
					createGroupedPageScriptDependency(`console.log("${context.file}")`, `${context.file}-entry`, {
						id: 'react-router-pages',
						entryName: context.file.includes('dashboard') ? 'dashboard' : 'index',
					}),
				],
			}),
		);

		await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			{
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
				}),
				name: 'react' as const,
			},
		);

		expect(collectPageBrowserGraphContribution).toHaveBeenCalledOnce();
		expect(collectPageBrowserGraphContribution).toHaveBeenCalledWith(
			expect.objectContaining({ file: '/app/pages/index.tsx' }),
		);
		const groupedCall = processDependencies.mock.calls.find(
			(call) => call[1] === 'react:grouped-page-browser-graph',
		);
		expect(groupedCall?.[0]).toHaveLength(1);
		expect((groupedCall?.[0]?.[0] as { groupedBundle?: { entryName: string } })?.groupedBundle?.entryName).toBe(
			'index',
		);
	});

	it('should guard page locals for static pages', async () => {
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

		const result = await flow.prepareRenderOptions(
			{
				file: '/app/pages/index.tsx',
				params: {},
				query: {},
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
			}),
		);

		expect(result.locals).toBeUndefined();
		expect(() => Reflect.get(result.pageLocals as object, 'guarded')).toThrow(LocalsAccessError);
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
			identity: { id: 'lit-counter', file: '/app/components/lit-counter.lit.tsx', integration: 'lit' },
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
			identity: { id: 'lit-counter', file: '/app/components/lit-counter.lit.tsx', integration: 'lit' },
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
			identity: { id: 'nested', file: '/app/components/nested.tsx', integration: 'react' },
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
				}),
			),
		).rejects.toThrow(
			'[ecopages] Foreign child "missing-foreign-component" references unknown integration owner "missing-renderer".',
		);
	});

	it('prepares render options when declared foreign dependencies are valid', async () => {
		const assetProcessingService = {
			processDependencies: vi.fn(async () => []),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [{ name: 'foreign-renderer', initializeRenderer: vi.fn() }],
		} as unknown as EcoPagesAppConfig;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);

		const ForeignComponent = (() => '<aside>Foreign</aside>') as EcoComponent<Record<string, unknown>>;
		ForeignComponent.config = {
			integration: 'foreign-renderer',
			identity: {
				id: 'foreign-component',
				file: '/app/components/foreign-component.tsx',
				integration: 'foreign-renderer',
			},
		};

		const Layout = (() => '<main>Layout</main>') as EcoComponent<Record<string, unknown>>;
		Layout.config = {
			identity: {
				id: 'layout-component',
				file: '/app/layouts/default.tsx',
				integration: 'ghtml',
			},
			dependencies: {
				components: [ForeignComponent],
			},
		};

		const Page = (() => 'Page Content') as EcoPageComponent<any>;
		Page.config = {
			layouts: [Layout],
			identity: {
				id: 'page-component',
				file: '/app/pages/index.tsx',
				integration: 'ghtml',
			},
		};

		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		HtmlTemplate.config = {
			identity: {
				id: 'html-template',
				file: '/app/index.ghtml.ts',
				integration: 'ghtml',
			},
		};

		const result = await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			{
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
					collectPageBrowserGraphContribution: async () => ({ assets: [] }),
				}),
				name: 'ghtml',
			},
		);

		expect(result).toEqual(
			expect.objectContaining({
				Page,
				Layout,
				HtmlTemplate,
			}),
		);
	});

	it('resolves dependencies for every layout tier in the stack', async () => {
		const assetProcessingService = {
			processDependencies: vi.fn(async () => []),
		} as unknown as AssetProcessingService;
		const appConfig = {
			cache: { defaultStrategy: 'static' },
			integrations: [
				{
					name: 'react',
					initializeRenderer: vi.fn(),
					getResolvedIntegrationDependencies: () => [],
				},
			],
		} as unknown as EcoPagesAppConfig;
		const flow = new RouteRenderOrchestrator(appConfig, assetProcessingService);
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const OuterLayout = (() => '<outer></outer>') as EcoComponent;
		OuterLayout.config = {
			integration: 'react',
			identity: { id: 'outer', file: '/app/layouts/outer.tsx', integration: 'react' },
		};
		const InnerLayout = (() => '<inner></inner>') as EcoComponent;
		InnerLayout.config = {
			integration: 'react',
			identity: { id: 'inner', file: '/app/layouts/inner.tsx', integration: 'react' },
		};
		const Page = (() => '<main>Page</main>') as unknown as EcoPageComponent<any>;
		Page.config = {
			layouts: [OuterLayout, InnerLayout],
			layoutEntries: [{ component: OuterLayout }, { component: InnerLayout }],
		};
		const resolvedComponents: EcoComponent[] = [];

		await flow.prepareRenderOptions(
			{ file: '/app/pages/index.tsx', params: {}, query: {} } as unknown as RouteRendererOptions,
			{
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
					resolveDependencies: async (components) => {
						resolvedComponents.push(...(components as EcoComponent[]));
						return [];
					},
					collectPageBrowserGraphContribution: async () => ({ assets: [] }),
				}),
				name: 'react',
			},
		);

		expect(resolvedComponents).toEqual([HtmlTemplate, OuterLayout, InnerLayout, Page]);
	});
});
