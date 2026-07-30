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
import { getComponentIdentity } from '@ecopages/core';
import {
	IntegrationRenderer,
	type HtmlDocumentContribution,
	type HtmlDocumentContributionContext,
	type PageBrowserGraphContributionContext,
	type RenderToResponseContext,
} from '@ecopages/core/route-renderer/orchestration/integration-renderer';
import { RESOLVED_ASSETS_DIR } from '@ecopages/core/constants';
import type { AssetDefinition, ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import { ECO_DOCUMENT_OWNER_ATTRIBUTE } from '@ecopages/core/router/navigation-coordinator';
import { ensurePageConfigLayouts } from '@ecopages/core/eco/page-layout-normalization';
import type { CompileOptions } from '@mdx-js/mdx';
import type { ReactNode } from 'react';
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
	composeDocumentShell,
	finalizeDocumentShellHtml,
	renderPageDocumentShell,
	type DocumentShellComposeChildrenContext,
	type DocumentShellComposeChildrenResult,
	type DocumentShellLayoutInput,
} from '@ecopages/core/route-renderer/orchestration/document-shell/document-shell-render.service';
import { mergePageBrowserGraph } from '@ecopages/core/route-renderer/orchestration/page-browser-graph/page-browser-graph-merge.utils';
import {
	getForeignSubtreeResolutionContextKey,
	getForeignSubtreeTokenPrefix,
	resolveOwningIntegrationRenderer,
} from '@ecopages/core/route-renderer/orchestration/foreign-child/owning-renderer-resolution';
import type { ForeignSubtreeExecutionOwningRenderer } from '@ecopages/core/route-renderer/orchestration/foreign-child/foreign-subtree-execution.service';
import { asReactComponent, getComponentRequires, isReactManagedComponent } from './component-ownership.ts';
import {
	createForeignSubtreeRuntimeContext,
	renderForeignComponentWithSerializedHtml,
	renderReactManagedComponent,
	renderReactQueuedForeignSubtreeChildren,
	type ReactForeignSubtreeResolutionContext,
} from './component-ssr.ts';
import { BundleError, ReactRenderError } from './errors.ts';
import { resolveReactRuntimeModules, type ReactRuntimeModules } from './react-runtime.ts';
import { composeReactLayoutPageChildren, resolveComposeChildren } from './unified-layout-composition.ts';

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
	private readonly mdxCompilerOptions?: CompileOptions;
	private readonly mdxExtensions: string[];
	private readonly hmrPageMetadataCache?: HmrPageMetadataCache;
	/**
	 * When true, always emit page browser graph / hydration assets for React pages.
	 *
	 * Mapped from the public `explicitGraph` plugin option. Does not disable the
	 * client-graph AST boundary.
	 */
	private readonly forceBrowserGraph: boolean;

	/** @internal */
	readonly bundleService: BundleService;
	/** @internal */
	readonly pageModuleService: PageModuleService;
	/** @internal */
	readonly hydrationAssetService: HydrationAssetService;
	/** @internal */
	readonly pagePayloadService: PagePayloadService;
	/** @internal */
	readonly mdxConfigDependencyService: MdxConfigDependencyService;

	constructor(options: ReactRendererOptions) {
		const { reactConfig, ...rendererOptions } = options;
		super(rendererOptions);

		this.routerAdapter = reactConfig?.routerAdapter;
		this.mdxCompilerOptions = reactConfig?.mdxCompilerOptions;
		this.mdxExtensions = reactConfig?.mdxExtensions ?? ['.mdx'];
		this.hmrPageMetadataCache = reactConfig?.hmrPageMetadataCache;
		this.forceBrowserGraph = reactConfig?.forceBrowserGraph ?? false;

		this.bundleService = new BundleService({
			rootDir: this.appConfig.rootDir,
			appConfig: this.appConfig,
			hostIntegrationName: this.name,
			routerAdapter: this.routerAdapter,
			runtimeModules: reactConfig?.runtimeModules,
			mdxCompilerOptions: this.mdxCompilerOptions,
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

	/**
	 * Appends route hydration assets for a concrete page/view file to the current
	 * HTML transformer state.
	 */
	private async appendHydrationAssetsForFile(filePath?: string): Promise<void> {
		if (!filePath) {
			return;
		}

		const pageBrowserGraph = await this.resolvePageBrowserGraphForFile(filePath);
		if (!pageBrowserGraph) {
			return;
		}

		const { pagePackage } = mergePageBrowserGraph(
			this.htmlTransformer.getPagePackage(),
			this.htmlTransformer.getProcessedDependencies(),
			pageBrowserGraph,
		);
		this.htmlTransformer.setPagePackage(pagePackage);
	}

	private resolveOwningRenderer(
		integrationName: string,
		rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>,
	): Promise<ForeignSubtreeExecutionOwningRenderer> {
		return resolveOwningIntegrationRenderer({
			appConfig: this.appConfig,
			runtimeOrigin: this.runtimeOrigin,
			currentIntegrationName: this.name,
			currentRenderer: this,
			integrationName,
			cache: rendererCache,
		});
	}

	private resolveReactQueuedForeignSubtreeHtml(
		html: string,
		runtimeContext: ReactForeignSubtreeResolutionContext | undefined,
	): Promise<{ assets: ProcessedAsset[]; html: string }> {
		return this.foreignSubtreeExecutionService.resolveQueuedHtml({
			currentIntegrationName: this.name,
			html,
			runtimeContext,
			queueLabel: 'React',
			getOwningRenderer: (integrationName, rendererCache) =>
				this.resolveOwningRenderer(integrationName, rendererCache),
			applyAttributesToFirstElement: (resolvedHtml, attributes) =>
				this.htmlTransformer.applyAttributesToFirstElement(resolvedHtml, attributes),
			dedupeProcessedAssets: (assets) => this.htmlTransformer.dedupeProcessedAssets(assets),
			renderQueuedChildren: (children, currentRuntimeContext, queuedResolutionsByToken, resolveToken) =>
				renderReactQueuedForeignSubtreeChildren({
					children,
					currentRuntimeContext,
					queuedResolutionsByToken,
					resolveToken,
					runtime: this.getReactRuntimeModules(),
					integrationName: this.name,
					normalizeUnresolvedMarkerArtifactHtml: (value) => this.normalizeUnresolvedMarkerArtifactHtml(value),
					resolveQueuedTokens: (value, tokens, resolve) =>
						this.foreignSubtreeExecutionService.resolveQueuedTokens(value, tokens, resolve),
				}),
		});
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
		const runtimeContext =
			this.foreignSubtreeExecutionService.getQueuedRuntimeContext<ReactForeignSubtreeResolutionContext>(
				input,
				getForeignSubtreeResolutionContextKey(this.name),
			);

		if (!isReactManagedComponent(input.component, this.name)) {
			return renderForeignComponentWithSerializedHtml({
				input,
				runtimeContext,
				integrationName: this.name,
				canResolveAssets: typeof this.assetProcessingService?.processDependencies === 'function',
				processComponentDependencies: (components) => this.processComponentDependencies(components),
				dedupeProcessedAssets: (assets) => this.htmlTransformer.dedupeProcessedAssets(assets),
				getRootTagName: (html) => this.getRootTagName(html),
				resolveQueuedForeignSubtreeHtml: (html, context) =>
					this.resolveReactQueuedForeignSubtreeHtml(html, context),
			});
		}

		return renderReactManagedComponent({
			input,
			runtimeContext,
			runtime: this.getReactRuntimeModules(),
			integrationName: this.name,
			normalizeUnresolvedMarkerArtifactHtml: (html) => this.normalizeUnresolvedMarkerArtifactHtml(html),
			resolveQueuedForeignSubtreeHtml: (html, context) =>
				this.resolveReactQueuedForeignSubtreeHtml(html, context),
			getRootTagName: (html) => this.getRootTagName(html),
			dedupeProcessedAssets: (assets) => this.htmlTransformer.dedupeProcessedAssets(assets),
			hydrationAssetService: this.hydrationAssetService,
			canBuildIslandAssets: Boolean(this.assetProcessingService),
		});
	}

	protected override createForeignChildRuntime(options: {
		renderInput: ComponentRenderInput;
		rendererCache: Map<string, IntegrationRenderer<any>>;
	}) {
		return this.foreignSubtreeExecutionService.createQueuedRuntime<ReactForeignSubtreeResolutionContext>({
			renderInput: options.renderInput,
			rendererCache: options.rendererCache,
			runtimeContextKey: getForeignSubtreeResolutionContextKey(this.name),
			tokenPrefix: getForeignSubtreeTokenPrefix(this.name),
			createRuntimeContext: (integrationContext, rendererCache) =>
				createForeignSubtreeRuntimeContext({
					rendererCache: rendererCache as Map<string, IntegrationRenderer<any>>,
					componentInstanceScope: integrationContext.componentInstanceId,
				}),
		});
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
		return composeReactLayoutPageChildren({
			page,
			context,
			runtime: this.getReactRuntimeModules(),
			integrationName: this.name,
			normalizeUnresolvedMarkerArtifactHtml: (html) => this.normalizeUnresolvedMarkerArtifactHtml(html),
			getRootTagName: (html) => this.getRootTagName(html),
			getQueuedForeignSubtreeResolutionContext: (input) =>
				this.foreignSubtreeExecutionService.getQueuedRuntimeContext<ReactForeignSubtreeResolutionContext>(
					input,
					getForeignSubtreeResolutionContextKey(this.name),
				),
			resolveQueuedForeignSubtreeHtml: (html, runtimeContext) =>
				this.resolveReactQueuedForeignSubtreeHtml(html, runtimeContext),
		});
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
	}): Promise<string> {
		const shellLayouts = input.layouts ?? (input.layout ? [input.layout] : []);
		const composeChildren = resolveComposeChildren({
			page: input.page,
			shellLayouts,
			reactIntegrationName: this.name,
			composeChildren: (page, context) => this.composeReactLayoutPageChildrenForShell(page, context),
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
		HtmlTemplate,
		pageProps,
		pagePackage,
	}: IntegrationRendererRenderOptions<ReactNode>): Promise<RouteRendererBody> {
		try {
			const pageModuleUrl = this.pagePayloadService.resolvePageModuleUrl(pagePackage, {
				routerEnabled: Boolean(this.routerAdapter),
			});
			const safeLocals = this.pagePayloadService.getSerializableLocals(locals, getComponentRequires(Page));
			const allPageProps = this.pagePayloadService.buildSerializedPageProps({
				pageProps,
				params,
				query,
				safeLocals,
			});

			return await this.renderPageWithDocumentShell({
				page: {
					component: Page,
					props: { params, query, ...props, locals: pageLocals },
				},
				layout: Layout
					? {
							component: Layout,
							props: locals ? { locals } : {},
						}
					: undefined,
				htmlTemplate: HtmlTemplate,
				metadata,
				pageProps: allPageProps,
				documentProps: pageModuleUrl ? { pageModuleUrl } : undefined,
			});
		} catch (error) {
			throw this.createRenderError('Failed to render component', error);
		}
	}

	protected override getHtmlDocumentContributions(
		options: HtmlDocumentContributionContext<ReactNode>,
	): HtmlDocumentContribution[] | undefined {
		if (options.partial || !options.renderOptions) {
			return undefined;
		}

		const safeLocals = this.pagePayloadService.getSerializableLocals(
			options.renderOptions.locals,
			getComponentRequires(options.renderOptions.Page),
		);
		const pageModuleUrl = this.pagePayloadService.resolvePageModuleUrl(options.renderOptions.pagePackage, {
			routerEnabled: Boolean(this.routerAdapter),
		});
		const allPageProps = this.pagePayloadService.buildSerializedPageProps({
			pageProps: options.renderOptions.pageProps,
			params: options.renderOptions.params,
			query: options.renderOptions.query,
			safeLocals,
		});

		return this.pagePayloadService.buildNonReactDocumentContributions({
			htmlTemplate: options.renderOptions.HtmlTemplate,
			pageProps: allPageProps as Record<string, unknown>,
			pageModuleUrl,
			reactIntegrationName: this.name,
			routerEnabled: Boolean(this.routerAdapter),
		});
	}

	protected override getDocumentAttributes(): Record<string, string> | undefined {
		return this.getRouterDocumentAttributes();
	}

	protected override async renderViewWithDocumentShell<P>(input: {
		view: EcoComponent<P>;
		props: P;
		ctx: RenderToResponseContext;
		layout?: EcoComponent;
	}): Promise<Response> {
		const normalizedProps = (input.props ?? {}) as Record<string, unknown>;

		if (input.ctx.partial) {
			const { react, reactDomServer } = this.getReactRuntimeModules();
			const ViewComponent = asReactComponent(input.view);
			return this.renderPartialViewResponse({
				...input,
				renderInline: async () =>
					await reactDomServer.renderToReadableStream(react.createElement(ViewComponent, normalizedProps)),
			});
		}

		await this.prepareViewDependencies(input.view, input.layout);
		if (!input.ctx.partial) {
			await this.appendHydrationAssetsForFile(getComponentIdentity(input.view)?.file);
		}

		const HtmlTemplate = await this.getHtmlTemplate();
		const metadata = await this.resolveViewMetadata(input.view, input.props);
		const pageModuleUrl = this.pagePayloadService.resolvePageModuleUrl(this.htmlTransformer.getPagePackage(), {
			routerEnabled: Boolean(this.routerAdapter),
		});
		const serializedPageProps = this.pagePayloadService.buildSerializedPageProps({
			pageProps: normalizedProps,
			params: {},
			query: {},
			safeLocals: this.pagePayloadService.getSerializableLocals(undefined, getComponentRequires(input.view)),
		});
		const shellLayouts: DocumentShellLayoutInput[] = input.layout ? [{ component: input.layout, props: {} }] : [];
		const composeChildren = resolveComposeChildren({
			page: { component: input.view, props: normalizedProps },
			shellLayouts,
			reactIntegrationName: this.name,
			composeChildren: (page, context) => this.composeReactLayoutPageChildrenForShell(page, context),
		});

		const { documentHtml } = await composeDocumentShell(
			{
				renderComponentWithForeignChildren: (renderInput) =>
					this.renderComponentWithForeignChildren(renderInput),
				appendProcessedDependencies: (...assetGroups) => this.appendProcessedDependencies(...assetGroups),
			},
			{
				primaryComponent: input.view,
				primaryProps: normalizedProps,
				layout: input.layout
					? {
							component: input.layout,
							props: {},
						}
					: undefined,
				layouts: shellLayouts.length > 0 ? shellLayouts : undefined,
				composeChildren,
				htmlTemplate: HtmlTemplate,
				documentProps: {
					metadata,
					pageProps: serializedPageProps,
					...(pageModuleUrl && { pageModuleUrl }),
				},
			},
		);

		this.appendProcessedDependencies(this.getRendererBootstrapDependencies(false));
		const html = await finalizeDocumentShellHtml(this.htmlTransformer, {
			html: `${this.DOC_TYPE}${documentHtml}`,
			partial: false,
			documentAttributes: this.getRouterDocumentAttributes(),
			htmlContributions: this.pagePayloadService.buildNonReactDocumentContributions({
				htmlTemplate: HtmlTemplate,
				pageProps: serializedPageProps as Record<string, unknown>,
				pageModuleUrl,
				reactIntegrationName: this.name,
				routerEnabled: Boolean(this.routerAdapter),
			}),
		});

		return this.createHtmlResponse(html, input.ctx);
	}

	/**
	 * Renders an arbitrary React view through the application's HTML shell.
	 *
	 * Unlike route rendering, this path starts from a single component rather than a
	 * page module discovered by the router. It still needs to resolve metadata,
	 * layout dependencies, and hydration assets so direct `ctx.render()` calls match
	 * normal page responses.
	 */
	async renderToResponse<P = Record<string, unknown>>(
		view: EcoComponent<P>,
		props: P,
		ctx: RenderToResponseContext,
	): Promise<Response> {
		try {
			const layouts = view.config?.layouts;
			return await this.renderViewWithDocumentShell({
				view,
				props,
				ctx,
				layout: layouts?.[layouts.length - 1],
			});
		} catch (error) {
			throw this.createRenderError('Failed to render view', error);
		}
	}
}
