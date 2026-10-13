import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type {
	EcoComponent,
	EcoPageComponent,
	HtmlTemplateProps,
	PageBrowserGraphContribution,
	PageBrowserGraphContributionContext,
} from '../../../types/public-types.ts';
import { registerDiscoveredDependencies } from '../../../eco/discovered-dependencies.ts';
import { getAppBuildInputIndex } from '../../../build/cache/build-input-dependency-index.ts';
import { LocalsAccessError } from '../../../errors/locals-access-error.ts';
import type {
	AssetDefinition,
	AssetProcessingService,
	ProcessedAsset,
} from '../../../services/assets/asset-processing-service/index.ts';
import type { GroupedScriptBundle } from '../../../services/assets/asset-processing-service/assets.types.ts';
import type { OwnershipValidationService } from '../ownership-graph/ownership-validation.service.ts';
import { RouteRenderOrchestrator } from './route-render-orchestrator.ts';
import { createFlowAdapter, createRouteOptions } from './route-render-orchestrator.test-fixtures.ts';

declare module '../../../types/public-types.ts' {
	interface RequestLocals {
		user?: string;
		guarded?: boolean;
	}
}

type PageConfig = EcoPageComponent<Record<string, unknown>>['config'];
type GroupedContentScript = Extract<AssetDefinition, { kind: 'script'; source: 'content' }>;

function createPage(config?: PageConfig): EcoPageComponent<Record<string, unknown>> {
	return Object.assign(() => '<main>Page</main>', { config }) as unknown as EcoPageComponent<Record<string, unknown>>;
}

function createComponent(config: PageConfig): EcoComponent<Record<string, unknown>> {
	return Object.assign(() => '<aside>Component</aside>', { config }) as unknown as EcoComponent<
		Record<string, unknown>
	>;
}

function createScriptAsset(srcUrl: string, overrides: Partial<ProcessedAsset> = {}): ProcessedAsset {
	return { kind: 'script', srcUrl, position: 'head', ...overrides } as ProcessedAsset;
}

/**
 * Builds a {@link RouteRenderOrchestrator} over a recording `processDependencies` double.
 *
 * @remarks
 * `hmrEnabled` adds `getHmrManager`; leave it undefined for tests that never reach the page browser
 * graph cache. The default app config is a static-cache app with no integrations.
 */
function createOrchestrator(
	options: {
		integrations?: unknown[];
		appConfig?: Record<string, unknown>;
		processDependencies?: AssetProcessingService['processDependencies'];
		hmrEnabled?: boolean;
		orchestratorOptions?: ConstructorParameters<typeof RouteRenderOrchestrator>[2];
	} = {},
) {
	const processDependencies = vi.fn<AssetProcessingService['processDependencies']>(
		options.processDependencies ?? (async () => []),
	);
	const appConfig = {
		cache: { defaultStrategy: 'static' },
		integrations: options.integrations ?? [],
		...options.appConfig,
	} as unknown as EcoPagesAppConfig;
	const assetProcessingService = {
		processDependencies,
		...(options.hmrEnabled === undefined
			? {}
			: { getHmrManager: vi.fn(() => ({ isEnabled: () => options.hmrEnabled })) }),
	} as unknown as AssetProcessingService;

	return {
		appConfig,
		processDependencies,
		flow: new RouteRenderOrchestrator(appConfig, assetProcessingService, options.orchestratorOptions),
	};
}

function createReactIntegration(dependencies: ProcessedAsset[] = [], extra: Record<string, unknown> = {}) {
	return {
		name: 'react',
		initializeRenderer: vi.fn(),
		getResolvedIntegrationDependencies: () => dependencies,
		...extra,
	};
}

function createGroupedPageScriptDependency(
	file: string,
	groupedBundle: GroupedScriptBundle,
	content = `console.log("${file}")`,
): GroupedContentScript {
	return {
		kind: 'script',
		source: 'content',
		content,
		name: `${groupedBundle.entryName}-entry`,
		packageRole: 'page-script',
		groupedBundle,
	};
}

/**
 * Prepares routes through a react-owned orchestrator whose page browser graph contributes one
 * grouped content script per route.
 *
 * @remarks
 * `processDependencies` answers the `react:grouped-page-browser-graph` batch with one processed
 * asset per grouped script, so assertions read the asset a route received and how many batches
 * the orchestrator processed.
 */
function createGroupedHarness(options: {
	bundleFor: (file: string) => GroupedScriptBundle;
	srcUrl?: (bundle: GroupedScriptBundle) => string;
	contentFor?: (file: string) => string;
	hmrEnabled?: boolean;
}) {
	const srcUrl = options.srcUrl ?? ((bundle) => `/assets/${bundle.entryName}.js`);
	const { flow, processDependencies } = createOrchestrator({
		integrations: [createReactIntegration([], { extensions: ['.tsx'] })],
		appConfig: { absolutePaths: { pagesDir: '/app/pages' } },
		hmrEnabled: options.hmrEnabled ?? false,
		processDependencies: async (dependencies, key) =>
			key === 'react:grouped-page-browser-graph'
				? dependencies
						.filter(
							(dependency): dependency is GroupedContentScript & { groupedBundle: GroupedScriptBundle } =>
								Boolean(
									dependency.kind === 'script' &&
									dependency.source === 'content' &&
									dependency.groupedBundle,
								),
						)
						.map((dependency) =>
							createScriptAsset(srcUrl(dependency.groupedBundle), {
								packageRole: 'page-script',
								groupedBundle: dependency.groupedBundle,
							}),
						)
				: [],
	});
	const collectPageBrowserGraphContribution = vi.fn(
		async (context: PageBrowserGraphContributionContext): Promise<PageBrowserGraphContribution> => ({
			dependencies: [
				createGroupedPageScriptDependency(
					context.file,
					options.bundleFor(context.file),
					options.contentFor?.(context.file),
				),
			],
		}),
	);

	return {
		processDependencies,
		collectPageBrowserGraphContribution,
		prepare: (file: string) =>
			flow.prepareRenderOptions(
				createRouteOptions(file),
				createFlowAdapter({ name: 'react', collectPageBrowserGraphContribution }),
			),
	};
}

const reactRouterBundleFor = (file: string): GroupedScriptBundle => ({
	id: 'react-router-pages',
	entryName: file.includes('dashboard') ? 'dashboard' : 'index',
});

describe('RouteRenderOrchestrator prepareRenderOptions', () => {
	it('should prepare dynamic render options and merge renderer-owned assets', async () => {
		const integrationDependency = createScriptAsset('/assets/react-runtime.js');
		const resolvedDependency = {
			kind: 'stylesheet',
			srcUrl: '/assets/page.css',
			position: 'head',
		} as ProcessedAsset;
		const pageDependency = createScriptAsset('/assets/page-entry.js');
		const { flow } = createOrchestrator({ integrations: [createReactIntegration([integrationDependency])] });
		const Nested = createComponent({
			integration: 'react',
			identity: { id: 'nested', file: '/app/components/nested.tsx', integration: 'react' },
		});
		const Page = createPage({ dependencies: { components: [Nested] } });
		Page.cache = 'dynamic';
		const collectPageBrowserGraphContribution = vi.fn(async () => ({ assets: [pageDependency] }));

		const result = await flow.prepareRenderOptions(
			createRouteOptions('/app/pages/index.tsx', {
				params: { slug: 'hello' },
				query: { preview: '1' },
				props: { title: 'Overridden title' },
				locals: { user: 'andee' },
			}),
			createFlowAdapter({
				Page,
				integrationSpecificProps: { layoutMode: 'full' },
				pageData: { props: { title: 'Hello' }, metadata: { title: 'Hello', description: 'Hello description' } },
				resolveDependencies: async () => [resolvedDependency],
				collectPageBrowserGraphContribution,
			}),
		);

		expect(collectPageBrowserGraphContribution).toHaveBeenCalledWith(
			expect.objectContaining({ props: { title: 'Overridden title' } }),
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

	describe('source dependency paths', () => {
		it('adds registered route-module inputs to the cached HTML dependencies', async () => {
			const { flow, appConfig } = createOrchestrator();
			const routeFile = '/app/pages/about.html';
			const routeHelper = '/app/components/shared-title.ts';
			getAppBuildInputIndex(appConfig).register({ consumer: 'server-route-module', key: routeFile }, [
				routeFile,
				routeHelper,
			]);

			const result = await flow.prepareRenderOptions(
				createRouteOptions(routeFile),
				createFlowAdapter({
					Page: createPage({ identity: { id: 'about-page', file: routeFile, integration: 'string' } }),
				}),
			);

			expect(result.sourceDependencyPaths).toEqual(expect.arrayContaining([routeFile, routeHelper]));
			expect(getAppBuildInputIndex(appConfig).recordedWatchPaths()).toContain(routeHelper);
		});

		it('collects none in production, where nothing watches them', async () => {
			vi.stubEnv('NODE_ENV', 'production');
			const { flow, appConfig } = createOrchestrator();
			const routeFile = '/app/pages/about.html';

			const result = await flow.prepareRenderOptions(
				createRouteOptions(routeFile),
				createFlowAdapter({
					Page: createPage({ identity: { id: 'about-page', file: routeFile, integration: 'string' } }),
				}),
			);

			expect(result.sourceDependencyPaths).toBeUndefined();
			expect(getAppBuildInputIndex(appConfig).recordedWatchPaths()).toEqual([]);
		});

		it('adds nested Component identity files', async () => {
			const { flow } = createOrchestrator();
			const Child = createComponent({
				identity: { id: 'counter', file: '/app/src/components/counter.lit.tsx', integration: 'string' },
			});

			const result = await flow.prepareRenderOptions(
				createRouteOptions('/app/src/pages/discovery.lit.tsx'),
				createFlowAdapter({
					Page: createPage({
						identity: { id: 'discovery', file: '/app/src/pages/discovery.lit.tsx', integration: 'string' },
						dependencies: { components: [Child] },
					}),
				}),
			);

			expect(result.sourceDependencyPaths).toEqual(
				expect.arrayContaining(['/app/src/pages/discovery.lit.tsx', '/app/src/components/counter.lit.tsx']),
			);
		});

		it('adds the watch files a Page identity registers', async () => {
			const { flow, appConfig } = createOrchestrator();
			const identity = { id: 'discovery', file: '/app/src/pages/discovery.lit.tsx', integration: 'string' };
			const watchFiles = [
				'/app/src/components/dependency-discovery/counter.lit.tsx',
				'/app/src/components/dependency-discovery/barrel/index.ts',
			];
			registerDiscoveredDependencies(identity, { components: () => [], stylesheets: [], watchFiles });

			const result = await flow.prepareRenderOptions(
				createRouteOptions(identity.file),
				createFlowAdapter({ Page: createPage({ identity }) }),
			);

			const expected = expect.arrayContaining([identity.file, ...watchFiles]);
			expect(result.sourceDependencyPaths).toEqual(expected);
			expect(getAppBuildInputIndex(appConfig).recordedWatchPaths()).toEqual(expected);
		});
	});

	it('includes integration dependencies from route-resolved page roots', async () => {
		const integrationDependency = createScriptAsset('/assets/lit-runtime.js');
		const pageDependency = { kind: 'stylesheet', srcUrl: '/assets/entry.css', position: 'head' } as ProcessedAsset;
		const { flow } = createOrchestrator({
			integrations: [{ ...createReactIntegration([integrationDependency]), name: 'lit' }],
		});
		const resolvedContent = createComponent({
			identity: { id: 'content', file: '/app/content/intro.mdx', integration: 'lit' },
		});

		const result = await flow.prepareRenderOptions(
			createRouteOptions('/app/pages/docs/[...slug].tsx', { params: { slug: ['intro'] } }),
			createFlowAdapter({
				resolvePageDependencies: async () => ({
					ownerFile: '/app/content/intro.mdx',
					components: [resolvedContent],
					contribution: { assets: [pageDependency] },
				}),
			}),
		);

		expect(result.resolvedPageDependencyComponents).toEqual([resolvedContent]);
		expect(result.pagePackage).toEqual(
			expect.objectContaining({ assets: expect.arrayContaining([integrationDependency, pageDependency]) }),
		);
	});

	it('inlines the global injector bootstrap when resolved lazy triggers are present', async () => {
		const fixtureRootDir = path.join(process.cwd(), 'playground/react');
		const { flow, processDependencies } = createOrchestrator({
			appConfig: { rootDir: fixtureRootDir, absolutePaths: { projectDir: fixtureRootDir } },
			processDependencies: async (dependencies) =>
				dependencies.map((dependency) => ({
					kind: dependency.kind,
					position: dependency.position,
					attributes: dependency.attributes,
					content: dependency.source === 'content' ? dependency.content : undefined,
					inline: dependency.inline,
					packageRole: dependency.packageRole,
				})) as ProcessedAsset[],
		});
		const Page = createPage({
			_resolvedLazyTriggers: [
				{
					triggerId: 'eco-trigger-theme-toggle',
					rules: [{ 'on:interaction': { value: 'click', scripts: ['/assets/lazy-theme-toggle.js'] } }],
				},
			],
		});

		await flow.prepareRenderOptions(createRouteOptions('/app/pages/index.tsx'), createFlowAdapter({ Page }));

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
			'string',
		);
	});

	it.each([
		{ hmr: 'disabled', hmrEnabled: false, expectedCollections: 1 },
		{ hmr: 'enabled', hmrEnabled: true, expectedCollections: 2 },
	])(
		'collects the page browser graph $expectedCollections time(s) across repeated route preparation when HMR is $hmr',
		async ({ hmrEnabled, expectedCollections }) => {
			const { flow, processDependencies } = createOrchestrator({
				hmrEnabled,
				processDependencies: async () => [createScriptAsset('/assets/page.js')],
			});
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
			const adapter = createFlowAdapter({ collectPageBrowserGraphContribution });
			const route = createRouteOptions('/app/pages/index.tsx');

			await flow.prepareRenderOptions(route, adapter);
			await flow.prepareRenderOptions(route, adapter);

			expect(collectPageBrowserGraphContribution).toHaveBeenCalledTimes(expectedCollections);
			expect(processDependencies).toHaveBeenCalledOnce();
		},
	);

	it('threads the structured page browser graph through the returned page package', async () => {
		const entryAsset = createScriptAsset('/assets/page.js', { packageRole: 'page-script' });
		const chunkAsset = createScriptAsset('/assets/page.chunk.js', {
			position: 'body',
			packageRole: 'dynamic-chunk',
		});
		const { flow } = createOrchestrator({ hmrEnabled: false, processDependencies: async () => [entryAsset] });

		const result = await flow.prepareRenderOptions(
			createRouteOptions('/app/pages/index.tsx'),
			createFlowAdapter({
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

	describe('grouped page-browser assets', () => {
		it('resolves them per route without a production build plan', async () => {
			const { prepare, processDependencies, collectPageBrowserGraphContribution } = createGroupedHarness({
				bundleFor: reactRouterBundleFor,
			});

			const firstResult = await prepare('/app/pages/index.tsx');
			const secondResult = await prepare('/app/pages/dashboard.tsx');

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

		it('keeps them scoped by bundle id when routes reuse the same entry name', async () => {
			vi.spyOn(fileSystem, 'glob').mockResolvedValue(['marketing.tsx', 'docs.tsx']);
			const { prepare } = createGroupedHarness({
				bundleFor: (file) => ({
					id: file.includes('marketing') ? 'marketing-layout' : 'docs-layout',
					entryName: 'index',
				}),
				srcUrl: (bundle) => `/assets/${bundle.id}-${bundle.entryName}.js`,
			});

			const marketingResult = await prepare('/app/pages/marketing.tsx');
			const docsResult = await prepare('/app/pages/docs.tsx');

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

		it('rebuilds them when the contribution fingerprint changes under HMR', async () => {
			vi.spyOn(fileSystem, 'glob').mockResolvedValue(['index.tsx', 'dashboard.tsx']);
			let groupedVersion = 1;
			const { prepare, processDependencies } = createGroupedHarness({
				hmrEnabled: true,
				bundleFor: reactRouterBundleFor,
				contentFor: (file) => `console.log("${file}-v${groupedVersion}")`,
				srcUrl: (bundle) => `/assets/${bundle.entryName}-v${groupedVersion}.js`,
			});

			const firstResult = await prepare('/app/pages/index.tsx');
			groupedVersion = 2;
			const secondResult = await prepare('/app/pages/index.tsx');

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
			const { prepare, processDependencies, collectPageBrowserGraphContribution } = createGroupedHarness({
				hmrEnabled: true,
				bundleFor: reactRouterBundleFor,
			});

			await prepare('/app/pages/index.tsx');

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
	});

	it('should guard page locals for static pages', async () => {
		const { flow } = createOrchestrator();

		const result = await flow.prepareRenderOptions(createRouteOptions('/app/pages/index.tsx'), createFlowAdapter());

		expect(result.locals).toBeUndefined();
		expect(() => Reflect.get(result.pageLocals as object, 'guarded')).toThrow(LocalsAccessError);
	});

	it('skips undefined component entries while collecting integration dependencies and triggers', async () => {
		const integrationDependency = createScriptAsset('/assets/react-runtime.js');
		const { flow } = createOrchestrator({ integrations: [createReactIntegration([integrationDependency])] });
		const Nested = createComponent({
			integration: 'react',
			identity: { id: 'nested', file: '/app/components/nested.tsx', integration: 'react' },
		});
		const Page = createPage({ dependencies: { components: [undefined, Nested] as unknown as EcoComponent[] } });

		const result = await flow.prepareRenderOptions(
			createRouteOptions('/app/pages/404.tsx'),
			createFlowAdapter({ Page }),
		);

		expect(result.pagePackage).toEqual(expect.objectContaining({ assets: [integrationDependency] }));
	});

	describe('ownership validation', () => {
		it('uses an injected ownership validation service when provided', async () => {
			const validate = vi.fn(() => []);
			const { flow } = createOrchestrator({
				orchestratorOptions: {
					ownershipValidationService: { validate } as unknown as OwnershipValidationService,
				},
			});
			const Page = createPage();
			const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;

			await flow.prepareRenderOptions(
				createRouteOptions('/app/pages/index.tsx'),
				createFlowAdapter({ Page, HtmlTemplate }),
			);

			expect(validate).toHaveBeenCalledWith({
				currentIntegrationName: 'string',
				roots: [
					{ component: HtmlTemplate, source: 'html-template' },
					{ component: Page, source: 'page' },
				],
			});
		});

		it('throws when injected ownership validation reports errors', async () => {
			const message =
				'[ecopages] Foreign child "missing-foreign-component" references unknown integration owner "missing-renderer".';
			const validate = vi.fn(() => [
				{
					code: 'UNKNOWN_INTEGRATION_OWNER',
					message,
					componentId: 'missing-foreign-component',
					integrationName: 'missing-renderer',
				},
			]);
			const { flow } = createOrchestrator({
				orchestratorOptions: {
					ownershipValidationService: { validate } as unknown as OwnershipValidationService,
				},
			});

			await expect(
				flow.prepareRenderOptions(createRouteOptions('/app/pages/index.tsx'), createFlowAdapter()),
			).rejects.toThrow(message);
		});

		it('prepares render options when declared foreign dependencies are valid', async () => {
			const { flow } = createOrchestrator({
				integrations: [{ name: 'foreign-renderer', initializeRenderer: vi.fn() }],
			});
			const ForeignComponent = createComponent({
				integration: 'foreign-renderer',
				identity: {
					id: 'foreign-component',
					file: '/app/components/foreign-component.tsx',
					integration: 'foreign-renderer',
				},
			});
			const Layout = createComponent({
				identity: { id: 'layout-component', file: '/app/layouts/default.tsx', integration: 'string' },
				dependencies: { components: [ForeignComponent] },
			});
			const Page = createPage({
				layouts: [Layout],
				identity: { id: 'page-component', file: '/app/pages/index.tsx', integration: 'string' },
			});
			const HtmlTemplate = Object.assign(() => '<html></html>', {
				config: { identity: { id: 'html-template', file: '/app/index.ts', integration: 'string' } },
			}) as unknown as EcoComponent<HtmlTemplateProps>;

			const result = await flow.prepareRenderOptions(
				createRouteOptions('/app/pages/index.tsx'),
				createFlowAdapter({ Page, HtmlTemplate }),
			);

			expect(result).toEqual(expect.objectContaining({ Page, Layout, HtmlTemplate }));
		});
	});

	it('resolves dependencies for every layout tier in the stack', async () => {
		const { flow } = createOrchestrator({ integrations: [createReactIntegration()] });
		const OuterLayout = createComponent({
			integration: 'react',
			identity: { id: 'outer', file: '/app/layouts/outer.tsx', integration: 'react' },
		});
		const InnerLayout = createComponent({
			integration: 'react',
			identity: { id: 'inner', file: '/app/layouts/inner.tsx', integration: 'react' },
		});
		const Page = createPage({
			layouts: [OuterLayout, InnerLayout],
			layoutEntries: [{ component: OuterLayout }, { component: InnerLayout }],
		});
		const HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const resolvedComponents: EcoComponent[] = [];

		await flow.prepareRenderOptions(
			createRouteOptions('/app/pages/index.tsx'),
			createFlowAdapter({
				name: 'react',
				Page,
				HtmlTemplate,
				resolveDependencies: async (components) => {
					resolvedComponents.push(...(components as EcoComponent[]));
					return [];
				},
			}),
		);

		expect(resolvedComponents).toEqual([HtmlTemplate, OuterLayout, InnerLayout, Page]);
	});
});
