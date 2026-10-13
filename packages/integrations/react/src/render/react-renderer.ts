/**
 * React IntegrationRenderer orchestrator.
 *
 * @remarks
 * Wires services and delegates SSR / layout composition / ownership details to
 * focused modules under `render/`. Prefer changing those modules for
 * implementation work; keep this file as the IntegrationRenderer seam.
 *
 * @module
 */

import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	EcoComponentConfig,
	EcoPageFile,
	IntegrationRendererRenderOptions,
	PageMetadataProps,
	RouteRendererBody,
} from '@ecopages/core';
import { buildIslandHostAttributes, getComponentIdentity } from '@ecopages/core';
import {
	IntegrationRenderer,
	type HtmlDocumentContribution,
	type HtmlDocumentContributionContext,
	type PageBrowserGraphContributionContext,
	selectHydrationIslandEntries,
	type PageClientBrowserAssets,
	type PageClientPlan,
} from '@ecopages/core/route-renderer/orchestration/integration-renderer';
import { resolveDocumentShellLayouts } from '@ecopages/core/route-renderer/orchestration/document-shell/layout-shell-props.service';
import { RESOLVED_ASSETS_DIR } from '@ecopages/core/constants';
import type { AssetDefinition, ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import { ECO_DOCUMENT_OWNER_ATTRIBUTE } from '@ecopages/core/router/navigation-coordinator';
import { ensurePageConfigLayouts } from '@ecopages/core/eco/page-layout-normalization';
import type { ReactNode } from 'react';
import { hasSingleRootElement } from './html-boundary.ts';
import { getIslandComponentKey } from '../hydration/hydration-asset.ts';
import { REACT_PLUGIN_NAME } from '../plugin/react.constants.ts';
import type { ReactRendererConfig } from '../plugin/react.types.ts';
import type { ReactRouterAdapter } from '../contracts/router-adapter.ts';
import { BundleService } from '../bundling/bundle.ts';
import { HmrPageMetadataCache } from '../hmr/page-metadata-cache.ts';
import { MdxConfigDependencyService } from '../mdx/mdx-config-dependency.ts';
import { PageModuleService } from '../page/page-module.ts';
import { PagePayloadService } from '../hydration/page-payload.ts';
import { HydrationAssetService } from '../hydration/hydration-asset.ts';
import {
	renderPageDocumentShell,
	type DocumentShellComposeChildrenContext,
	type DocumentShellComposeChildrenResult,
	type DocumentShellLayoutInput,
} from '@ecopages/core/route-renderer/orchestration/document-shell/document-shell-render.service';
import {
	asNonReactShellComponent,
	getComponentRequires,
	isReactManagedComponent,
} from './component-ownership.ts';
import {
	buildHydrationProps,
	renderComponentHtml,
	renderNonReactShellComponent,
	restoreRuntimeChildHtml,
	toReactNode,
	type ReactComponentRenderContext,
	type ReactForeignSubtreeResolutionContext,
} from './component-ssr.ts';
import { BundleError, ReactRenderError } from './errors.ts';
import { resolveReactRuntimeModules, type ReactRuntimeModules } from './react-runtime.ts';
import { composeReactLayoutPageTree, shouldUseUnifiedReactLayoutComposition } from './unified-layout-composition.ts';
import { assertComposablePage, resolveLayoutContextFromShell } from './layout-compose.ts';

export type { ReactRendererConfig } from '../plugin/react.types.ts';
export { BundleError, ReactRenderError } from './errors.ts';

export type ReactRendererOptions = ConstructorParameters<typeof IntegrationRenderer>[0] & {
	reactConfig?: ReactRendererConfig;
};

/**
 * Renderer for React components.
 * @extends IntegrationRenderer
 */
export class ReactRenderer extends IntegrationRenderer<ReactNode> {
	name = REACT_PLUGIN_NAME;
	componentDirectory = RESOLVED_ASSETS_DIR;
	private reactRuntimeModules?: ReactRuntimeModules;
	private readonly routerAdapter?: ReactRouterAdapter;
	private readonly mdxExtensions: string[];
	private readonly hmrPageMetadataCache?: HmrPageMetadataCache;
	/**
	 * When true, always emit page browser graph / hydration assets for React pages.
	 *
	 * Mapped from the public `explicitGraph` plugin option. Does not disable the
	 * client-graph AST boundary.
	 */
	private readonly forceBrowserGraph: boolean;

	readonly bundleService: BundleService;
	readonly pageModuleService: PageModuleService;
	readonly hydrationAssetService: HydrationAssetService;
	readonly pagePayloadService: PagePayloadService;
	readonly mdxConfigDependencyService: MdxConfigDependencyService;

	constructor(options: ReactRendererOptions) {
		const { reactConfig, ...rendererOptions } = options;
		super(rendererOptions);

		this.routerAdapter = reactConfig?.routerAdapter;
		this.mdxExtensions = reactConfig?.mdxExtensions ?? ['.mdx'];
		this.hmrPageMetadataCache = reactConfig?.hmrPageMetadataCache;
		this.forceBrowserGraph = reactConfig?.forceBrowserGraph ?? false;

		this.bundleService = new BundleService({
			rootDir: this.appConfig.rootDir,
			appConfig: this.appConfig,
			hostIntegrationName: this.name,
			routerAdapter: this.routerAdapter,
			runtimeModules: reactConfig?.runtimeModules,
			getMdxLoaderPlugin: reactConfig?.getMdxLoaderPlugin,
		});

		this.pageModuleService = new PageModuleService({
			layoutsDir: this.appConfig.absolutePaths.layoutsDir,
			componentsDir: this.appConfig.absolutePaths.componentsDir,
			mdxExtensions: this.mdxExtensions,
			integrationName: this.name,
			hasRouterAdapter: Boolean(this.routerAdapter),
		});

		this.hydrationAssetService = new HydrationAssetService({
			srcDir: this.appConfig.srcDir,
			routerAdapter: this.routerAdapter,
			assetProcessingService: this.assetProcessingService,
			bundleService: this.bundleService,
			hmrPageMetadataCache: this.hmrPageMetadataCache,
		});

		this.pagePayloadService = new PagePayloadService();
		this.mdxConfigDependencyService = new MdxConfigDependencyService({
			integrationName: this.name,
			pageModuleService: this.pageModuleService,
			assetProcessingService: this.assetProcessingService,
		});
	}

	/**
	 * Builds island client assets for Foreign Children of this integration.
	 *
	 * @remarks
	 * Same-integration Page, Layout, Html, and includes are hydrated by the
	 * page bootstrap, not by per-component island scripts.
	 */
	protected override async collectIslandRenderAssets(plan: PageClientPlan): Promise<Map<string, ProcessedAsset[]>> {
		const { islandRenderAssetsByFile } = await this.buildPageClientBrowserAssets(plan);
		return islandRenderAssetsByFile;
	}

	protected override contributesAppBrowserClientBuild(): boolean {
		return true;
	}

	/**
	 * Builds React island and lazy-entry modules in one grouped browser build.
	 */
	protected override async buildPageClientBrowserAssets(plan: PageClientPlan): Promise<PageClientBrowserAssets> {
		const result = await this.hydrationAssetService.buildPageClientRenderAssets({
			islands: selectHydrationIslandEntries(plan, this.name).map((entry) => ({
				file: entry.file,
				config: entry.component.config,
			})),
			lazyEntries: plan.lazyClientEntries,
		});
		const lazyTriggers = this.dependencyResolverService.applyPendingLazyTriggers(
			result.processedAssets,
			plan.lazyConfigs ?? [],
		);
		return {
			processedAssets: result.processedAssets,
			islandRenderAssetsByFile: result.assetsByFile,
			lazyTriggers,
		};
	}

	private getRouterDocumentAttributes(): Record<string, string> | undefined {
		if (!this.routerAdapter) {
			return undefined;
		}

		return {
			[ECO_DOCUMENT_OWNER_ATTRIBUTE]: 'react-router',
		};
	}

	protected resolveReactRuntimeModules(): ReactRuntimeModules {
		return resolveReactRuntimeModules(this.appConfig.rootDir);
	}

	private getReactRuntimeModules(): ReactRuntimeModules {
		this.reactRuntimeModules ??= this.resolveReactRuntimeModules();
		return this.reactRuntimeModules;
	}

	private resolveReactQueuedForeignSubtreeHtml(
		html: string,
		runtimeContext: ReactForeignSubtreeResolutionContext | undefined,
	): Promise<{ assets: ProcessedAsset[]; html: string }> {
		return this.resolveQueuedForeignSubtrees(
			html,
			runtimeContext,
			async (children, currentRuntimeContext, queuedResolutionsByToken, resolveToken) => ({
				html: await this.renderQueuedChildrenToHtml({
					children,
					runtimeContext: currentRuntimeContext,
					queuedResolutionsByToken,
					resolveToken,
				}),
			}),
		);
	}

	private async renderQueuedChildrenToHtml(options: {
		children: unknown;
		runtimeContext: ReactForeignSubtreeResolutionContext;
		queuedResolutionsByToken: Map<string, ReactForeignSubtreeResolutionContext['queuedResolutions'][number]>;
		resolveToken: (token: string) => Promise<string>;
	}): Promise<string | undefined> {
		const { children, runtimeContext, queuedResolutionsByToken, resolveToken } = options;
		if (children === undefined) {
			return undefined;
		}

		const { react, reactDomServer } = this.getReactRuntimeModules();
		let html = this.normalizeUnresolvedMarkerArtifactHtml(
			reactDomServer.renderToString(react.createElement(react.Fragment, null, toReactNode(children, this.name))),
		);
		html = restoreRuntimeChildHtml(html, runtimeContext);

		return await this.foreignSubtreeExecutionService.resolveQueuedTokens(
			html,
			queuedResolutionsByToken,
			resolveToken,
		);
	}

	private buildPagePayload(options: {
		Page: EcoComponent;
		pageProps?: IntegrationRendererRenderOptions<ReactNode>['pageProps'];
		params: IntegrationRendererRenderOptions<ReactNode>['params'];
		query: IntegrationRendererRenderOptions<ReactNode>['query'];
		locals: IntegrationRendererRenderOptions<ReactNode>['locals'];
		pagePackage?: IntegrationRendererRenderOptions<ReactNode>['pagePackage'];
	}): { pageModuleUrl: string | undefined; pageProps: Record<string, unknown> } {
		const safeLocals = this.pagePayloadService.getSerializableLocals(
			options.locals,
			getComponentRequires(options.Page),
		);

		return {
			pageModuleUrl: this.pagePayloadService.resolvePageModuleUrl(options.pagePackage, {
				routerEnabled: Boolean(this.routerAdapter),
			}),
			pageProps: this.pagePayloadService.buildSerializedPageProps({
				pageProps: options.pageProps,
				params: options.params,
				query: options.query,
				safeLocals,
			}),
		};
	}

	/**
	 * Renders a React component for component-level orchestration.
	 *
	 * Behavior:
	 * - SSR always returns the component's own root HTML (no synthetic wrapper).
	 * - When an explicit component instance id is provided, a stable
	 *   `data-eco-component-id` attribute is attached so island hydration can target it.
	 * - Without an explicit instance id, component renders remain plain SSR output.
	 * - When resolved child HTML is provided, that foreign subtree is treated as a pure SSR
	 *   composition step and does not emit hydration assets for the parent wrapper.
	 *
	 * This preserves DOM shape for global CSS/layout selectors while keeping a
	 * deterministic mount target per component instance.
	 */
	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		const runtimeContext = this.getQueuedForeignSubtreeContext<ReactForeignSubtreeResolutionContext>(input);

		if (!isReactManagedComponent(input.component, this.name)) {
			return await this.renderForeignComponentWithSerializedHtml(input, runtimeContext);
		}

		return await this.renderReactManagedComponent(input, runtimeContext);
	}

	private async renderForeignComponentWithSerializedHtml(
		input: ComponentRenderInput,
		runtimeContext: ReactForeignSubtreeResolutionContext | undefined,
	): Promise<ComponentRenderResult> {
		let props = input.props;
		if (input.children !== undefined) {
			props = {
				...input.props,
				children: typeof input.children === 'string' ? input.children : String(input.children ?? ''),
			};
		}

		const html = await renderNonReactShellComponent(
			asNonReactShellComponent<Record<string, unknown>>(input.component),
			props,
			'Component',
		);
		const assets = input.component.config?.dependencies
			? await this.processComponentDependencies([input.component])
			: undefined;
		const queuedResolution = await this.resolveReactQueuedForeignSubtreeHtml(html, runtimeContext);
		const mergedAssets = this.htmlTransformer.dedupeProcessedAssets([
			...(assets ?? []),
			...queuedResolution.assets,
		]);

		return {
			html: queuedResolution.html,
			canAttachAttributes: true,
			rootTag: this.getRootTagName(queuedResolution.html),
			integrationName: this.name,
			assets: mergedAssets.length > 0 ? mergedAssets : undefined,
		};
	}

	/**
	 * Emits a server island host only for eligible, single-root component renders.
	 *
	 * @remarks
	 * Renderer-owned services stay on this class so SSR helpers do not receive
	 * wrappers around the renderer's own methods.
	 */
	private async renderReactManagedComponent(
		input: ComponentRenderInput,
		runtimeContext: ReactForeignSubtreeResolutionContext | undefined,
	): Promise<ComponentRenderResult> {
		const componentConfig = input.component.config;
		const context: ReactComponentRenderContext = {
			componentInstanceId: input.integrationContext?.componentInstanceId,
		};
		const hasResolvedChildHtml = input.children !== undefined;
		let html = this.normalizeUnresolvedMarkerArtifactHtml(
			renderComponentHtml({ input, context, runtimeContext, runtime: this.getReactRuntimeModules() }),
		);
		const queuedResolution = await this.resolveReactQueuedForeignSubtreeHtml(html, runtimeContext);
		html = queuedResolution.html;
		const canAttachAttributes = hasSingleRootElement(html);
		const rootTag = this.getRootTagName(html);
		const componentFile = getComponentIdentity(componentConfig)?.file;

		let rootAttributes: Record<string, string> | undefined;
		let assets: ProcessedAsset[] | undefined;
		if (canAttachAttributes && componentFile && context.componentInstanceId && !hasResolvedChildHtml) {
			rootAttributes = buildIslandHostAttributes({
				integrationName: this.name,
				componentInstanceId: context.componentInstanceId,
				componentKey: getIslandComponentKey(componentFile, componentConfig),
				props: buildHydrationProps(input.props),
			});
			assets = this.getActiveIslandRenderAssets().get(componentFile);
			html = `<eco-island style="display:contents">${html}</eco-island>`;
		}

		const mergedAssets = this.htmlTransformer.dedupeProcessedAssets([
			...(assets ?? []),
			...queuedResolution.assets,
		]);
		return {
			html,
			canAttachAttributes,
			rootTag: rootAttributes ? 'eco-island' : rootTag,
			integrationName: this.name,
			rootAttributes,
			assets: mergedAssets.length > 0 ? mergedAssets : undefined,
		};
	}

	/**
	 * Checks if the given file path corresponds to an MDX file based on configured extensions.
	 * @param filePath - The file path to check
	 * @returns True if the file is an MDX file
	 */
	public isMdxFile(filePath: string): boolean {
		return this.pageModuleService.isMdxFile(filePath);
	}

	protected override normalizeImportedPageFile<TPageModule extends EcoPageFile>(
		file: string,
		pageModule: TPageModule,
	): TPageModule {
		const reactModule = pageModule as TPageModule & { config?: EcoComponentConfig };
		const { default: Page, getMetadata, config } = reactModule;

		if (this.pageModuleService.isMdxFile(file) && config) {
			ensurePageConfigLayouts(config);
			Page.config = config;
		}

		return {
			...pageModule,
			default: Page,
			getMetadata,
			config,
		} as TPageModule;
	}

	protected override async collectPageBrowserGraphContribution(
		context: PageBrowserGraphContributionContext,
	): Promise<{ dependencies?: AssetDefinition[]; assets?: ProcessedAsset[] }> {
		try {
			const { file: pagePath, pageModule } = context;
			const shouldHydrate = this.forceBrowserGraph ? true : this.pageModuleService.shouldHydratePage(pageModule);
			if (!shouldHydrate) {
				return { assets: [] };
			}

			const isMdx = this.pageModuleService.isMdxFile(pagePath);
			const declaredModules = this.pageModuleService.collectPageDeclaredModules(pageModule);

			if (isMdx) {
				await this.bundleService.ensurePageLayoutNormalizationVendorProcessed(this.assetProcessingService);
			}

			const dependencies = await this.hydrationAssetService.createPageBrowserGraphDependencies(
				pagePath,
				isMdx,
				declaredModules,
			);
			const assets: ProcessedAsset[] = isMdx
				? await this.mdxConfigDependencyService.processMdxConfigDependencies({
						pagePath,
						config: (pageModule as EcoPageFile & { config?: EcoComponentConfig }).config,
						processComponentDependencies: async (components) =>
							await this.processComponentDependencies(components),
					})
				: [];

			return { dependencies, assets };
		} catch (error) {
			if (error instanceof BundleError) {
				console.error('[ecopages] Bundle errors:', error.logs);
			}

			throw new ReactRenderError(
				`Failed to generate hydration script: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private async composeReactLayoutPageChildrenForShell(
		page: { component: EcoComponent; props: Record<string, unknown> },
		context: DocumentShellComposeChildrenContext,
	): Promise<DocumentShellComposeChildrenResult> {
		const pageComponent = assertComposablePage(page.component);
		const shellEntries = context.layouts.map((layout) => ({
			component: layout.component,
			props: layout.props,
		}));
		const { react, reactDomServer } = this.getReactRuntimeModules();
		const tree = composeReactLayoutPageTree(pageComponent, page.props, shellEntries, {
			context: resolveLayoutContextFromShell(page.props, shellEntries),
			react,
		});
		const runtimeInput: ComponentRenderInput = {
			component: page.component,
			props: page.props,
			integrationContext: {
				rendererCache: context.rendererCache as ReactForeignSubtreeResolutionContext['rendererCache'],
			},
		};
		const runtimeContext = this.getQueuedForeignSubtreeContext<ReactForeignSubtreeResolutionContext>(runtimeInput);
		const html = this.normalizeUnresolvedMarkerArtifactHtml(reactDomServer.renderToString(tree));
		const resolved = await this.resolveReactQueuedForeignSubtreeHtml(html, runtimeContext);
		const primaryRender: ComponentRenderResult = {
			html: resolved.html,
			canAttachAttributes: hasSingleRootElement(resolved.html),
			rootTag: this.getRootTagName(resolved.html),
			integrationName: this.name,
			assets: resolved.assets.length > 0 ? resolved.assets : undefined,
		};

		return {
			children: resolved.html,
			layoutRenders: [],
			primaryRender,
		};
	}

	protected resolveComposeChildren(options: {
		page: { component: EcoComponent; props: Record<string, unknown> };
		shellLayouts: DocumentShellLayoutInput[];
		foreignChildRoots?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>;
	}): ((context: DocumentShellComposeChildrenContext) => Promise<DocumentShellComposeChildrenResult>) | undefined {
		const { page, shellLayouts, foreignChildRoots } = options;
		if (
			!shouldUseUnifiedReactLayoutComposition({
				page: page.component,
				shellLayouts,
				reactIntegrationName: this.name,
			})
		) {
			return undefined;
		}

		if (
			this.hasForeignChildDescendants(page.component, foreignChildRoots) ||
			shellLayouts.some((layout) => this.hasForeignChildDescendants(layout.component))
		) {
			return undefined;
		}

		return (context) => this.composeReactLayoutPageChildrenForShell(page, context);
	}

	protected override async renderPageWithDocumentShell(input: {
		page: {
			component: EcoComponent;
			props: Record<string, unknown>;
		};
		layout?: DocumentShellLayoutInput;
		layouts?: DocumentShellLayoutInput[];
		htmlTemplate: EcoComponent;
		metadata: PageMetadataProps;
		pageProps: Record<string, unknown>;
		documentProps?: Record<string, unknown>;
		transformDocumentHtml?: (html: string) => string;
		foreignChildRoots?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>;
	}): Promise<string> {
		const shellLayouts = input.layouts ?? (input.layout ? [input.layout] : []);
		const composeChildren = this.resolveComposeChildren({
			page: input.page,
			shellLayouts,
			foreignChildRoots: input.foreignChildRoots,
		});

		return renderPageDocumentShell(
			{
				renderComponentWithForeignChildren: (renderInput) =>
					this.renderComponentWithForeignChildren(renderInput),
				appendProcessedDependencies: (...assetGroups) => this.appendProcessedDependencies(...assetGroups),
			},
			{
				...input,
				composeChildren,
			},
			this.DOC_TYPE,
		);
	}

	/**
	 * Renders a full route response for the filesystem page pipeline.
	 *
	 * This path receives already-resolved route metadata, layout, locals, and HTML
	 * template instances from the shared renderer orchestration. Its main job is to
	 * serialize only the browser-safe page payload, compose the mixed React/non-
	 * React shell tree, and hand the result back as a document body.
	 */
	async render({
		params,
		query,
		props,
		locals,
		pageLocals,
		metadata,
		Page,
		Layout,
		layoutEntries,
		HtmlTemplate,
		pageProps,
		pagePackage,
		resolvedPageDependencyComponents,
	}: IntegrationRendererRenderOptions<ReactNode>): Promise<RouteRendererBody> {
		try {
			const pagePayload = this.buildPagePayload({
				Page,
				pageProps,
				params,
				query,
				locals,
				pagePackage,
			});

			return await this.renderPageWithDocumentShell({
				page: {
					component: Page,
					props: { params, query, ...props, locals: pageLocals },
				},
				layouts: resolveDocumentShellLayouts({
					layout: Layout,
					layoutEntries,
					params,
					query,
					locals,
				}),
				htmlTemplate: HtmlTemplate,
				metadata,
				pageProps: pagePayload.pageProps,
				documentProps: pagePayload.pageModuleUrl ? { pageModuleUrl: pagePayload.pageModuleUrl } : undefined,
				foreignChildRoots: resolvedPageDependencyComponents,
			});
		} catch (error) {
			throw this.createRenderError('Failed to render component', error);
		}
	}

	protected override getHtmlDocumentContributions(
		options: HtmlDocumentContributionContext<ReactNode>,
	): HtmlDocumentContribution[] | undefined {
		const renderOptions = options.renderOptions;
		if (
			options.partial ||
			!renderOptions ||
			!this.routerAdapter ||
			isReactManagedComponent(renderOptions.HtmlTemplate, this.name)
		) {
			return undefined;
		}

		const pagePayload = this.buildPagePayload({
			Page: renderOptions.Page,
			pageProps: renderOptions.pageProps,
			params: renderOptions.params,
			query: renderOptions.query,
			locals: renderOptions.locals,
			pagePackage: renderOptions.pagePackage,
		});

		return this.pagePayloadService.buildNonReactDocumentContributions({
			htmlTemplate: renderOptions.HtmlTemplate,
			pageProps: pagePayload.pageProps,
			pageModuleUrl: pagePayload.pageModuleUrl,
			reactIntegrationName: this.name,
			routerEnabled: true,
		});
	}

	protected override getDocumentAttributes(): Record<string, string> | undefined {
		return this.getRouterDocumentAttributes();
	}
}
