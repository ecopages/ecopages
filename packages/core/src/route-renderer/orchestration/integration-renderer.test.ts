import { afterEach, describe, it, expect, vi } from 'vitest';
import { getComponentIdentity } from '../../eco/component-identity.ts';
import { setResolvedLazyTriggers } from '../../eco/component-internal-state.ts';
import { eco } from '../../eco/eco.ts';
import { OwnershipValidationService } from './ownership-graph/ownership-validation.service.ts';
import { getComponentRenderContext, runWithComponentRenderContext } from '../../eco/component-render-context.ts';
import type { RouteRenderContextState } from './foreign-child/render-session.ts';
import {
	createIntegrationRenderer,
	IntegrationRenderer,
	type IntegrationRendererHookFactoryOptions,
} from './integration-renderer.ts';
import { collectPageClientPlan } from './ownership-graph/page-client-plan.ts';
import type { PreparedComponentGraphNode } from './ownership-graph/component-graph.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import type {
	AssetDefinition,
	AssetProcessingService,
	ProcessedAsset,
} from '../../assets/asset-processing-service/index.ts';
import type {
	ComponentRenderInput,
	EcoPagesElement,
	EcoPageFile,
	GetMetadata,
	GetStaticProps,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
	EcoComponent,
	EcoComponentDependencies,
	HtmlTemplateProps,
	PageBrowserGraphContribution,
	PageBrowserGraphContributionContext,
	IHmrManager,
} from '../../types/contracts.ts';
import type { EcoPageComponent } from '../../types/eco-api-types.ts';
import {
	TestIntegrationRenderer,
	createMockAppConfig,
	createMockIntegrationPlugin,
	testAppConfig,
	testAssetService,
} from './integration-renderer.test-fixtures.ts';

describe('IntegrationRenderer', () => {
	it('keeps route params and query authoritative over extra page props', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
		});
		const Page = ((props: Record<string, unknown>) => {
			const params = props.params as Record<string, string>;
			const query = props.query as Record<string, string>;
			return `<main>${params.slug}:${query.sort}:${String(props.title)}</main>`;
		}) as EcoComponent<Record<string, unknown>>;
		const HtmlTemplate = ((props: HtmlTemplateProps) =>
			`<html><body>${String(props.children ?? '')}</body></html>`) as EcoComponent<HtmlTemplateProps>;

		const html = await IntegrationRenderer.prototype.render.call(renderer, {
			file: '/app/pages/posts/[slug].tsx',
			params: { slug: 'current' },
			query: { sort: 'recent' },
			props: { params: { slug: 'stale' }, query: { sort: 'stale' }, title: 'from static props' },
			metadata: { title: 'Posts', description: 'Post details' },
			HtmlTemplate,
			Page,
			resolvedDependencies: [],
		} as IntegrationRendererRenderOptions);

		expect(String(html)).toContain('<main>current:recent:from static props</main>');
	});

	it('creates a renderer from hooks without a renderer subclass', async () => {
		const renderComponent = vi.fn(async () => ({
			html: '<main>hook-rendered</main>',
			canAttachAttributes: false,
			integrationName: 'hooked',
		}));
		const HookRenderer = createIntegrationRenderer('hooked', { renderComponent });
		const renderer = new HookRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
		});
		const component = (() => '') as EcoComponent;

		expect(
			await renderer.renderComponent({
				component,
				props: {},
			}),
		).toEqual({
			html: '<main>hook-rendered</main>',
			canAttachAttributes: false,
			integrationName: 'hooked',
		});
		expect(renderComponent).toHaveBeenCalledOnce();
	});

	it('finalizes island attributes around hook-rendered components', async () => {
		const HookRenderer = createIntegrationRenderer('hooked', {
			renderComponent: async () => ({
				html: '<button>hook-rendered</button>',
				canAttachAttributes: true,
				integrationName: 'hooked',
			}),
		});
		const renderer = new HookRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
		});
		const component = (() => '') as EcoComponent;
		component.config = {
			identity: { id: 'hook-rendered', file: '/app/components/hook-rendered.tsx', integration: 'hooked' },
			dependencies: { scripts: ['./hook-rendered.js'] },
		};

		const result = await renderer.renderComponent({
			component,
			props: {},
			integrationContext: { componentInstanceId: 'hook-rendered:1' },
		});

		expect(result.rootAttributes).toEqual(
			expect.objectContaining({
				'data-eco-island': '',
				'data-eco-island-integration': 'hooked',
				'data-eco-component-id': 'hook-rendered:1',
			}),
		);
	});

	it('creates renderer hooks from each app-owned renderer configuration', async () => {
		const hookFactory = vi.fn((options) => ({
			renderComponent: async () => ({
				html: `<main>${options.appConfig.rootDir}</main>`,
				canAttachAttributes: false,
				integrationName: 'hooked',
			}),
		}));
		const HookRenderer = createIntegrationRenderer('hooked', hookFactory);
		const assetProcessingIntegration = { name: 'hooked' };
		const createRenderer = (rootDir: string) =>
			new HookRenderer({
				appConfig: { ...testAppConfig, rootDir } as EcoPagesAppConfig,
				assetProcessingService: testAssetService,
				assetProcessingIntegration,
			});
		const firstRenderer = createRenderer('/app/first');
		const secondRenderer = createRenderer('/app/second');
		const component = (() => '') as EcoComponent;
		const processDependencies = vi.spyOn(testAssetService, 'processDependencies');
		processDependencies.mockClear();

		const firstResult = await firstRenderer.renderComponent({ component, props: {} });
		const firstRenderAgain = await firstRenderer.renderComponent({ component, props: {} });
		const secondResult = await secondRenderer.renderComponent({ component, props: {} });
		const secondRenderAgain = await secondRenderer.renderComponent({ component, props: {} });
		const hookFactoryOptions = hookFactory.mock.calls[0][0];
		const resolveDependencies = hookFactoryOptions.resolveDependencies;

		expect(await resolveDependencies([])).toEqual([]);
		expect(typeof hookFactoryOptions.resolveComponentDependencies).toBe('function');
		expect(hookFactoryOptions.resolveDependencyPath('/app/pages', './style.css')).toBe('/app/pages/style.css');
		expect(processDependencies).toHaveBeenCalledOnce();
		expect(processDependencies).toHaveBeenCalledWith([], assetProcessingIntegration);

		expect(firstResult.html).toBe('<main>/app/first</main>');
		expect(firstRenderAgain.html).toBe('<main>/app/first</main>');
		expect(secondResult.html).toBe('<main>/app/second</main>');
		expect(secondRenderAgain.html).toBe('<main>/app/second</main>');
		expect(hookFactory).toHaveBeenCalledTimes(2);
	});

	it('merges a renderer-options hook factory over generated renderer hooks', async () => {
		const defaultRenderComponent = vi.fn(async () => ({
			html: '<main>default</main>',
			canAttachAttributes: false,
			integrationName: 'hooked',
		}));
		const configuredRenderComponent = vi.fn(async () => ({
			html: '<main>configured</main>',
			canAttachAttributes: false,
			integrationName: 'hooked',
		}));
		const optionsFactory = vi.fn((_options: IntegrationRendererHookFactoryOptions) => ({
			renderComponent: configuredRenderComponent,
		}));
		const HookRenderer = createIntegrationRenderer('hooked', { renderComponent: defaultRenderComponent });
		const renderer = new HookRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
			hooks: optionsFactory,
		});
		const component = (() => '') as EcoComponent;

		expect(
			await renderer.renderComponent({
				component,
				props: {},
			}),
		).toMatchObject({ html: '<main>configured</main>' });
		expect(optionsFactory).toHaveBeenCalledOnce();
		expect(optionsFactory.mock.calls[0]?.[0].hooks?.renderComponent).toBe(defaultRenderComponent);
		expect(optionsFactory.mock.calls[0]?.[0].resolveDependencies).toEqual(expect.any(Function));
		expect(defaultRenderComponent).not.toHaveBeenCalled();
		expect(configuredRenderComponent).toHaveBeenCalledOnce();
	});

	it('resolves queued children through the optional Integration hook', async () => {
		const foreignChildValue = { $$typeof: Symbol.for('react.element') };
		const renderComponent = vi.fn(async (input: ComponentRenderInput) => ({
			html: String(await (input.component as (props: Record<string, unknown>) => unknown)(input.props)),
			canAttachAttributes: true,
			integrationName: 'hooked',
		}));
		const renderQueuedChildren = vi.fn(async () => ({ html: '<strong>queued child</strong>' }));
		const foreignRender = vi.fn(async (input: ComponentRenderInput) => ({
			html: `<aside>${String(input.children ?? '')}</aside>`,
			canAttachAttributes: true,
			integrationName: 'foreign',
		}));
		const foreignRenderer = {
			name: 'foreign',
			renderComponentWithForeignChildren: foreignRender,
		};
		const HookRenderer = createIntegrationRenderer('hooked', { renderComponent, renderQueuedChildren });
		const renderer = new HookRenderer({
			appConfig: createMockAppConfig({
				integrations: [
					createMockIntegrationPlugin({
						name: 'foreign',
						getRenderer: () => foreignRenderer,
					}),
				],
			}),
			assetProcessingService: testAssetService,
		});
		const Foreign = eco.component({
			integration: 'foreign',
			render: (_props: { children?: unknown }) => '<aside>foreign</aside>',
		});
		const Host = eco.component({
			integration: 'hooked',
			dependencies: { components: [Foreign] },
			render: () => `<section>${String(Foreign({ children: foreignChildValue }))}</section>`,
		});

		const result = await renderer.renderComponentWithForeignChildren({ component: Host, props: {} });

		expect(renderQueuedChildren).toHaveBeenCalledWith(
			foreignChildValue,
			expect.any(Object),
			expect.any(Map),
			expect.any(Function),
		);
		expect(renderComponent).toHaveBeenCalledOnce();
		expect(foreignRender).toHaveBeenCalledWith(
			expect.objectContaining({ children: '<strong>queued child</strong>' }),
		);
		expect(result.html).toBe('<section><aside><strong>queued child</strong></aside></section>');
	});

	it('reuses production prebuild page data and prepares render options on demand', async () => {
		const validateGraph = vi.spyOn(OwnershipValidationService.prototype, 'validateGraph');
		const staticProps = vi.fn(async ({ pathname }: { pathname: { params: Record<string, string> } }) => ({
			props: { slug: pathname.params.slug },
		}));
		const metadata = vi.fn(async ({ props }: { props: Record<string, unknown> }) => ({
			title: String(props.slug),
			description: 'Page description',
		}));
		const Page = Object.assign((() => 'page') as EcoPageComponent<Record<string, unknown>>, {
			staticProps,
			metadata,
		});
		const pageDependency = (() => 'dependency') as EcoComponent;
		pageDependency.config = {
			identity: { id: 'dependency', file: '/app/components/dependency.tsx', integration: 'test-renderer' },
			dependencies: {},
		};
		const resolveDependencies = vi.fn(async () => ({ components: [pageDependency] }));
		Page.resolveDependencies = resolveDependencies;
		let preparedContributionHookCalls = 0;
		let preparedDependencyCalls = 0;
		const renderer = new (class extends TestIntegrationRenderer {
			protected override async resolvePageBrowserGraphContributionFromComponents(
				components: ReadonlyArray<EcoComponent | Partial<EcoComponent>>,
				ownerFile: string,
				preparedNodes?: ReadonlyArray<PreparedComponentGraphNode>,
			) {
				preparedContributionHookCalls += 1;
				return super.resolvePageBrowserGraphContributionFromComponents(components, ownerFile, preparedNodes);
			}

			protected override async processComponentDependencies(
				components: (EcoComponent | Partial<EcoComponent>)[],
				options?: { preparedGraph?: true },
			) {
				if (options?.preparedGraph) {
					preparedDependencyCalls += 1;
				}
				return super.processComponentDependencies(components, options);
			}
		})({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
		});
		const routeFile = '/app/pages/[slug].tsx';
		const params = { slug: 'captured' };
		renderer.PageModule = { default: Page };
		renderer.HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;

		const groupedBuildPlan = await renderer.buildGroupedGraphBuildPlan([{ routeFile, params }]);
		await renderer.prebuildProductionPageBrowserGraph(routeFile, { params, groupedBuildPlan });
		const result = await renderer.execute({ file: routeFile, params });

		expect(staticProps).toHaveBeenCalledTimes(1);
		expect(metadata).toHaveBeenCalledTimes(1);
		expect(resolveDependencies).toHaveBeenCalledTimes(1);
		expect(preparedContributionHookCalls).toBe(1);
		expect(preparedDependencyCalls).toBe(1);
		expect(validateGraph).toHaveBeenCalledTimes(2);
		expect(result.metadata?.title).toBe('captured');
		validateGraph.mockRestore();
	});

	it('continues grouped production prebuild after a route data hook fails', async () => {
		const routeFile = '/app/pages/[slug].tsx';
		const failure = new Error('broken static props');
		const staticProps: GetStaticProps<{ slug: string }> = async ({ pathname }) => {
			const slug = String(pathname.params.slug);
			if (slug === 'broken') throw failure;
			return { props: { slug } };
		};
		const Page = (({ slug }: { slug: string }) => `<p>${slug}</p>`) as EcoPageComponent<{ slug: string }>;
		Page.staticProps = staticProps;
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
		});
		renderer.PageModule = { default: Page };
		renderer.HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const onRouteFailure = vi.fn();

		const groupedBuildPlan = await renderer.buildGroupedGraphBuildPlan(
			[
				{ routeFile, params: { slug: 'broken' } },
				{ routeFile, params: { slug: 'healthy' } },
			],
			{ onRouteFailure },
		);

		expect(onRouteFailure).toHaveBeenCalledOnce();
		expect(onRouteFailure.mock.calls[0]?.[0]).toEqual({ routeFile, params: { slug: 'broken' } });
		expect(onRouteFailure.mock.calls[0]?.[1]).toMatchObject({
			message: 'Error fetching static props: broken static props',
			cause: failure,
		});
		expect(groupedBuildPlan.instances).toHaveLength(1);
		expect(groupedBuildPlan.instances[0]?.routeFile).toBe(routeFile);
		expect(groupedBuildPlan.instances[0]?.dependencyInstanceKey).toContain('healthy');
	});

	it('resolves lazy triggers from the prebuilt app browser client assets', async () => {
		const lazyComponent = (() => '<button>lazy</button>') as EcoComponent;
		lazyComponent.config = {
			identity: { id: 'lazy-component', file: '/app/components/lazy.tsx', integration: 'lit' },
			dependencies: { scripts: [{ src: './lazy.client.ts', lazy: { 'on:idle': true } }] },
		};
		const Page = (() => 'page') as EcoPageComponent<Record<string, unknown>>;
		Page.resolveDependencies = async () => ({ components: [lazyComponent] });
		const routeFile = '/app/pages/lazy.tsx';
		const appConfig = {
			...testAppConfig,
			integrations: [createMockIntegrationPlugin({ name: 'lit', getRenderer: () => ({}) })],
		} as EcoPagesAppConfig;
		const renderer = new (class extends TestIntegrationRenderer {
			readonly resolvedGroupedPlans: unknown[] = [];

			constructor(options: ConstructorParameters<typeof TestIntegrationRenderer>[0]) {
				super(options);
				const resolve = this.routeRenderOrchestrator.resolveDeclaredPageBrowserGraph.bind(
					this.routeRenderOrchestrator,
				);
				vi.spyOn(this.routeRenderOrchestrator, 'resolveDeclaredPageBrowserGraph').mockImplementation(
					async (input) => {
						this.resolvedGroupedPlans.push(input.groupedBuildPlan);
						return resolve(input);
					},
				);
			}

			async resolveGraphForRoute(routeFile: string) {
				return this.resolvePageBrowserGraphForRoute(routeFile);
			}
		})({
			appConfig,
			assetProcessingService: testAssetService,
		});
		renderer.PageModule = { default: Page };
		renderer.HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const groupedBuildPlan = await renderer.buildGroupedGraphBuildPlan([{ routeFile }]);
		const instance = groupedBuildPlan.instances[0];
		const lazyEntry = instance?.pageClientBuildEntries?.find(
			({ dependency }) => dependency.kind === 'script' && Boolean(dependency.attributes?.['data-eco-lazy-key']),
		);
		expect(lazyEntry).toBeDefined();
		expect(lazyEntry?.integrationName).toBe('test-renderer');
		const lazyDependency = lazyEntry?.dependency;
		if (lazyDependency?.kind !== 'script') throw new Error('Expected a planned lazy script entry');
		if (!instance) throw new Error('Expected a production route instance');
		instance.prebuiltPageClientBrowserAssets = {
			processedAssets: [
				{
					kind: 'script',
					srcUrl: '/assets/lazy-entry-hash.js',
					attributes: lazyDependency.attributes,
				} as ProcessedAsset,
			],
			fallbackDependencies: [],
		};
		await renderer.prebuildProductionPageBrowserGraph(routeFile, { groupedBuildPlan });

		const pageClientPlan = collectPageClientPlan([{ component: lazyComponent }], 'test-renderer');
		const result = await renderer.buildPageClientBrowserAssets(pageClientPlan, { file: routeFile });

		expect(result.lazyTriggers).toHaveLength(1);
		expect(result.lazyTriggers[0]?.rules).toEqual([{ 'on:idle': { scripts: ['/assets/lazy-entry-hash.js'] } }]);

		renderer.clearPrebuiltRoutePreparation({ file: routeFile });
		const afterClear = await renderer.buildPageClientBrowserAssets(pageClientPlan, { file: routeFile });
		await renderer.resolveGraphForRoute(routeFile);

		expect(afterClear.processedAssets).not.toContainEqual(
			expect.objectContaining({ srcUrl: '/assets/lazy-entry-hash.js' }),
		);
		expect(renderer.resolvedGroupedPlans).toEqual([groupedBuildPlan, undefined]);
	});

	it('keeps prebuilt page client assets for every render of an exact route', async () => {
		const lazyComponent = (() => '<button>lazy</button>') as EcoComponent;
		lazyComponent.config = {
			identity: { id: 'repeat-lazy-component', file: '/app/components/repeat-lazy.tsx', integration: 'lit' },
		};
		const dependency: AssetDefinition = {
			kind: 'script',
			source: 'content',
			content: 'window.repeatLazy = true;',
			name: 'repeat-lazy',
		};
		const Page = (() => 'page') as EcoPageComponent<Record<string, unknown>>;
		Page.resolveDependencies = async () => ({ components: [lazyComponent] });
		const routeFile = '/app/pages/repeat.tsx';
		const renderedPageEntryAssets: ProcessedAsset[][] = [];
		const renderer = new (class extends TestIntegrationRenderer {
			override async render(options: IntegrationRendererRenderOptions<EcoPagesElement>) {
				renderedPageEntryAssets.push(options.pagePackage?.assets ?? []);
				return await super.render(options);
			}
		})({
			appConfig: {
				...testAppConfig,
				integrations: [createMockIntegrationPlugin({ name: 'lit', getRenderer: () => ({}) })],
			} as EcoPagesAppConfig,
			assetProcessingService: testAssetService,
			hooks: {
				collectAppBrowserClientBuildEntries: async (plan) =>
					plan.sourceComponents.includes(lazyComponent) ? [{ dependency }] : [],
			},
		});
		renderer.PageModule = { default: Page };
		renderer.HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const groupedBuildPlan = await renderer.buildGroupedGraphBuildPlan([{ routeFile }]);
		const instance = groupedBuildPlan.instances[0];
		if (!instance) throw new Error('Expected a production route instance');
		instance.prebuiltPageClientBrowserAssets = {
			processedAssets: [{ kind: 'script', srcUrl: '/assets/repeat-entry-hash.js' } as ProcessedAsset],
			fallbackDependencies: [],
		};
		await renderer.prebuildProductionPageBrowserGraph(routeFile, { groupedBuildPlan });

		await renderer.execute({ file: routeFile });
		await renderer.execute({ file: routeFile });

		expect(renderedPageEntryAssets).toHaveLength(2);
		for (const assets of renderedPageEntryAssets) {
			expect(assets).toContainEqual(expect.objectContaining({ srcUrl: '/assets/repeat-entry-hash.js' }));
		}
	});

	it('reuses dynamic route template client assets when the page client entries match', async () => {
		const renderedPageEntryAssets: ProcessedAsset[][] = [];
		const lazyComponent = (() => '<button>lazy</button>') as EcoComponent;
		lazyComponent.config = {
			identity: { id: 'lazy-template-component', file: '/app/components/lazy-template.tsx', integration: 'lit' },
		};
		const otherComponent = (() => '<button>other</button>') as EcoComponent;
		otherComponent.config = {
			identity: {
				id: 'other-template-component',
				file: '/app/components/other-template.tsx',
				integration: 'lit',
			},
		};
		const dependency: AssetDefinition = {
			kind: 'script',
			source: 'content',
			content: 'window.lazyTemplate = true;',
			name: 'lazy-template',
		};
		const Page = (() => 'page') as EcoPageComponent<Record<string, unknown>>;
		Page.resolveDependencies = async () => ({ components: [lazyComponent] });
		const routeFile = '/app/pages/products/[slug].tsx';
		const appConfig = {
			...testAppConfig,
			integrations: [createMockIntegrationPlugin({ name: 'lit', getRenderer: () => ({}) })],
		} as EcoPagesAppConfig;
		const renderer = new (class extends TestIntegrationRenderer {
			override async render(options: IntegrationRendererRenderOptions<EcoPagesElement>) {
				renderedPageEntryAssets.push(options.pagePackage?.assets ?? []);
				return await super.render(options);
			}
		})({
			appConfig,
			assetProcessingService: testAssetService,
			hooks: {
				collectAppBrowserClientBuildEntries: async (plan) =>
					plan.sourceComponents.includes(lazyComponent) ? [{ dependency }] : [],
			},
		});
		renderer.PageModule = { default: Page };
		renderer.HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;
		const groupedBuildPlan = await renderer.buildGroupedGraphBuildPlan([
			{ routeFile, skipStaticProps: true, isRouteTemplate: true },
		]);
		const instance = groupedBuildPlan.instances[0];
		if (!instance) throw new Error('Expected a dynamic route template plan');
		instance.prebuiltPageClientBrowserAssets = {
			processedAssets: [{ kind: 'script', srcUrl: '/assets/template-client.js' } as ProcessedAsset],
			fallbackDependencies: [],
		};
		await renderer.prebuildProductionPageBrowserGraph(routeFile, {
			skipStaticProps: true,
			isRouteTemplate: true,
			groupedBuildPlan,
		});
		await renderer.execute({ file: routeFile, params: { slug: 'new-product' } });

		const matchingPlan = collectPageClientPlan([{ component: lazyComponent }], 'test-renderer');
		const reusedAssets = await renderer.buildPageClientBrowserAssets(matchingPlan, {
			file: routeFile,
			params: { slug: 'new-product' },
		});
		const changedPlan = collectPageClientPlan([{ component: otherComponent }], 'test-renderer');
		const fallbackAssets = await renderer.buildPageClientBrowserAssets(changedPlan, {
			file: routeFile,
			params: { slug: 'new-product' },
		});

		expect(reusedAssets.processedAssets).toContainEqual(
			expect.objectContaining({ srcUrl: '/assets/template-client.js' }),
		);
		expect(renderedPageEntryAssets.at(-1)).toContainEqual(
			expect.objectContaining({ srcUrl: '/assets/template-client.js' }),
		);
		expect(fallbackAssets.processedAssets).not.toContainEqual(
			expect.objectContaining({ srcUrl: '/assets/template-client.js' }),
		);
	});

	it('keeps metadata active for route plans that only skip static props', async () => {
		const routeFile = '/app/pages/products/[slug].tsx';
		const metadata = vi.fn(async ({ params }: Parameters<GetMetadata>[0]) => ({
			title: String(params.slug),
			description: 'Route metadata',
		}));
		const Page = (() => 'page') as EcoPageComponent<Record<string, unknown>>;
		Page.metadata = metadata;
		Page.config = {
			integration: 'lit',
			identity: { id: 'route-plan-metadata', file: routeFile, integration: 'lit' },
		};
		const renderer = new TestIntegrationRenderer({
			appConfig: {
				...testAppConfig,
				integrations: [createMockIntegrationPlugin({ name: 'lit', getRenderer: () => ({}) })],
			} as EcoPagesAppConfig,
			assetProcessingService: testAssetService,
		});
		renderer.PageModule = { default: Page };
		renderer.HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;

		await renderer.buildGroupedGraphBuildPlan([
			{ routeFile, params: { slug: 'existing-product' }, skipStaticProps: true },
		]);

		expect(metadata).toHaveBeenCalledWith(expect.objectContaining({ params: { slug: 'existing-product' } }));
	});

	it('does not reuse prebuilt page dependencies when render props override the route', async () => {
		const defaultDependency = (() => 'default') as EcoComponent;
		defaultDependency.config = {
			identity: { id: 'default', file: '/app/components/default.tsx', integration: 'test-renderer' },
			dependencies: {},
		};
		const overrideDependency = (() => 'override') as EcoComponent;
		overrideDependency.config = {
			identity: { id: 'override', file: '/app/components/override.tsx', integration: 'test-renderer' },
			dependencies: {},
		};
		const resolveDependencies = vi.fn(async ({ props }: { props: Record<string, unknown> }) => ({
			components: [props.variant === 'override' ? overrideDependency : defaultDependency],
		}));
		const defaultAsset = {
			kind: 'script',
			srcUrl: '/assets/default-dependency.js',
			position: 'head',
			packageRole: 'page-script',
		} as ProcessedAsset;
		const overrideAsset = {
			kind: 'script',
			srcUrl: '/assets/override-dependency.js',
			position: 'head',
			packageRole: 'page-script',
		} as ProcessedAsset;
		const Page = (() => 'page') as EcoPageComponent<Record<string, unknown>>;
		Page.resolveDependencies = resolveDependencies;
		const pageDependencyContributions: string[][] = [];
		const renderedPageEntryAssets: ProcessedAsset[][] = [];
		const renderer = new (class extends TestIntegrationRenderer {
			override async render(options: IntegrationRendererRenderOptions<EcoPagesElement>) {
				renderedPageEntryAssets.push(options.pagePackage?.pageBrowserGraph?.entryAssets ?? []);
				return await super.render(options);
			}

			protected override async resolvePageBrowserGraphContributionFromComponents(
				components: ReadonlyArray<EcoComponent | Partial<EcoComponent>>,
				_ownerFile: string,
				_preparedNodes?: ReadonlyArray<PreparedComponentGraphNode>,
			) {
				pageDependencyContributions.push(
					components.flatMap((component) => {
						const id = getComponentIdentity(component)?.id;
						return id ? [id] : [];
					}),
				);
				const ids = components.flatMap((component) => {
					const id = getComponentIdentity(component)?.id;
					return id ? [id] : [];
				});
				return {
					assets: ids.map((id) => (id === 'override' ? overrideAsset : defaultAsset)),
				};
			}
		})({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
		});
		const routeFile = '/app/pages/override-dependencies.tsx';
		renderer.PageModule = { default: Page };
		renderer.HtmlTemplate = (() => '<html></html>') as EcoComponent<HtmlTemplateProps>;

		const groupedBuildPlan = await renderer.buildGroupedGraphBuildPlan([{ routeFile }]);
		await renderer.prebuildProductionPageBrowserGraph(routeFile, { groupedBuildPlan });
		await renderer.execute({ file: routeFile, params: {}, query: {} });
		expect(renderedPageEntryAssets.at(-1)).toEqual([defaultAsset]);
		await renderer.execute({ file: routeFile, params: {}, query: {}, props: { variant: 'override' } });

		expect(resolveDependencies).toHaveBeenCalledTimes(2);
		expect(resolveDependencies.mock.calls[1]?.[0].props).toEqual({ variant: 'override' });
		expect(pageDependencyContributions.at(-1)).toEqual(['override']);
		expect(renderedPageEntryAssets.at(-1)).toEqual([overrideAsset]);
	});

	it('keeps each concurrent page render on its own prepared page package', async () => {
		let active = 0;
		let maxActive = 0;
		let entered = 0;
		let releaseBoth: (() => void) | undefined;
		const gate = new Promise<void>((resolve) => {
			releaseBoth = resolve;
		});
		const Page = (() => 'page') as EcoComponent;
		Page.config = {};
		const HtmlTemplate = (() => 'html') as EcoComponent<HtmlTemplateProps>;

		const renderer = new (class extends TestIntegrationRenderer {
			override async collectPageBrowserGraphContribution(
				context: PageBrowserGraphContributionContext,
			): Promise<PageBrowserGraphContribution> {
				const pageAsset = context.file.endsWith('/a.tsx') ? 'page-a.js' : 'page-b.js';
				return { assets: [{ kind: 'script', position: 'head', srcUrl: `/assets/${pageAsset}` }] };
			}

			override async render() {
				active += 1;
				entered += 1;
				maxActive = Math.max(maxActive, active);
				await gate;
				active -= 1;
				return '<html><head></head><body>ok</body></html>';
			}
		})({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
		});
		renderer.PageModule = { default: Page };
		renderer.HtmlTemplate = HtmlTemplate;

		const both = Promise.all([
			renderer.execute({ file: '/app/pages/a.tsx', params: {}, query: {} }),
			renderer.execute({ file: '/app/pages/b.tsx', params: {}, query: {} }),
		]);
		await vi.waitUntil(() => entered === 2);

		expect(maxActive).toBe(2);
		releaseBoth?.();
		const [pageA, pageB] = await both;
		const [htmlA, htmlB] = await Promise.all([
			new Response(pageA.body as BodyInit).text(),
			new Response(pageB.body as BodyInit).text(),
		]);
		expect(htmlA).toContain('/assets/page-a.js');
		expect(htmlA).not.toContain('/assets/page-b.js');
		expect(htmlB).toContain('/assets/page-b.js');
		expect(htmlB).not.toContain('/assets/page-a.js');
	});

	it('uses a fresh foreign-renderer cache for each render execution', async () => {
		const firstRender = vi.fn(async () => ({
			html: '<button>first renderer</button>',
			canAttachAttributes: true,
			integrationName: 'foreign-renderer',
		}));
		const secondRender = vi.fn(async () => ({
			html: '<button>second renderer</button>',
			canAttachAttributes: true,
			integrationName: 'foreign-renderer',
		}));
		const firstRenderer = {
			name: 'foreign-renderer',
			renderComponentWithForeignChildren: firstRender,
		};
		const secondRenderer = {
			name: 'foreign-renderer',
			renderComponentWithForeignChildren: secondRender,
		};
		let activeForeignRenderer = firstRenderer;
		const getRenderer = vi.fn(() => activeForeignRenderer);
		const appConfig = createMockAppConfig({
			integrations: [createMockIntegrationPlugin({ name: 'foreign-renderer', getRenderer })],
		});
		const renderer = new TestIntegrationRenderer({
			appConfig,
			assetProcessingService: testAssetService,
		});
		const ForeignView = (() => '<button />') as EcoComponent<Record<string, unknown>>;
		ForeignView.config = {
			integration: 'foreign-renderer',
			identity: {
				id: 'foreign-view',
				file: '/app/components/foreign-view.tsx',
				integration: 'foreign-renderer',
			},
		};

		const firstResponse = await renderer.renderExplicitView(ForeignView, {}, { partial: true });
		activeForeignRenderer = secondRenderer;
		const secondResponse = await renderer.renderExplicitView(ForeignView, {}, { partial: true });

		expect(await firstResponse.text()).toBe('<button>first renderer</button>');
		expect(await secondResponse.text()).toBe('<button>second renderer</button>');
		expect(firstRender).toHaveBeenCalledOnce();
		expect(secondRender).toHaveBeenCalledOnce();
		expect(getRenderer).toHaveBeenCalledTimes(2);
	});

	it('bypasses processed dependency reuse for production renders with HMR enabled', async () => {
		const processDependencies = vi.fn(async () => [] as ProcessedAsset[]);
		const assetProcessingService = {
			processDependencies,
			setHmrManager: vi.fn(),
		} as unknown as AssetProcessingService;
		const Renderer = createIntegrationRenderer<EcoPagesElement>('hmr-cache-test');
		const renderer = new Renderer({
			appConfig: testAppConfig,
			assetProcessingService,
		});
		const component = (() => '<div />') as EcoComponent;
		component.config = {
			identity: { id: 'hmr-cache', file: '/app/components/hmr-cache.tsx', integration: 'hmr-cache-test' },
			dependencies: { scripts: ['./client.ts'] },
		};
		renderer.setHmrManager({ isEnabled: () => true } as IHmrManager);
		vi.stubEnv('NODE_ENV', 'production');

		try {
			await renderer.resolveRouteDependencies({ components: [component] });
			await renderer.resolveRouteDependencies({ components: [component] });

			expect(processDependencies).toHaveBeenCalledTimes(2);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it('finishes a partial explicit view while a route render is still in flight', async () => {
		let releaseRoute: (() => void) | undefined;
		const routeGate = new Promise<void>((resolve) => {
			releaseRoute = resolve;
		});
		let routeEntered = false;
		const Page = (() => 'page') as EcoComponent;
		Page.config = {};
		const HtmlTemplate = (() => 'html') as EcoComponent<HtmlTemplateProps>;
		const View = ((props: { content: string }) => `<div>${props.content}</div>`) as EcoComponent<{
			content: string;
		}>;

		const renderer = new (class extends TestIntegrationRenderer {
			override async render() {
				routeEntered = true;
				await routeGate;
				return '<html><body>ok</body></html>';
			}
		})({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
		});
		renderer.PageModule = { default: Page };
		renderer.HtmlTemplate = HtmlTemplate;

		const route = renderer.execute({ file: '/app/pages/a.tsx', params: {}, query: {} });
		await vi.waitUntil(() => routeEntered);

		const response = await renderer.renderExplicitView(View, { content: 'Partial' }, { partial: true });
		expect(await response.text()).toBe('<div>Partial</div>');

		releaseRoute?.();
		await route;
	});

	it('keeps each render plan when a nested foreign-child context opens', async () => {
		const Page = (() => 'page') as EcoComponent;
		Page.config = {
			identity: { id: 'page', file: '/app/pages/a.tsx', integration: 'test-renderer' },
		};
		const HtmlTemplate = (() => 'html') as EcoComponent<HtmlTemplateProps>;
		let nestedHasPage = false;

		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
		});
		renderer.PageModule = { default: Page };
		renderer.HtmlTemplate = HtmlTemplate;
		renderer.RenderBodyFactory = async () => {
			await runWithComponentRenderContext({ currentIntegration: 'lit' }, async () => {
				nestedHasPage =
					getComponentRenderContext<RouteRenderContextState>()?.renderState?.pageClientPlan?.sourceComponents.some(
						(component) => component === Page,
					) ?? false;
			});
			return '<html><body>ok</body></html>';
		};

		await renderer.execute({ file: '/app/pages/a.tsx', params: {}, query: {} });

		expect(nestedHasPage).toBe(true);
	});

	it('keeps a separate client plan for each finished route render and an explicit view', async () => {
		const seen = new Set<string>();
		const declare = (file: string) => {
			const component = (() => 'page') as EcoComponent<object>;
			component.config = {
				integration: 'test-renderer',
				identity: { id: file, file, integration: 'test-renderer' },
			};
			return component;
		};
		const pageA = declare('/app/pages/a.tsx');
		const pageB = declare('/app/pages/b.tsx');
		const explicitView = declare('/app/views/explicit.tsx');
		const HtmlTemplate = (() => 'html') as EcoComponent<HtmlTemplateProps>;
		HtmlTemplate.config = {
			integration: 'test-renderer',
			identity: { id: 'html', file: '/app/includes/html.ts', integration: 'test-renderer' },
		};

		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
		});
		renderer.HtmlTemplate = HtmlTemplate;
		renderer.RenderBodyFactory = async () => {
			const files = (
				getComponentRenderContext<RouteRenderContextState>()?.renderState?.pageClientPlan?.sourceComponents ??
				[]
			)
				.map((component) => getComponentIdentity(component)?.file)
				.filter((file): file is string => Boolean(file))
				.sort()
				.join(',');
			seen.add(files);
			return '<html><body>ok</body></html>';
		};

		await renderer.execute({ file: '/app/pages/a.tsx', pageModule: { default: pageA }, params: {}, query: {} });
		await renderer.execute({ file: '/app/pages/b.tsx', pageModule: { default: pageB }, params: {}, query: {} });
		await renderer.renderExplicitView(explicitView, {}, { file: '/app/views/explicit.tsx' });

		expect(seen).toEqual(
			new Set([
				'/app/includes/html.ts,/app/pages/a.tsx',
				'/app/includes/html.ts,/app/pages/b.tsx',
				'/app/includes/html.ts,/app/views/explicit.tsx',
			]),
		);
	});

	it('processes declarative page browser graph dependencies through shared route preparation', async () => {
		const processDependencies = vi.fn(async () => [{ kind: 'script', inline: false, srcUrl: '/page.js' }]);
		const assetProcessingIntegration = { name: 'declarative-renderer' };
		let renderOptions: IntegrationRendererRenderOptions<EcoPagesElement> | undefined;
		const renderer = new (class extends IntegrationRenderer<EcoPagesElement> {
			name = 'declarative-renderer';
			PageModule: EcoPageFile = { default: (() => 'Page') as EcoComponent };

			override async render(
				options: IntegrationRendererRenderOptions<EcoPagesElement>,
			): Promise<RouteRendererBody> {
				renderOptions = options;
				return '<html><body>Page</body></html>';
			}

			protected override async importPageFile(): Promise<EcoPageFile> {
				return this.PageModule;
			}

			protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
				return (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;
			}

			override async collectPageBrowserGraphContribution(): Promise<PageBrowserGraphContribution> {
				return {
					dependencies: [
						{
							kind: 'script',
							source: 'content',
							content: 'console.log("page");',
							name: 'page',
							attributes: { type: 'module' },
						},
					],
				};
			}
		})({
			appConfig: testAppConfig,
			assetProcessingService: { processDependencies } as unknown as AssetProcessingService,
			assetProcessingIntegration,
		});

		await renderer.execute({ file: '/app/pages/test.tsx', params: {}, query: {} });

		expect(renderOptions?.pagePackage).toEqual(
			expect.objectContaining({
				assets: expect.arrayContaining([{ kind: 'script', inline: false, srcUrl: '/page.js' }]),
				pageBrowserGraph: {
					entryAssets: [{ kind: 'script', inline: false, srcUrl: '/page.js' }],
					chunkAssets: [],
				},
			}),
		);
		expect(processDependencies).toHaveBeenCalledWith(
			[
				{
					kind: 'script',
					source: 'content',
					content: 'console.log("page");',
					name: 'page',
					attributes: { type: 'module' },
				},
			],
			assetProcessingIntegration,
		);
	});

	it('resolves resolveDependencies scripts through file-scoped dependency roots', async () => {
		const processDependencies = vi.fn(async () => [{ kind: 'script', inline: false, srcUrl: '/demo.js' }]);
		const assetProcessingIntegration = { name: 'declarative-renderer' };
		let renderOptions: IntegrationRendererRenderOptions<EcoPagesElement> | undefined;
		const Page = (() => 'Page') as EcoPageComponent<any>;
		Page.resolveDependencies = async () => ({
			scripts: ['./demo.client.ts'],
		});
		const renderer = new (class extends IntegrationRenderer<EcoPagesElement> {
			name = 'declarative-renderer';
			PageModule: EcoPageFile = { default: Page };

			override async render(
				options: IntegrationRendererRenderOptions<EcoPagesElement>,
			): Promise<RouteRendererBody> {
				renderOptions = options;
				return '<html><body>Page</body></html>';
			}

			protected override async importPageFile(): Promise<EcoPageFile> {
				return this.PageModule;
			}

			protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
				return (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;
			}
		})({
			appConfig: testAppConfig,
			assetProcessingService: { processDependencies } as unknown as AssetProcessingService,
			assetProcessingIntegration,
		});

		await renderer.execute({ file: '/app/pages/demo.tsx', params: {}, query: {} });

		expect(renderOptions?.pagePackage?.pageBrowserGraph?.entryAssets).toEqual([
			{ kind: 'script', inline: false, srcUrl: '/demo.js' },
		]);
		expect(processDependencies).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'script',
					source: 'file',
					filepath: '/app/pages/demo.client.ts',
				}),
			]),
			assetProcessingIntegration,
		);
	});

	it('resolves resolveDependencies ownerFile relative to the declaring file', async () => {
		const processDependencies = vi.fn(async () => [{ kind: 'script', inline: false, srcUrl: '/demo.js' }]);
		const assetProcessingIntegration = { name: 'declarative-renderer' };
		let renderOptions: IntegrationRendererRenderOptions<EcoPagesElement> | undefined;
		const Page = (() => 'Page') as EcoPageComponent<any>;
		Page.resolveDependencies = async () => ({
			scripts: ['./demo.client.ts'],
			ownerFile: '/app/content/docs/demo.mdx',
		});
		const renderer = new (class extends IntegrationRenderer<EcoPagesElement> {
			name = 'declarative-renderer';
			PageModule: EcoPageFile = { default: Page };

			override async render(
				options: IntegrationRendererRenderOptions<EcoPagesElement>,
			): Promise<RouteRendererBody> {
				renderOptions = options;
				return '<html><body>Page</body></html>';
			}

			protected override async importPageFile(): Promise<EcoPageFile> {
				return this.PageModule;
			}

			protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
				return (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;
			}
		})({
			appConfig: testAppConfig,
			assetProcessingService: { processDependencies } as unknown as AssetProcessingService,
			assetProcessingIntegration,
		});

		await renderer.execute({
			file: '/app/pages/docs/[...slug]/index.tsx',
			params: {},
			query: {},
		});

		expect(renderOptions?.pagePackage?.pageBrowserGraph?.entryAssets).toEqual([
			{ kind: 'script', inline: false, srcUrl: '/demo.js' },
		]);
		expect(processDependencies).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'script',
					source: 'file',
					filepath: '/app/content/docs/demo.client.ts',
				}),
			]),
			assetProcessingIntegration,
		);
	});

	it('resolves resolveDependencies modules through file-scoped dependency roots', async () => {
		const assetProcessingIntegration = { name: 'declarative-renderer' };
		const processDependencies = vi.fn(async (dependencies: Array<{ content?: string; name?: string }>) =>
			dependencies.map((dependency) => ({
				kind: 'script' as const,
				inline: true,
				content: dependency.content ?? dependency.name ?? 'module',
			})),
		);
		const appConfig = createMockAppConfig();
		let renderOptions: IntegrationRendererRenderOptions<EcoPagesElement> | undefined;
		const Page = (() => 'Page') as EcoPageComponent<any>;
		Page.resolveDependencies = async () => ({
			modules: ['react-aria-components{Table}'],
		});
		const renderer = new (class extends IntegrationRenderer<EcoPagesElement> {
			name = 'declarative-renderer';
			PageModule: EcoPageFile = { default: Page };

			override async render(
				options: IntegrationRendererRenderOptions<EcoPagesElement>,
			): Promise<RouteRendererBody> {
				renderOptions = options;
				return '<html><body>Page</body></html>';
			}

			protected override async importPageFile(): Promise<EcoPageFile> {
				return this.PageModule;
			}

			protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
				return (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;
			}
		})({
			appConfig,
			assetProcessingService: { processDependencies } as unknown as AssetProcessingService,
			assetProcessingIntegration,
		});

		await renderer.execute({ file: '/app/pages/demo.tsx', params: {}, query: {} });

		expect(processDependencies).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'script',
					source: 'content',
					content: expect.stringContaining('react-aria-components'),
				}),
			]),
			assetProcessingIntegration,
		);
		expect(renderOptions?.pagePackage?.pageBrowserGraph?.entryAssets).toEqual([
			{ kind: 'script', inline: true, content: expect.stringContaining('react-aria-components') },
		]);
	});

	it('responds with exactly the assets of the prepared page package', async () => {
		const processDependencies = vi.fn(async (dependencies: AssetDefinition[]) =>
			dependencies.flatMap((dependency): ProcessedAsset[] =>
				dependency.kind === 'stylesheet' && dependency.source === 'file'
					? [
							{
								kind: 'stylesheet',
								inline: false,
								srcUrl: `/assets/${dependency.filepath.split('/').at(-1)}`,
								position: 'head',
								attributes: { rel: 'stylesheet' },
							},
						]
					: [],
			),
		);
		const integration = 'prepared-package-renderer';
		const Card = eco.component({
			integration,
			identity: { id: 'card', file: '/app/components/card.ts', integration },
			dependencies: { stylesheets: ['./card.css'] },
			render: () => '<article>card</article>',
		});
		const Layout = eco.layout({
			integration,
			identity: { id: 'layout', file: '/app/layouts/base.ts', integration },
			dependencies: { stylesheets: ['./base.css'] },
			render: ({ children }) => `<div class="layout">${String(children ?? '')}</div>`,
		});
		const Page = eco.page({
			integration,
			identity: { id: 'page', file: '/app/pages/index.ts', integration },
			layout: Layout,
			dependencies: { stylesheets: ['./index.css'], components: [Card] },
			render: () => `<main>${String(Card({}))}</main>`,
		});
		const HtmlTemplate = eco.html({
			integration,
			identity: { id: 'html', file: '/app/html.ts', integration },
			render: ({ children }) => `<html><head></head><body>${String(children ?? '')}</body></html>`,
		});
		let preparedPagePackage: IntegrationRendererRenderOptions['pagePackage'];
		const renderer = new (class extends IntegrationRenderer<EcoPagesElement> {
			name = integration;

			override async render(options: IntegrationRendererRenderOptions<EcoPagesElement>) {
				preparedPagePackage = options.pagePackage;
				return await super.render(options);
			}

			protected override async importPageFile(): Promise<EcoPageFile> {
				return { default: Page };
			}

			protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
				return HtmlTemplate as EcoComponent<HtmlTemplateProps>;
			}
		})({
			appConfig: createMockAppConfig(),
			assetProcessingService: { processDependencies } as unknown as AssetProcessingService,
		});

		const result = await renderer.execute({ file: '/app/pages/index.ts', params: {}, query: {} });
		const html = await new Response(result.body as BodyInit).text();
		const linkedStylesheets = [...html.matchAll(/<link [^>]*href="([^"]+)"/g)].map((match) => match[1]).sort();

		expect(html).toContain('<article>card</article>');
		expect(linkedStylesheets).toEqual(['/assets/base.css', '/assets/card.css', '/assets/index.css']);
		expect(linkedStylesheets).toEqual(preparedPagePackage?.assets.map((asset) => asset.srcUrl).sort());
	});

	it('should extract cache strategy from page component (static property)', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
		});

		const PageIdx = (() => 'Page Content') as EcoPageComponent<any>;
		PageIdx.cache = { revalidate: 60 };

		renderer.PageModule = {
			default: PageIdx,
		};
		renderer.HtmlTemplate = (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;

		const result = await renderer.execute({
			file: '/app/pages/cached-page.ts',
			params: {},
			query: {},
		});

		expect(result.cacheStrategy).toEqual({ revalidate: 60 });
	});

	it('should return undefined cache strategy if not present', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
		});

		const PageIdx = (() => 'Page Content') as EcoPageComponent<any>;

		renderer.PageModule = {
			default: PageIdx,
		};
		renderer.HtmlTemplate = (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;

		const result = await renderer.execute({
			file: '/app/pages/simple-page.ts',
			params: {},
			query: {},
		});

		expect(result.cacheStrategy).toBeUndefined();
	});

	it('should resolve static props and metadata correctly', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
		});

		const PageIdx = (({ title }: { title: string }) => `<main>${title}</main>`) as EcoPageComponent<any>;
		PageIdx.staticProps = async () => ({ props: { title: 'Dynamic Title' } });
		PageIdx.metadata = async ({ props }: { props: Record<string, unknown> }) => ({
			title: props.title as string,
			description: 'Dynamic Description',
		});

		renderer.PageModule = {
			default: PageIdx,
		};
		renderer.HtmlTemplate = (async ({ children, metadata }) =>
			`<html><head><title>${metadata.title}</title></head><body>${children}</body></html>`) as EcoComponent<HtmlTemplateProps>;
		renderer.UseDocumentShellRender = true;

		const result = await renderer.execute({
			file: '/app/pages/props-page.ts',
			params: {},
			query: {},
		});
		const html = await new Response(result.body as BodyInit).text();

		expect(html).toContain('<title>Dynamic Title</title>');
		expect(html).toContain('<main>Dynamic Title</main>');
	});

	it('keeps request locals off static layouts and guards static page access', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
		});
		renderer.UseDocumentShellRender = true;

		const PageIdx = (({ locals }: { locals?: object }) => {
			try {
				Reflect.get(locals as object, 'session');
				return '<p>request locals were available</p>';
			} catch (error) {
				return `<p>${error instanceof Error ? error.message : String(error)}</p>`;
			}
		}) as EcoPageComponent<Record<string, unknown>>;
		const Layout = (({ children, locals }: { children?: unknown; locals?: object }) =>
			`<main data-layout-locals="${locals === undefined ? 'absent' : 'present'}">${String(children ?? '')}</main>`) as EcoComponent<{
			children?: unknown;
			locals?: object;
		}>;
		PageIdx.config = { layouts: [Layout] };

		renderer.PageModule = {
			default: PageIdx,
		};
		renderer.HtmlTemplate = (({ children }) =>
			`<html><body>${String(children ?? '')}</body></html>`) as EcoComponent<HtmlTemplateProps>;

		const result = await renderer.execute({
			file: '/app/pages/static-page.ts',
			params: {},
			query: {},
		});
		const html = await new Response(result.body as BodyInit).text();

		expect(html).toContain('data-layout-locals="absent"');
		expect(html).toContain(
			"[ecopages] Request locals are only available during request-time rendering with cache: 'dynamic'. Page: /app/pages/static-page.ts",
		);
	});

	it('passes request locals to dynamic pages and layouts', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
		});
		renderer.UseDocumentShellRender = true;

		const PageIdx = (({ locals }: { locals?: { session?: { userId?: string } } }) =>
			`<p data-page-user="${locals?.session?.userId ?? 'missing'}">Page</p>`) as EcoPageComponent<
			Record<string, unknown>
		>;
		const Layout = (({ children, locals }: { children?: unknown; locals?: { session?: { userId?: string } } }) =>
			`<main data-layout-user="${locals?.session?.userId ?? 'missing'}">${String(children ?? '')}</main>`) as EcoComponent<{
			children?: unknown;
			locals?: { session?: { userId?: string } };
		}>;
		PageIdx.cache = 'dynamic';
		PageIdx.config = { layouts: [Layout] };

		renderer.PageModule = {
			default: PageIdx,
		};
		renderer.HtmlTemplate = (({ children }) =>
			`<html><body>${String(children ?? '')}</body></html>`) as EcoComponent<HtmlTemplateProps>;

		const result = await renderer.execute({
			file: '/app/pages/dynamic-page.ts',
			params: {},
			query: {},
			locals: { session: { userId: 'u-1' } },
		});
		const html = await new Response(result.body as BodyInit).text();

		expect(html).toContain('<main data-layout-user="u-1"><p data-page-user="u-1">Page</p></main>');
	});

	describe('renderExplicitView', () => {
		it('should render a view with default status 200', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
			});
			renderer.HtmlTemplate = (() => 'html') as EcoComponent<HtmlTemplateProps>;
			renderer.HtmlTemplate.config = {
				identity: { id: 'html', file: '/app/includes/html.ts', integration: 'test-renderer' },
			};

			const View = ((props: { title: string }) => `<h1>${props.title}</h1>`) as EcoComponent<{
				title: string;
			}>;

			const response = await renderer.renderExplicitView(View, { title: 'Hello' }, {});

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
		});

		it('should render a partial view without layout', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
			});

			const View = ((props: { content: string }) => `<div>${props.content}</div>`) as EcoComponent<{
				content: string;
			}>;

			const response = await renderer.renderExplicitView(View, { content: 'Partial' }, { partial: true });

			const body = await response.text();
			expect(body).toBe('<div>Partial</div>');
			expect(body).not.toContain('<!DOCTYPE html>');
		});

		it('should apply custom status code', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
			});

			renderer.HtmlTemplate = (() => 'html') as EcoComponent<HtmlTemplateProps>;
			renderer.HtmlTemplate.config = {
				identity: { id: 'html', file: '/app/includes/html.ts', integration: 'test-renderer' },
			};
			const View = (() => '<p>Not Found</p>') as EcoComponent<object>;

			const response = await renderer.renderExplicitView(View, {}, { status: 404 });

			expect(response.status).toBe(404);
		});

		it('should apply custom headers', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
			});

			renderer.HtmlTemplate = (() => 'html') as EcoComponent<HtmlTemplateProps>;
			renderer.HtmlTemplate.config = {
				identity: { id: 'html', file: '/app/includes/html.ts', integration: 'test-renderer' },
			};
			const View = (() => '<p>Cached</p>') as EcoComponent<object>;

			const response = await renderer.renderExplicitView(
				View,
				{},
				{
					headers: {
						'Cache-Control': 'max-age=3600',
						'X-Custom-Header': 'test-value',
					},
				},
			);

			expect(response.headers.get('Cache-Control')).toBe('max-age=3600');
			expect(response.headers.get('X-Custom-Header')).toBe('test-value');
		});
	});

	describe('renderComponent', () => {
		it('should render a component with structured output', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
			});

			const View = ((props: { title: string }) => `<h1>${props.title}</h1>`) as EcoComponent<{ title: string }>;

			const result = await renderer.renderComponent({
				component: View,
				props: { title: 'Hello Component' },
			});

			expect(result.integrationName).toBe('test-renderer');
			expect(result.canAttachAttributes).toBe(true);
			expect(result.html).toContain('<h1>Hello Component</h1>');
		});
	});

	describe('execute component-level artifacts', () => {
		it('should handle stream-like render bodies without re-consuming disturbed responses', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
			});

			renderer.RenderedBody = new Response('<html><body><main>Stream Body</main></body></html>').body as BodyInit;
			renderer.PageModule = {
				default: (() => '<main>Stream Body</main>') as unknown as EcoPageComponent<any>,
			};
			renderer.HtmlTemplate = (() =>
				'<html><body><main>Stream Body</main></body></html>') as EcoComponent<HtmlTemplateProps>;

			const result = await renderer.execute({
				file: '/app/pages/index.ts',
				params: {},
				query: {},
			});

			const body = await new Response(result.body as BodyInit).text();
			expect(body).toContain('<main>Stream Body</main>');
		});

		it('should apply document attributes during route finalization', async () => {
			class DocumentAttributeRenderer extends TestIntegrationRenderer {
				protected override getDocumentAttributes(): Record<string, string> | undefined {
					return { 'data-eco-document-owner': 'react-router' };
				}
			}

			const renderer = new DocumentAttributeRenderer({
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
			});

			renderer.RenderedBody = '<html><body><main>Test Page</main></body></html>';
			renderer.PageModule = {
				default: (() => '<main>Test Page</main>') as unknown as EcoPageComponent<any>,
			};
			renderer.HtmlTemplate = (() =>
				'<html><body><main>Test Page</main></body></html>') as EcoComponent<HtmlTemplateProps>;

			const result = await renderer.execute({
				file: '/app/pages/index.ts',
				params: {},
				query: {},
			});

			const body = await new Response(result.body as BodyInit).text();
			expect(body).toContain('<html data-eco-document-owner="react-router"><body>');
			expect(body).toContain('<main>Test Page</main>');
		});

		it('should not force render nested dependency components without resolved props context', async () => {
			const explicitRenderer = {
				renderComponent: vi.fn(async (_input: ComponentRenderInput) => ({
					html: '<aside>Nested</aside>',
					canAttachAttributes: true,
					integrationName: 'explicit-renderer',
				})),
				renderComponentWithForeignChildren: vi.fn(async (input: ComponentRenderInput) =>
					explicitRenderer.renderComponent(input),
				),
			};

			const appConfig = createMockAppConfig({
				integrations: [
					createMockIntegrationPlugin({
						name: 'explicit-renderer',
						getRenderer: () => explicitRenderer,
					}),
				],
			});

			const renderer = new TestIntegrationRenderer({
				appConfig,
				assetProcessingService: testAssetService,
			});

			renderer.RenderedBody = '<html><body><main>Test Page</main></body></html>';
			renderer.MockComponentRenderResult = {
				html: '<main>Test Page</main>',
				canAttachAttributes: true,
				integrationName: 'test-renderer',
				rootAttributes: { 'data-eco-component-id': 'eco-page-root' },
			};

			const NestedComponent = (() => '<aside>Nested</aside>') as EcoComponent<Record<string, unknown>>;
			NestedComponent.config = {
				integration: 'explicit-renderer',
				identity: {
					id: 'nested-component',
					file: '/app/components/nested-component.ts',
					integration: 'test-renderer',
				},
			};

			const Page = (() => '<main>Test Page</main>') as unknown as EcoPageComponent<any>;
			Page.config = {
				dependencies: {
					components: [NestedComponent],
				},
			};

			renderer.PageModule = {
				default: Page,
			};
			renderer.HtmlTemplate = (() =>
				'<html><body><main>Test Page</main></body></html>') as EcoComponent<HtmlTemplateProps>;

			const result = await renderer.execute({
				file: '/app/pages/index.ts',
				params: {},
				query: {},
			});

			expect(explicitRenderer.renderComponent).toHaveBeenCalledTimes(0);

			const body = await new Response(result.body as BodyInit).text();
			expect(body).toContain('<main>Test Page</main>');
			expect(body).not.toContain('/assets/nested-explicit.js');
		});

		it('skips foreign-child wrapping for pure same-integration component trees', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
			});

			const Child = (() => '<span>Child</span>') as EcoComponent<Record<string, unknown>>;
			Child.config = {
				integration: 'test-renderer',
				identity: {
					id: 'child-component',
					file: '/app/components/child-component.ts',
					integration: 'test-renderer',
				},
			};

			const Root = (() => '<section>Root</section>') as EcoComponent<Record<string, unknown>>;
			Root.config = {
				integration: 'test-renderer',
				identity: {
					id: 'root-component',
					file: '/app/components/root-component.ts',
					integration: 'test-renderer',
				},
				dependencies: { components: [Child] },
			};

			renderer.UseDocumentShellRender = true;
			renderer.PageModule = { default: Root as EcoPageComponent<Record<string, unknown>> };
			renderer.HtmlTemplate = (() => '<html><body></body></html>') as EcoComponent<HtmlTemplateProps>;

			await renderer.execute({ file: '/app/pages/index.tsx', params: {}, query: {} });

			expect(renderer.ForeignChildRuntimeCreationCount).toBe(0);
		});

		it('wraps nested cross-integration component trees for foreign children', async () => {
			const appConfig = createMockAppConfig({
				integrations: [createMockIntegrationPlugin({ name: 'react' })],
			});
			const renderer = new TestIntegrationRenderer({
				appConfig,
				assetProcessingService: testAssetService,
			});

			const ForeignChild = (() => '<span>Child</span>') as EcoComponent<Record<string, unknown>>;
			ForeignChild.config = {
				integration: 'react',
				identity: {
					id: 'foreign-child-component',
					file: '/app/components/foreign-child-component.tsx',
					integration: 'react',
				},
			};

			const Root = (() => '<section>Root</section>') as EcoComponent<Record<string, unknown>>;
			Root.config = {
				integration: 'test-renderer',
				identity: {
					id: 'root-component',
					file: '/app/components/root-component.ts',
					integration: 'test-renderer',
				},
				dependencies: { components: [ForeignChild] },
			};

			renderer.UseDocumentShellRender = true;
			renderer.PageModule = { default: Root as EcoPageComponent<Record<string, unknown>> };
			renderer.HtmlTemplate = (() => '<html><body></body></html>') as EcoComponent<HtmlTemplateProps>;

			await renderer.execute({ file: '/app/pages/index.tsx', params: {}, query: {} });

			expect(renderer.ForeignChildRuntimeCreationCount).toBe(1);
		});

		it('should not reuse the page owner plan for a leaf of the renderer asking', async () => {
			const renderer = new TestIntegrationRenderer({
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
			});

			const Leaf = (() => '<span>Leaf</span>') as EcoComponent<Record<string, unknown>>;
			Leaf.config = {
				integration: 'test-renderer',
				identity: { id: 'leaf', file: '/app/components/leaf.tsx', integration: 'test-renderer' },
			};
			const Page = (() => '<main>Page</main>') as EcoComponent<Record<string, unknown>>;
			Page.config = {
				integration: 'page-owner',
				identity: { id: 'page', file: '/app/pages/index.tsx', integration: 'page-owner' },
				dependencies: { components: [Leaf] },
			};
			const ownerPlan = collectPageClientPlan([{ component: Page }], 'page-owner');

			const hasForeignDescendants = await runWithComponentRenderContext(
				{ currentIntegration: 'test-renderer', renderState: { pageClientPlan: ownerPlan } },
				async () => renderer.renderComponentWithForeignChildren({ component: Leaf, props: {} }),
			);

			expect(renderer.ForeignChildRuntimeCreationCount).toBe(0);
			expect(hasForeignDescendants.value.html).toContain('Leaf');
		});
	});

	it('stamps lazy trigger attributes onto serialized island HTML', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
		});
		const component = (() =>
			'<!--lit-part SJL2YkzXbQY=--><div class="discovery-counter-host">x</div>') as EcoComponent;
		component.config = {
			integration: 'test-renderer',
			identity: { id: 'discovery-counter', file: '/app/discovery-counter.tsx', integration: 'test-renderer' },
		};
		setResolvedLazyTriggers(component.config, [
			{ triggerId: 'eco-trigger-1', rules: [{ 'on:visible': { scripts: ['/assets/lazy.js'] } }] },
		]);

		const result = await renderer.renderComponentWithForeignChildren({ component, props: {} });

		expect(result.html).toMatch(
			/<div\b(?=[^>]*data-eco-trigger="eco-trigger-1")(?=[^>]*class="discovery-counter-host")[^>]*>/,
		);
	});

	it('collects grouped island assets from other hydrating integrations on the plan', async () => {
		const hydrationAsset = {
			kind: 'script',
			srcUrl: '/assets/react-island-hydration.js',
			attributes: { 'data-eco-script-id': 'react-island' },
		} as ProcessedAsset;
		const contributor = new (class extends TestIntegrationRenderer {
			override name = 'react';
			protected override contributesAppBrowserClientBuild() {
				return true;
			}
			override async buildPageClientBrowserAssets() {
				return { processedAssets: [hydrationAsset], lazyTriggers: [] };
			}
		})({
			appConfig: testAppConfig,
			assetProcessingService: testAssetService,
		});
		const host = new (class extends TestIntegrationRenderer {
			override name = 'kitajs';
		})({
			appConfig: createMockAppConfig({
				integrations: [
					createMockIntegrationPlugin({
						name: 'react',
						plugins: [],
						getRenderer: () => contributor,
					}),
				],
			}),
			assetProcessingService: testAssetService,
		});
		const island = eco.component({
			integration: 'react',
			identity: { id: 'react-counter', file: '/app/react-counter.tsx', integration: 'react' },
			render: () => '<button>Counter</button>',
		});
		const Page = eco.component({
			integration: 'kitajs',
			dependencies: { components: [island] },
			render: () => `<main>${String(island({}))}</main>`,
		});
		host.PageModule = { default: Page };
		host.UseDocumentShellRender = true;
		host.HtmlTemplate = (({ children }) =>
			`<html><head></head><body>${String(children ?? '')}</body></html>`) as EcoComponent<HtmlTemplateProps>;

		const result = await host.execute({ file: '/app/pages/index.kita.tsx', params: {}, query: {} });
		const html = await new Response(result.body as BodyInit).text();

		expect(html).toContain('<button>Counter</button>');
		expect(html).toContain('/assets/react-island-hydration.js');
	});

	describe('components missing from the prepared graph', () => {
		const undeclaredFile = '/app/lib/render-only-card.ts';

		afterEach(() => {
			vi.unstubAllEnvs();
		});

		const createComponent = (file: string, dependencies?: EcoComponentDependencies) => {
			const component = (() => `<p>${file}</p>`) as EcoComponent<object>;
			component.config = {
				integration: 'test-renderer',
				identity: { id: file, file, integration: 'test-renderer' },
				dependencies,
			};
			return component;
		};

		const createRoute = (options: { listed: boolean; withDependencies?: boolean }) => {
			const rendered = createComponent(
				undeclaredFile,
				options.withDependencies === false ? undefined : { stylesheets: ['./card.css'] },
			);
			const Page = createComponent('/app/pages/render-only.tsx', {
				components: options.listed ? [rendered] : [],
			});
			const renderer = new TestIntegrationRenderer({
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
			});
			renderer.HtmlTemplate = createComponent('/app/includes/html.ts') as EcoComponent<HtmlTemplateProps>;
			renderer.RenderBodyFactory = async () => {
				await renderer.renderComponentWithForeignChildren({ component: rendered, props: {} });
				return '<html><body>ok</body></html>';
			};
			return async () => {
				const result = await renderer.execute({
					file: '/app/pages/render-only.tsx',
					pageModule: { default: Page },
					params: {},
					query: {},
				});
				return new Response(result.body as BodyInit).text();
			};
		};

		it('fails a development render and names the component file', async () => {
			vi.stubEnv('NODE_ENV', 'development');

			await expect(createRoute({ listed: false })()).rejects.toThrow(undeclaredFile);
		});

		it('renders a component listed in its parent dependencies.components', async () => {
			vi.stubEnv('NODE_ENV', 'development');

			await expect(createRoute({ listed: true })()).resolves.toContain('<body>ok</body>');
		});

		it('does not check a production render', async () => {
			vi.stubEnv('NODE_ENV', 'production');

			await expect(createRoute({ listed: false })()).resolves.toContain('<body>ok</body>');
		});

		it('does not check a component without a dependencies config', async () => {
			vi.stubEnv('NODE_ENV', 'development');

			await expect(createRoute({ listed: false, withDependencies: false })()).resolves.toContain(
				'<body>ok</body>',
			);
		});

		it('does not check a partial explicit view, which prepares no graph', async () => {
			vi.stubEnv('NODE_ENV', 'development');
			const View = createComponent(undeclaredFile, { stylesheets: ['./card.css'] });
			const renderer = new TestIntegrationRenderer({
				appConfig: testAppConfig,
				assetProcessingService: testAssetService,
			});

			const response = await renderer.renderExplicitView(View, {}, { partial: true });

			expect(await response.text()).toBe(`<p>${undeclaredFile}</p>`);
		});
	});
});
