/**
 * This module contains the abstract class for the Integration Renderer
 * Every integration renderer should extend this class
 * @module
 */

import type { EcoPagesAppConfig, IHmrManager, InternalComponentRenderInput } from '../../config/internal-types.ts';
import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	EcoFunctionComponent,
	EcoPageFile,
	EcoPagesElement,
	BaseIntegrationContext,
	HtmlTemplateProps,
	IntegrationRendererRenderOptions,
	InternalIntegrationRendererRenderOptions,
	PageBrowserGraphContribution,
	PageBrowserGraphContributionContext,
	PageBrowserGraphDeclaration,
	PageMetadataProps,
	RouteRendererBody,
	RouteRendererOptions,
	RouteRenderResult,
} from '../../types/contracts.ts';
import {
	type AssetDefinition,
	type AssetProcessingService,
	type ProcessedAsset,
} from '../../assets/asset-processing-service/index.ts';
import type { AssetProcessingIntegration } from '../../assets/asset-processing-service/asset-processing-integration.ts';
import { resolveAssetProcessingIntegration } from '../../assets/asset-processing-service/asset-processing-integration.ts';
import { getAssetDependencyKey } from '../../assets/asset-processing-service/asset-dependency-keys.ts';
import { HtmlTransformerService } from '../../html/html-transformer.service.ts';
import type { HtmlDocumentContribution } from '../../html/html-transformer.service.ts';
import { fileSystem } from '@ecopages/file-system';
import { hasProductionServerModule } from '../../build/server/server-modules-manifest.ts';
import { invariant } from '../../utils/invariant.ts';
import { toRootRelativePath } from '../../utils/root-relative-path.ts';
import { HttpError } from '../../errors/http-error.ts';
import { DependencyResolverService } from '../page-loading/dependency-resolver.ts';
import { PageModuleLoaderService } from '../page-loading/page-module-loader.ts';
import { getComponentIdentity } from '../../eco/component-identity.ts';
import { OwnershipValidationService } from './ownership-graph/ownership-validation.service.ts';
import { type PreparedComponentGraph, type PreparedComponentGraphNode } from './ownership-graph/component-graph.ts';
import { collectComponentGraphWatchPaths } from './ownership-graph/component-graph-collectors.ts';
import { assertComponentInPreparedGraph } from './ownership-graph/prepared-graph-membership.ts';
import {
	collectPageClientPlan,
	collectPageClientPlanFromGraph,
	planCoversComponents,
	planHasForeignChildDescendants,
	uniqueIslandIntegrationNames,
	type PageClientBrowserAssets,
	type PageClientBuildEntry,
	type PageClientPlan,
} from './ownership-graph/page-client-plan.ts';
import { buildPageClientBrowserAssets } from './ownership-graph/page-client-browser-assets.ts';
import {
	finalizeComponentRender,
	getComponentRenderContext,
	runWithComponentRenderContext,
} from '../../eco/component-render-context.ts';
import { createRenderSession, type RouteRenderContextState } from './foreign-child/render-session.ts';
import {
	RouteRenderOrchestrator,
	type PlannedRoutePreparation,
	type RouteHtmlFinalization,
	type RouteRenderOrchestratorResolvedInputs,
} from './route-pipeline/route-render-orchestrator.ts';
import { buildRouteHtmlFinalization } from './route-pipeline/route-html-finalization.service.ts';
import {
	resolvePageDependenciesFromContext,
	type ResolvedPageDependencies,
} from '../page-loading/resolved-page-dependencies.ts';
import type {
	GroupedGraphBuildPlan,
	PlannedPageClientBuildEntry,
} from './page-browser-graph/grouped-graph-build-plan.ts';
import type { ForeignChildInterceptionInput, ForeignChildRuntime } from '../../eco/component-render-context.ts';
import { normalizeUnresolvedMarkerArtifactHtml } from './route-pipeline/marker-artifact.utils.ts';
import { isMarkupNodeLike } from '../../eco/component-render-output.ts';
import {
	getForeignSubtreeResolutionContextKey,
	getForeignSubtreeTokenPrefix,
	resolveOwningIntegrationRenderer,
} from './foreign-child/owning-renderer-resolution.ts';
import { ensureIntegrationRuntimeReady } from '../../build/app-build-manifest-runtime.ts';
import {
	createQueuedRuntime,
	executeComponentRender,
	getQueuedRuntimeContext,
	resolveQueuedHtml,
	resolveStringQueuedHtml,
	type ForeignSubtreeExecutionOwningRenderer,
	type QueuedForeignSubtreeResolutionContext,
	type RenderQueuedForeignSubtreeChildren,
} from './foreign-child/foreign-subtree-execution.service.ts';
import {
	renderPageDocumentShell,
	type DocumentShellComposeChildrenHook,
	type DocumentShellLayoutInput,
} from './document-shell/document-shell-render.service.ts';
import {
	resolveInnermostPageLayout,
	resolvePageLayoutComponents,
	resolveDocumentShellLayouts,
} from './document-shell/layout-shell-props.service.ts';
import { finalizeIslandComponentRender } from '../../islands/island-host.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import { prepareAssetDependencies } from '../../assets/asset-processing-service/asset-processing.service.ts';
import { isBundleableScript } from '../../assets/asset-processing-service/bundleable-script.ts';
import { isProductionRuntime } from '../../utils/runtime.ts';

/**
 * Controls how one route module is loaded outside the normal render path.
 */
export type RouteModuleLoadOptions = {
	bypassCache?: boolean;
};

const syntheticExplicitViewKeys = new WeakMap<object, string>();
let nextSyntheticExplicitViewKey = 0;

/**
 * Stable route key for an explicit view that has no identity file.
 *
 * @remarks
 * Caches keyed by route file, such as the page browser graph, must not treat two such views as one
 * route, so each view object gets its own key.
 */
function getSyntheticExplicitViewKey(integrationName: string, view: object): string {
	let key = syntheticExplicitViewKeys.get(view);
	if (!key) {
		key = `explicit:${integrationName}:${(nextSyntheticExplicitViewKey += 1)}`;
		syntheticExplicitViewKeys.set(view, key);
	}
	return key;
}

/**
 * Response options for an explicit view render.
 */
export interface ExplicitViewResponseOptions {
	partial?: boolean;
	status?: number;
	headers?: HeadersInit;
}

/**
 * Request data an explicit view render forwards to the route pipeline.
 */
export type ExplicitViewRenderContext = ExplicitViewResponseOptions &
	Partial<Pick<RouteRendererOptions, 'params' | 'query' | 'locals' | 'file'>>;

export type HtmlDocumentContributionContext<C = EcoPagesElement> = {
	renderOptions?: IntegrationRendererRenderOptions<C>;
	partial?: boolean;
};

export type {
	PageBrowserGraphContribution,
	PageBrowserGraphContributionContext,
	PageBrowserGraphDeclaration,
} from '../../types/contracts.ts';
export {
	selectHydrationIslandEntries,
	type PageClientBrowserAssets,
	type PageClientBuildEntry,
	type PageClientPlan,
} from './ownership-graph/page-client-plan.ts';
export type { HtmlDocumentContribution } from '../../html/html-transformer.service.ts';

export type IntegrationRendererHooks = {
	renderComponent?: (input: ComponentRenderInput) => Promise<ComponentRenderResult>;
	renderQueuedChildren?: RenderQueuedForeignSubtreeChildren<QueuedForeignSubtreeResolutionContext>;
	normalizeForeignChildProps?: (input: ForeignChildInterceptionInput) => Record<string, unknown>;
	composeChildren?: (input: {
		page: { component: EcoComponent; props: Record<string, unknown> };
		layouts: DocumentShellLayoutInput[];
		foreignChildRoots?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>;
	}) => DocumentShellComposeChildrenHook | undefined;
	normalizePageModule?: <TPageModule extends EcoPageFile>(file: string, module: TPageModule) => TPageModule;
	/**
	 * Names what one Page adds to its Page Browser Graph.
	 *
	 * @remarks
	 * The production prebuild calls it while it plans routes, before the app-wide browser build exists, so it must
	 * process nothing: return components and scripts in `components` and `bundledScripts`, and core processes
	 * them when it resolves the graph and plans their scripts for the app-wide build.
	 */
	collectPageBrowserGraphContribution?: (
		context: PageBrowserGraphContributionContext,
	) => Promise<PageBrowserGraphDeclaration | undefined>;
	documentContributions?: <C>(context: HtmlDocumentContributionContext<C>) => HtmlDocumentContribution[] | undefined;
	documentAttributes?: <C>(renderOptions: IntegrationRendererRenderOptions<C>) => Record<string, string> | undefined;
	/** Supplies an Integration-specific browser page payload or top-level document props. */
	documentShellProps?: <C>(renderOptions: IntegrationRendererRenderOptions<C>) => {
		pageProps?: Record<string, unknown>;
		documentProps?: Record<string, unknown>;
	};
	/** Builds this Integration's island and lazy-entry assets for the grouped page browser plan. */
	buildIslandClientAssets?: (plan: PageClientPlan) => Promise<PageClientBrowserAssets>;
	/** Collects this Integration's raw island entries for a static production app browser build. */
	collectAppBrowserClientBuildEntries?: (plan: PageClientPlan) => Promise<PageClientBuildEntry[]>;
	beforeRender?: <C>(options: IntegrationRendererRenderOptions<C>) => Promise<void>;
	beforeImportPageModule?: (file: string) => Promise<void>;
	transformDocumentHtml?: (html: string) => string;
	/**
	 * Optional wrapper around the route render, for scoping such as HMR ownership.
	 * @remarks Core already wraps whatever this throws with `createRenderError('Error rendering page')`,
	 * keeping the original error as `cause` and passing an `HttpError` through. Do not catch and re-wrap.
	 */
	renderRoute?: <C>(
		renderOptions: IntegrationRendererRenderOptions<C>,
		render: () => Promise<RouteRendererBody>,
	) => Promise<RouteRendererBody>;
	/** Reconciles integration-owned document markup after core transforms the response. */
	finalizeDocument?: <C>(
		body: RouteRendererBody,
		renderOptions: IntegrationRendererRenderOptions<C>,
	) => Promise<RouteRendererBody> | RouteRendererBody;
	renderRemote?: (options: RouteRendererOptions) => Promise<RouteRenderResult | undefined>;
};

export type IntegrationRendererOptions = {
	appConfig: EcoPagesAppConfig;
	assetProcessingService: AssetProcessingService;
	assetProcessingIntegration?: AssetProcessingIntegration;
	resolvedIntegrationDependencies?: ProcessedAsset[];
	/** Supplies Integration hooks that override or compose with renderer class defaults. */
	hooks?: IntegrationRendererHooks | IntegrationRendererHookFactory;
};

/** Options available while creating one renderer's Integration hooks. */
export type IntegrationRendererHookFactoryOptions = Omit<IntegrationRendererOptions, 'hooks'> & {
	hooks?: IntegrationRendererHooks;
	/** Resolves component assets with this renderer's dependency rules and active render session. */
	resolveDependencies: (
		components: (EcoComponent | Partial<EcoComponent>)[],
		options?: { preparedGraph?: true },
	) => Promise<ProcessedAsset[]>;
	/** Resolves a declared component asset relative to its owning component file. */
	resolveDependencyPath: (componentDir: string, pathUrl: string) => string;
	/** Resolves lazy client triggers from processed assets using the current render session. */
	applyPendingLazyTriggers: (
		assets: ProcessedAsset[],
		configs: PageClientPlan['lazyConfigs'],
	) => PageClientBrowserAssets['lazyTriggers'];
};

/** Creates the optional hooks for one app-owned renderer instance. */
export type IntegrationRendererHookFactory = (
	options: IntegrationRendererHookFactoryOptions,
) => IntegrationRendererHooks;

type IntegrationRendererConstructionOptions = Omit<IntegrationRendererOptions, 'hooks'> & {
	hooks?: IntegrationRendererHooks | IntegrationRendererHookFactory;
};

/** One route instance the production build plans: a Page with its Params, a route template or a view. */
export type PlannedRouteInstance = {
	routeFile: string;
	params?: RouteRendererOptions['params'];
	query?: RouteRendererOptions['query'];
	skipStaticProps?: RouteRendererOptions['skipStaticProps'];
	isRouteTemplate?: boolean;
};

/** One renderer's production routes: what they need from the app-wide browser build, and how to prepare them. */
export type ProductionRoutesPlan = {
	plan: GroupedGraphBuildPlan;
	/**
	 * Processes every planned route's dependencies once the app-wide browser build recorded its outputs.
	 *
	 * @remarks
	 * It reuses the inputs planning resolved, so no data hook runs again, and renders nothing. Every dependency
	 * it processes is recorded in the asset ledger, which is what `ecopages start` serves the route from.
	 */
	prepare: () => Promise<void>;
	/** Each planned instance with its preparation, which the build's static export renders the instance with. */
	preparations: ReadonlyArray<{ instance: PlannedRouteInstance; preparation: PlannedRoutePreparation }>;
};

type PlannedRoute = {
	instance: PlannedRouteInstance;
	routeOptions: RouteRendererOptions;
	preparation: PlannedRoutePreparation;
	bundledScripts: AssetDefinition[];
	pageClientEntries: PlannedPageClientBuildEntry[];
};

/**
 * The IntegrationRenderer class is an abstract class that provides a base for rendering integration-specific components in the EcoPages framework.
 * It handles the import of page files, collection of dependencies, and preparation of render options.
 * The class is designed to be extended by specific integration renderers.
 */
export abstract class IntegrationRenderer<C = EcoPagesElement> {
	abstract name: string;
	protected appConfig: EcoPagesAppConfig;
	protected assetProcessingService: AssetProcessingService;
	protected assetProcessingIntegration?: AssetProcessingIntegration;
	protected htmlTransformer: HtmlTransformerService;
	protected hmrManager?: IHmrManager;
	protected resolvedIntegrationDependencies: ProcessedAsset[] = [];
	declare protected options: Required<InternalIntegrationRendererRenderOptions>;
	protected dependencyResolverService: DependencyResolverService;
	protected pageModuleLoaderService: PageModuleLoaderService;
	protected routeRenderOrchestrator: RouteRenderOrchestrator;
	protected integrationHooks: IntegrationRendererHooks;

	protected DOC_TYPE = '<!DOCTYPE html>';

	protected getActiveHmrManager(): IHmrManager | undefined {
		return this.appConfig.appRuntime?.hmr ?? this.hmrManager;
	}

	protected getAssetProcessingIntegration(name: string = this.name): AssetProcessingIntegration | undefined {
		return resolveAssetProcessingIntegration(name, this.assetProcessingIntegration, this.appConfig.integrations);
	}

	/**
	 * Activates the owning integration runtime on first render or graph use.
	 */
	protected async ensureIntegrationRuntimeActivated(): Promise<void> {
		await ensureIntegrationRuntimeReady({
			appConfig: this.appConfig,
			integrationName: this.name,
		});
		const integration = this.appConfig.integrations?.find((entry) => entry.name === this.name);
		if (integration?.getResolvedIntegrationDependencies) {
			this.resolvedIntegrationDependencies = integration.getResolvedIntegrationDependencies();
		}
	}

	/**
	 * Plans the supplied production route instances without processing any of their assets.
	 *
	 * @remarks
	 * When `onRouteFailure` is provided, failed route instances are reported and left out of the plan. Without it, a
	 * route failure rejects the operation. Returns nothing when no instance could be planned.
	 */
	public async planProductionRoutes(
		instances: ReadonlyArray<PlannedRouteInstance>,
		options?: {
			onRouteFailure?: (routeInstance: PlannedRouteInstance, error: unknown) => void;
		},
	): Promise<ProductionRoutesPlan | undefined> {
		await this.ensureIntegrationRuntimeActivated();
		const plannedRoutes = (
			await Promise.all(
				instances.map(async (routeInstance) => {
					try {
						return await this.planRouteInstance(routeInstance);
					} catch (error) {
						if (!options?.onRouteFailure) throw error;
						options.onRouteFailure(routeInstance, error);
						return undefined;
					}
				}),
			)
		).filter((route) => route !== undefined);
		if (plannedRoutes.length === 0) return undefined;

		const bundledScripts = new Map<string, AssetDefinition>();
		for (const script of plannedRoutes.flatMap((route) => route.bundledScripts)) {
			bundledScripts.set(getAssetDependencyKey(script, this.appConfig.rootDir), script);
		}
		return {
			plan: {
				integrationName: this.name,
				bundledScripts: [...bundledScripts.values()],
				pageClientEntries: plannedRoutes.flatMap((route) => route.pageClientEntries),
			},
			prepare: async () => {
				for (const { routeOptions, preparation } of plannedRoutes) {
					await this.runInRenderSession(() =>
						this.routeRenderOrchestrator.prepareRenderOptions(routeOptions, this, preparation),
					);
				}
			},
			preparations: plannedRoutes.map(({ instance, preparation }) => ({ instance, preparation })),
		};
	}

	/**
	 * Plans one route instance without processing any of its assets.
	 *
	 * @remarks
	 * The scripts the route's render would bundle, from the shell, the page Dependencies, the Page Browser Graph
	 * dependencies and the components and scripts its contribution names, go to `bundledScripts`, prepared as asset
	 * processing prepares them. Browser runtime assets keep their fixed URLs and stay out of the app-wide build.
	 */
	private async planRouteInstance(routeInstance: PlannedRouteInstance): Promise<PlannedRoute> {
		const routeOptions: RouteRendererOptions = {
			file: routeInstance.routeFile,
			params: routeInstance.params,
			query: routeInstance.query,
			skipStaticProps: routeInstance.skipStaticProps,
		};
		const resolvedInputs = await this.resolveRouteRenderInputs(routeOptions, {
			skipMetadata: routeInstance.isRouteTemplate,
		});
		const graphContext = await this.routeRenderOrchestrator.prepareRouteGraphContext({
			routeOptions,
			resolvedInputs,
			props: resolvedInputs.props,
			renderer: this,
			planning: true,
		});
		this.prepareGraphLazyClientDependencies(graphContext.graph);
		const pageClientEntries = await this.collectAppBrowserClientBuildEntries(
			collectPageClientPlanFromGraph(graphContext.graph),
		);
		const contribution = await this.integrationHooks.collectPageBrowserGraphContribution?.(
			graphContext.graphContext,
		);
		const integration = this.getAssetProcessingIntegration();
		const bundledScripts = [
			...this.dependencyResolverService.collectBundleableScripts(
				graphContext.shellDependencyComponents,
				this.name,
				true,
			),
			...this.dependencyResolverService.collectBundleableScripts(
				graphContext.pageDependencyNodes.map((node) => node.component),
				this.name,
				true,
			),
			...this.dependencyResolverService.collectBundleableScripts(
				[...(contribution?.components ?? [])],
				this.name,
				false,
			),
			...prepareAssetDependencies(
				[...(contribution?.dependencies ?? []), ...(contribution?.bundledScripts ?? [])],
				integration,
				this.appConfig.rootDir,
			).filter((dependency) => isBundleableScript(dependency) && dependency.packageRole !== 'runtime'),
		];
		return {
			instance: routeInstance,
			routeOptions,
			preparation: { resolvedInputs, graphContext },
			bundledScripts,
			pageClientEntries,
		};
	}

	private async runInRenderSession<T>(run: () => Promise<T>): Promise<T> {
		const session = createRenderSession(this.resolvedIntegrationDependencies);
		const { value } = await runWithComponentRenderContext(
			{
				currentIntegration: this.name,
				renderState: { session },
			},
			run,
		);
		return value;
	}

	/**
	 * Loads one route module through the owning renderer's import path.
	 *
	 * Request-time infrastructure may need page metadata such as cache strategy or
	 * middleware before full rendering starts. Exposing this narrow entrypoint lets
	 * those callers reuse integration-specific import setup instead of bypassing it
	 * with raw transpiler access.
	 */
	public async loadPageModule(file: string, options?: RouteModuleLoadOptions): Promise<EcoPageFile> {
		return this.importPageFile(file, options);
	}

	public setHmrManager(hmrManager: IHmrManager) {
		this.hmrManager = hmrManager;
		if (this.assetProcessingService) {
			this.assetProcessingService.setHmrManager(hmrManager);
		}
	}

	/**
	 * Build response headers with optional custom headers.
	 * @param contentType - The Content-Type header value
	 * @param customHeaders - Optional custom headers to merge
	 * @returns Headers object
	 */
	protected buildHeaders(contentType: string, customHeaders?: HeadersInit): Headers {
		const headers = new Headers({ 'Content-Type': contentType });
		if (customHeaders) {
			const incoming = new Headers(customHeaders);
			incoming.forEach((value, key) => headers.set(key, value));
		}
		return headers;
	}

	/**
	 * Create an HTML Response.
	 * @param body - Response body (string or ReadableStream)
	 * @param ctx - Render context with status and headers
	 * @returns Response object
	 */
	protected createHtmlResponse(body: BodyInit, ctx: ExplicitViewResponseOptions): Response {
		return new Response(body, {
			status: ctx.status ?? 200,
			headers: this.buildHeaders('text/html; charset=utf-8', ctx.headers),
		});
	}

	/**
	 * Create an HttpError for unexpected render failures.
	 * @param message - Error message
	 * @param cause - Original error if available
	 * @returns The original HttpError when the cause is already one, otherwise a 500 HttpError that keeps the
	 * original failure as `cause`
	 * @remarks HttpError from pages (for example NotFound from content lookup) must keep its
	 * status so the request matcher can serve a 404 instead of a 500.
	 */
	protected createRenderError(message: string, cause?: unknown): HttpError {
		if (HttpError.isHttpError(cause)) {
			return cause;
		}
		const errorMessage = cause instanceof Error ? `${message}: ${cause.message}` : message;
		return HttpError.InternalServerError(errorMessage, { cause });
	}

	/**
	 * Renders a route page through optional layout and document shells.
	 *
	 * Route rendering and explicit view rendering now share the same renderer-owned
	 * shell composition model. This helper composes page, layout, and html template
	 * renders while threading one execution-scoped renderer cache through every
	 * delegated foreign subtree so foreign shell ownership remains stable and renderer
	 * initialization is reused inside the current request.
	 *
	 * @param input - Page, layout, document, and metadata inputs for the route render.
	 * @returns Final serialized document HTML including the doctype prefix.
	 */
	protected async renderPageWithDocumentShell(input: {
		page: {
			component: EcoComponent;
			props: Record<string, unknown>;
		};
		layout?: {
			component: EcoComponent;
			props?: Record<string, unknown>;
		};
		layouts?: DocumentShellLayoutInput[];
		htmlTemplate: EcoComponent;
		metadata: PageMetadataProps;
		pageProps: Record<string, unknown>;
		documentProps?: Record<string, unknown>;
		transformDocumentHtml?: (html: string) => string;
		foreignChildRoots?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>;
	}): Promise<string> {
		const layouts = input.layouts ?? (input.layout ? [input.layout] : []);
		const composeChildren = this.integrationHooks.composeChildren?.({
			page: input.page,
			layouts,
			foreignChildRoots: input.foreignChildRoots,
		});

		return renderPageDocumentShell(
			{
				renderComponentWithForeignChildren: (renderInput) =>
					this.renderComponentWithForeignChildren(renderInput),
			},
			{ ...input, layouts, composeChildren },
			this.DOC_TYPE,
		);
	}

	private serializeStringRenderChildren(children: ComponentRenderInput['children']): string | undefined {
		if (children === undefined) {
			return undefined;
		}

		if (typeof children === 'string') {
			return children;
		}

		if (isMarkupNodeLike(children) && typeof children.outerHTML === 'string') {
			return children.outerHTML;
		}

		return undefined;
	}

	private assertStringRenderChildren(input: ComponentRenderInput, serializedChildren: string | undefined): void {
		if (input.children === undefined || serializedChildren !== undefined) {
			return;
		}

		const componentFile = input.component.config?.identity?.file ?? 'unknown component';
		const childTag = Object.prototype.toString.call(input.children);

		throw new TypeError(
			`[ecopages] ${this.name} renderer expected serialized children for ${componentFile}, received ${childTag}.`,
		);
	}

	private assertStringRenderContent(input: ComponentRenderInput, content: EcoPagesElement): void {
		if (typeof content === 'string') {
			return;
		}

		const componentFile = input.component.config?.identity?.file ?? 'unknown component';
		const contentTag = Object.prototype.toString.call(content);

		throw new TypeError(
			`[ecopages] ${this.name} renderer expected a string render result for ${componentFile}, received ${contentTag}.`,
		);
	}

	protected async renderStringComponentWithSerializedChildren(
		input: ComponentRenderInput,
		component: (props: Record<string, unknown>) => Promise<EcoPagesElement> | EcoPagesElement,
	): Promise<ComponentRenderResult> {
		const serializedChildren = this.serializeStringRenderChildren(input.children);
		this.assertStringRenderChildren(input, serializedChildren);

		const props = serializedChildren === undefined ? input.props : { ...input.props, children: serializedChildren };
		const content = await component(props);
		this.assertStringRenderContent(input, content);

		return {
			html: content as string,
			canAttachAttributes: true,
			integrationName: this.name,
		};
	}

	/**
	 * Renders a string-first component, then resolves any queued foreign
	 * boundaries before returning final component HTML.
	 */
	protected async renderStringComponentWithQueuedForeignSubtrees(
		input: ComponentRenderInput,
		component: (props: Record<string, unknown>) => Promise<EcoPagesElement> | EcoPagesElement,
	): Promise<ComponentRenderResult> {
		const componentRender = await this.renderStringComponentWithSerializedChildren(input, component);
		const resolvedRender = await this.resolveQueuedForeignChildren(input, componentRender);
		return this.finalizeIslandComponentRender(input, resolvedRender);
	}

	private async resolveQueuedForeignChildren(
		input: ComponentRenderInput,
		componentRender: ComponentRenderResult,
	): Promise<ComponentRenderResult> {
		const queuedOptions = {
			currentIntegrationName: this.name,
			html: componentRender.html,
			runtimeContext: this.getQueuedForeignSubtreeContext(input),
			getOwningRenderer: (
				integrationName: string,
				rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>,
			) => this.resolveOwningRenderer(integrationName, rendererCache),
		};
		const html = this.integrationHooks.renderQueuedChildren
			? await resolveQueuedHtml({
					...queuedOptions,
					renderQueuedChildren: this.integrationHooks.renderQueuedChildren,
				})
			: await resolveStringQueuedHtml(queuedOptions);

		return { ...componentRender, html };
	}

	constructor({
		appConfig,
		assetProcessingService,
		assetProcessingIntegration,
		resolvedIntegrationDependencies,
		hooks,
	}: IntegrationRendererConstructionOptions) {
		this.appConfig = appConfig;
		this.assetProcessingService = assetProcessingService;
		this.assetProcessingIntegration = assetProcessingIntegration;
		this.htmlTransformer = new HtmlTransformerService();
		this.resolvedIntegrationDependencies = resolvedIntegrationDependencies || [];
		this.dependencyResolverService = new DependencyResolverService(
			appConfig,
			assetProcessingService,
			() => isProductionRuntime() && this.getActiveHmrManager()?.isEnabled() !== true,
			assetProcessingIntegration,
		);
		this.pageModuleLoaderService = new PageModuleLoaderService(appConfig);
		this.routeRenderOrchestrator = new RouteRenderOrchestrator(appConfig, assetProcessingService, {
			ownershipValidationService: new OwnershipValidationService(appConfig),
			assetProcessingIntegration,
		});
		this.integrationHooks =
			typeof hooks === 'function'
				? hooks({
						appConfig,
						assetProcessingService,
						assetProcessingIntegration,
						resolvedIntegrationDependencies,
						hooks: {},
						resolveDependencies: (components, options) => this.resolveDependencies(components, options),
						resolveDependencyPath: (componentDir, pathUrl) =>
							this.resolveDependencyPath(componentDir, pathUrl),
						applyPendingLazyTriggers: (assets, configs) =>
							this.dependencyResolverService.applyPendingLazyTriggers(assets, configs),
					})
				: (hooks ?? {});
	}

	/**
	 * Returns the HTML template component.
	 * It imports the HTML template from the specified path in the app configuration.
	 *
	 * @returns The HTML template component.
	 */
	protected async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		const htmlTemplatePath = this.appConfig.absolutePaths.htmlTemplatePath;
		const htmlTemplateKey = toRootRelativePath(this.appConfig.rootDir, htmlTemplatePath);
		invariant(
			fileSystem.exists(htmlTemplatePath) || hasProductionServerModule(this.appConfig, htmlTemplatePath),
			`Missing Html template: expected ${htmlTemplateKey.replace(/\.[^./]+$/, '.<ext>')} but no such file exists. Add that file (for example ${htmlTemplateKey}) with the app's Html template as its default export.`,
		);
		try {
			const { default: HtmlTemplate } = await this.importPageFile(htmlTemplatePath);
			return HtmlTemplate as EcoComponent<HtmlTemplateProps>;
		} catch (error) {
			invariant(false, `Error importing HtmlTemplate: ${error}`, { cause: error });
		}
	}

	protected normalizeImportedPageFile<TPageModule extends EcoPageFile>(
		file: string,
		pageModule: TPageModule,
	): TPageModule {
		return this.integrationHooks.normalizePageModule?.(file, pageModule) ?? pageModule;
	}

	/**
	 * Imports the page file from the specified path.
	 *
	 * @param file - The file path to import.
	 * @returns The imported module.
	 */
	protected async importPageFile(file: string, options?: RouteModuleLoadOptions): Promise<EcoPageFile> {
		await this.integrationHooks.beforeImportPageModule?.(file);
		const pageModule = await this.pageModuleLoaderService.importPageFile(file, {
			bypassCache: options?.bypassCache,
		});

		return this.normalizeImportedPageFile(file, pageModule);
	}

	/**
	 * Resolves the dependency path based on the component directory.
	 * It combines the component directory with the provided path URL.
	 *
	 * @param componentDir - The component directory path.
	 * @param pathUrl - The path URL to resolve.
	 * @returns The resolved dependency path.
	 */
	protected resolveDependencyPath(componentDir: string, pathUrl: string): string {
		return this.dependencyResolverService.resolveDependencyPath(componentDir, pathUrl);
	}

	/**
	 * Collects the dependencies for the provided components.
	 * Combines component-specific dependencies with global integration dependencies.
	 *
	 * @param components - The components to collect dependencies from.
	 */
	protected async resolveDependencies(
		components: (EcoComponent | Partial<EcoComponent>)[],
		options?: { preparedGraph?: true },
	): Promise<ProcessedAsset[]> {
		const componentDeps = await this.processComponentDependencies(components, options);
		return this.prependResolvedIntegrationDependencies(componentDeps);
	}

	private prependResolvedIntegrationDependencies(componentDependencies: ProcessedAsset[]): ProcessedAsset[] {
		const integrationDependencies =
			getComponentRenderContext<RouteRenderContextState>()?.renderState?.session
				?.resolvedIntegrationDependencies ?? this.resolvedIntegrationDependencies;
		return integrationDependencies.concat(componentDependencies);
	}

	/**
	 * Processes component-specific dependencies WITHOUT prepending global integration dependencies.
	 * Use this method when you need only the component's own assets.
	 *
	 * @param components - The components to collect dependencies from.
	 */
	protected async processComponentDependencies(
		components: (EcoComponent | Partial<EcoComponent>)[],
		options?: { preparedGraph?: true },
	): Promise<ProcessedAsset[]> {
		if (options?.preparedGraph) {
			return this.dependencyResolverService.processPreparedComponentDependencies(components, this.name);
		}

		return this.dependencyResolverService.processComponentDependencies(components, this.name);
	}

	getRouteHtmlFinalization(renderOptions: InternalIntegrationRendererRenderOptions<C>): RouteHtmlFinalization {
		return buildRouteHtmlFinalization({
			appConfig: this.appConfig,
			watch: this.getActiveHmrManager()?.isEnabled() === true,
			integrationName: this.name,
			renderOptions,
			getDocumentAttributes: (options) => this.getDocumentAttributes(options),
			getHtmlDocumentContributions: (options) => this.getHtmlDocumentContributions(options),
			applyAttributesToHtmlElement: (html, attributes) => this.applyAttributesToHtmlElement(html, attributes),
		});
	}

	async transformRouteResponse(
		response: Response,
		htmlContributions: HtmlDocumentContribution[] | undefined,
		renderOptions: InternalIntegrationRendererRenderOptions<C>,
	): Promise<RouteRendererBody> {
		const transformedResponse = this.htmlTransformer.transform(response, {
			contributions: htmlContributions,
			pagePackage: renderOptions.pagePackage,
		});
		const body = (transformedResponse.body ?? (await transformedResponse.text())) as RouteRendererBody;
		return this.finalizeDocument(body, renderOptions);
	}

	protected finalizeDocument(
		body: RouteRendererBody,
		renderOptions: IntegrationRendererRenderOptions<C>,
	): Promise<RouteRendererBody> | RouteRendererBody {
		return this.integrationHooks.finalizeDocument?.(body, renderOptions) ?? body;
	}

	async resolveRouteRenderInputs(
		routeOptions: RouteRendererOptions,
		options?: { skipMetadata?: boolean },
	): Promise<RouteRenderOrchestratorResolvedInputs> {
		const resolvedPageModule = await this.pageModuleLoaderService.resolvePageModule({
			file: routeOptions.file,
			pageModule: routeOptions.pageModule,
			importPageFileFn: (targetFile) => this.importPageFile(targetFile),
		});
		const { Page, integrationSpecificProps, module: pageModule } = resolvedPageModule;
		const HtmlTemplate = await this.getHtmlTemplate();
		const Layouts = resolvePageLayoutComponents(Page.config?.layouts);
		const Layout = resolveInnermostPageLayout(Layouts);
		const { props, metadata } = await this.pageModuleLoaderService.resolvePageData({
			pageModule: resolvedPageModule,
			routeOptions,
			skipMetadata: options?.skipMetadata,
		});

		return {
			Page,
			pageModule,
			HtmlTemplate: HtmlTemplate as EcoComponent<HtmlTemplateProps>,
			Layouts,
			Layout,
			layoutEntries: Page.config?.layoutEntries,
			props,
			metadata,
			integrationSpecificProps,
		};
	}

	async resolvePageDependencyContribution(input: {
		nodes: ReadonlyArray<PreparedComponentGraphNode>;
		ownerFile: string;
	}): Promise<PageBrowserGraphContribution | undefined> {
		if (input.nodes.length === 0) {
			return undefined;
		}

		return {
			assets: await this.processComponentDependencies(
				input.nodes.map((node) => node.component),
				{ preparedGraph: true },
			),
			watchPaths: collectComponentGraphWatchPaths(input.nodes, [input.ownerFile]),
		};
	}

	async resolvePageDependenciesForRoute(
		context: PageBrowserGraphContributionContext,
	): Promise<ResolvedPageDependencies | undefined> {
		return resolvePageDependenciesFromContext(context, this.name);
	}

	async resolveRouteDependencies(input: {
		components: (EcoComponent | Partial<EcoComponent>)[];
	}): Promise<{ resolvedDependencies: ProcessedAsset[] }> {
		return {
			resolvedDependencies: await this.resolveDependencies(input.components, { preparedGraph: true }),
		};
	}

	async renderRouteBody(renderOptions: InternalIntegrationRendererRenderOptions<C>): Promise<RouteRendererBody> {
		return this.render(renderOptions);
	}

	/**
	 * Prepares the render options for the integration renderer.
	 * It imports the page file, collects dependencies, and prepares the render options.
	 *
	 * @param options - The route renderer options.
	 * @param planned - The preparation the production build planned for this route, which skips its data hooks.
	 * @returns The prepared render options.
	 */
	protected async prepareRenderOptions(
		options: RouteRendererOptions,
		planned?: PlannedRoutePreparation,
	): Promise<InternalIntegrationRendererRenderOptions<C>> {
		const renderOptions = await this.routeRenderOrchestrator.prepareRenderOptions(options, this, planned);
		invariant(renderOptions.pagePackage !== undefined, 'Expected render preparation to produce a page package');
		return renderOptions;
	}

	/**
	 * Executes the integration renderer with the provided options.
	 *
	 * Execution flow:
	 * 1. Build normalized render options (`prepareRenderOptions`).
	 * 2. Render the route body once.
	 * 3. Reject unresolved route-level eco-marker artifacts.
	 * 4. Optionally apply document attributes for integration-owned document boundaries.
	 * 5. Run HTML transformer with final dependency set.
	 *
	 * Stream-safety note: the first render result is normalized to a string once,
	 * then the pipeline continues with that immutable HTML value to avoid disturbed
	 * response-body errors.
	 *
	 * @param options Route renderer options.
	 * @param planned The preparation `planProductionRoutes` returned for this route, which static export passes so
	 * the route's data hooks run once per build. A remote render ignores it.
	 * @returns Rendered route body plus effective cache strategy.
	 */
	public async execute(options: RouteRendererOptions, planned?: PlannedRoutePreparation): Promise<RouteRenderResult> {
		await this.ensureIntegrationRuntimeActivated();
		const remoteResult = await this.renderRemote(options);
		if (remoteResult) {
			return remoteResult;
		}

		return this.runInRenderSession(async () => {
			const renderOptions = await this.prepareRenderOptions(options, planned);
			const renderState = getComponentRenderContext<RouteRenderContextState>()?.renderState;
			if (renderState) {
				renderState.pageClientPlan = renderOptions.pageClientPlan;
				renderState.preparedGraphComponents = renderOptions.preparedGraphComponents;
			}
			return this.routeRenderOrchestrator.executePrepared(renderOptions, this);
		});
	}

	protected async renderRemote(_options: RouteRendererOptions): Promise<RouteRenderResult | undefined> {
		return this.integrationHooks.renderRemote?.(_options);
	}

	/**
	 * Renders one explicit view through the route pipeline.
	 *
	 * @remarks
	 * A partial render stays on `renderComponentWithForeignChildren` and builds no browser
	 * assets, because a fragment response carries none. A full render
	 * goes through {@link IntegrationRenderer.executeExplicitView}, so it receives the
	 * same layouts, metadata, and client plan as a filesystem Page.
	 */
	async renderExplicitView<P>(view: EcoComponent<P>, props: P, ctx: ExplicitViewRenderContext): Promise<Response> {
		if (ctx.partial) {
			await this.ensureIntegrationRuntimeActivated();
			const session = createRenderSession(this.resolvedIntegrationDependencies);
			const plan = collectPageClientPlan([{ component: view }], this.name);
			const rendererCache = session.rendererCache as BaseIntegrationContext['rendererCache'];
			const { value } = await runWithComponentRenderContext(
				{
					currentIntegration: this.name,
					renderState: { pageClientPlan: plan, session },
				},
				async () => {
					const rendered = await this.renderComponentWithForeignChildren({
						component: view as EcoComponent,
						props: (props ?? {}) as Record<string, unknown>,
						integrationContext: { rendererCache },
					});
					return this.createHtmlResponse(rendered.html, ctx);
				},
			);
			return value;
		}

		const result = await this.executeExplicitView(view, props, ctx);
		return this.createHtmlResponse(result.body as BodyInit, ctx);
	}

	/**
	 * Renders one explicit view as a full document and returns the route result.
	 *
	 * @remarks
	 * `file` is the view's identity file, or a stable synthetic key when the view has
	 * none. `props` are the view's final props: its `staticProps` hook is the caller's
	 * to run, so it is not run here.
	 */
	async executeExplicitView<P>(
		view: EcoComponent<P>,
		props: P,
		ctx: Omit<ExplicitViewRenderContext, 'partial'> = {},
	): Promise<RouteRenderResult> {
		const identity = getComponentIdentity(view);
		return this.execute({
			file: ctx.file ?? identity?.file ?? getSyntheticExplicitViewKey(this.name, view),
			pageModule: { default: view },
			params: ctx.params,
			query: ctx.query,
			locals: ctx.locals,
			props: (props ?? {}) as Record<string, unknown>,
			skipStaticProps: true,
		});
	}

	/**
	 * Returns document-level attributes to stamp onto the rendered `<html>` tag.
	 *
	 * Integrations can override this to expose explicit document ownership or
	 * other runtime coordination markers without relying on script sniffing.
	 */
	protected getDocumentAttributes(
		renderOptions: IntegrationRendererRenderOptions<C>,
	): Record<string, string> | undefined {
		return this.integrationHooks.documentAttributes?.(renderOptions);
	}

	protected applyAttributesToHtmlElement(html: string, attributes: Record<string, string>): string {
		return this.htmlTransformer.applyAttributesToHtmlElement(html, attributes);
	}

	/**
	 * Returns declarative HTML fragments that core should inject into the final document.
	 *
	 * @remarks
	 * Integrations may contribute document markup here, but core retains ownership
	 * of the final HTML rewrite pipeline and placement semantics. This is the
	 * supported document-markup extension point for integrations instead of custom
	 * response finalization logic.
	 */
	protected getHtmlDocumentContributions(
		context: HtmlDocumentContributionContext<C>,
	): HtmlDocumentContribution[] | undefined {
		return this.integrationHooks.documentContributions?.(context);
	}

	/**
	 * Renders the route, wrapping whatever it throws as `Error rendering page`.
	 * Integrations can add preparation and final HTML hooks around core composition.
	 */
	async render(options: IntegrationRendererRenderOptions<C>): Promise<RouteRendererBody> {
		const renderRoute = () => this.renderRouteDocument(options);
		try {
			return await (this.integrationHooks.renderRoute?.(options, renderRoute) ?? renderRoute());
		} catch (error) {
			throw this.createRenderError('Error rendering page', error);
		}
	}

	/**
	 * Renders the route document through the shared document shell.
	 *
	 * @remarks
	 * A subclass with its own document model overrides this rather than `render()`,
	 * so its errors still go through core's wrap.
	 */
	protected async renderRouteDocument(options: IntegrationRendererRenderOptions<C>): Promise<RouteRendererBody> {
		const internalOptions = options as InternalIntegrationRendererRenderOptions<C>;
		await this.beforeRender(options);
		const documentShellProps = this.integrationHooks.documentShellProps?.(options);
		return await this.renderPageWithDocumentShell({
			page: {
				component: options.Page,
				props: {
					...options.props,
					params: options.params ?? {},
					query: options.query ?? {},
					locals: options.pageLocals,
				},
			},
			layouts: resolveDocumentShellLayouts({
				layout: options.Layout,
				layoutEntries: options.layoutEntries,
				params: options.params,
				query: options.query,
				locals: options.locals,
			}),
			htmlTemplate: options.HtmlTemplate,
			metadata: options.metadata,
			pageProps: documentShellProps?.pageProps ?? options.pageProps ?? options.props ?? {},
			documentProps: documentShellProps?.documentProps,
			foreignChildRoots: internalOptions.pageDependencyComponents,
			transformDocumentHtml: (html) => this.transformDocumentHtml(html),
		});
	}

	protected async beforeRender(options: IntegrationRendererRenderOptions<C>): Promise<void> {
		await this.integrationHooks.beforeRender?.(options);
	}

	protected transformDocumentHtml(html: string): string {
		return this.integrationHooks.transformDocumentHtml?.(html) ?? html;
	}

	/**
	 * Renders one component under this integration's foreign-child runtime and resolves
	 * any nested foreign children captured during that render.
	 *
	 * Without this wrapper, a component tree with foreign-owned descendants would
	 * render them with no active foreign-child runtime, which bypasses the owning
	 * renderer's nested foreign-child handoff.
	 */
	async renderComponentWithForeignChildren(input: InternalComponentRenderInput): Promise<ComponentRenderResult> {
		assertComponentInPreparedGraph(
			input.component,
			getComponentRenderContext<RouteRenderContextState>()?.renderState?.preparedGraphComponents,
		);
		return await executeComponentRender({
			currentIntegrationName: this.name,
			input,
			renderComponent: (renderInput) => this.renderComponent(renderInput),
			normalizeComponentRenderOutput: (result) => this.normalizeComponentRenderOutput(result),
			hasForeignChildDescendants: (component, foreignChildRoots) =>
				this.hasForeignChildDescendants(component, foreignChildRoots),
			createForeignChildRuntime: ({ renderInput, rendererCache }) =>
				this.createForeignChildRuntime({
					renderInput,
					rendererCache: rendererCache as Map<string, IntegrationRenderer<any>>,
				}),
			getOwningRenderer: (integrationName, rendererCache) =>
				this.resolveOwningRenderer(integrationName, rendererCache),
		});
	}

	/**
	 * Returns the renderer that owns `integrationName`, reusing `rendererCache`
	 * for the current render.
	 */
	protected resolveOwningRenderer(
		integrationName: string,
		rendererCache: Map<string, ForeignSubtreeExecutionOwningRenderer>,
	): Promise<ForeignSubtreeExecutionOwningRenderer> {
		return resolveOwningIntegrationRenderer({
			appConfig: this.appConfig,
			currentIntegrationName: this.name,
			currentRenderer: this,
			integrationName,
			cache: rendererCache,
		});
	}

	/**
	 * Returns the queued foreign-subtree state this renderer keeps on `input`, or
	 * `undefined` when nothing was queued for it.
	 */
	protected getQueuedForeignSubtreeContext<
		TContext extends QueuedForeignSubtreeResolutionContext = QueuedForeignSubtreeResolutionContext,
	>(input: ComponentRenderInput): TContext | undefined {
		return getQueuedRuntimeContext<TContext>(input, getForeignSubtreeResolutionContextKey(this.name));
	}

	/**
	 * Replaces the foreign-subtree tokens queued while rendering `html` with the
	 * HTML each owning renderer produces.
	 *
	 * @remarks
	 * `renderQueuedChildren` renders a subtree's children inside this renderer
	 * before the owning renderer renders the subtree around them.
	 */
	protected resolveQueuedForeignSubtrees<TContext extends QueuedForeignSubtreeResolutionContext>(
		html: string,
		runtimeContext: TContext | undefined,
		renderQueuedChildren: RenderQueuedForeignSubtreeChildren<TContext>,
	): Promise<string> {
		return resolveQueuedHtml({
			currentIntegrationName: this.name,
			html,
			runtimeContext,
			renderQueuedChildren,
			getOwningRenderer: (integrationName, rendererCache) =>
				this.resolveOwningRenderer(integrationName, rendererCache),
		});
	}

	/**
	 * Stamps `result` as an Island Host when the component itself declares a client script.
	 *
	 * @remarks Reads the component's own declarations, excluding Foreign Children: a component without
	 * scripts that wraps an island is not an island itself. Components without `dependencies` are never stamped.
	 */
	protected finalizeIslandComponentRender(
		input: ComponentRenderInput,
		result: ComponentRenderResult,
	): ComponentRenderResult {
		const ownAssets = input.component.config?.dependencies
			? this.dependencyResolverService.collectOwnComponentDependencies([input.component], this.name)
			: undefined;
		return finalizeIslandComponentRender(
			input,
			{
				...result,
				html: finalizeComponentRender(input.component, result.html),
			},
			ownAssets,
		);
	}

	private normalizeComponentRenderOutput(result: ComponentRenderResult): ComponentRenderResult {
		const normalizedHtml = this.normalizeUnresolvedMarkerArtifactHtml(result.html);

		return normalizedHtml === result.html
			? result
			: {
					...result,
					html: normalizedHtml,
				};
	}

	protected normalizeUnresolvedMarkerArtifactHtml(html: string): string {
		return normalizeUnresolvedMarkerArtifactHtml(html);
	}

	/**
	 * @remarks
	 * The active plan is the page owner's, but it answers for any renderer: a nested renderer of
	 * another Integration asks it about its own Integration, so a React leaf under a Kita page has no
	 * foreign children. A component the plan did not walk gets a plan built for it.
	 */
	protected hasForeignChildDescendants(
		component: EcoComponent,
		foreignChildRoots?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>,
	): boolean {
		const activePlan = getComponentRenderContext<RouteRenderContextState>()?.renderState?.pageClientPlan;
		if (activePlan && planCoversComponents(activePlan, component, foreignChildRoots)) {
			return planHasForeignChildDescendants(activePlan, component, this.name, foreignChildRoots);
		}

		const plan = collectPageClientPlan(
			[component, ...(foreignChildRoots ?? [])].map((root) => ({ component: root })),
			this.name,
		);
		return planHasForeignChildDescendants(plan, component, this.name, foreignChildRoots);
	}

	/**
	 * Returns whether this renderer builds island and lazy-entry scripts in the
	 * app-wide grouped browser build that other page owners should run for the plan.
	 */
	protected contributesAppBrowserClientBuild(): boolean {
		return this.integrationHooks.buildIslandClientAssets !== undefined;
	}

	/**
	 * Builds island and lazy-entry browser assets from the page client plan.
	 *
	 * @remarks
	 * The planning and merging live in `ownership-graph/page-client-browser-assets.ts`; this method
	 * supplies what only the renderer has: the owning renderers of other Integrations and its asset service.
	 * A route render passes `resolveFromAppBuild` to link the entries the app-wide browser build recorded; a plan
	 * contributed by another Integration's page does not.
	 */
	async buildPageClientBrowserAssets(
		plan: PageClientPlan,
		resolveFromAppBuild = false,
	): Promise<PageClientBrowserAssets> {
		const prebuilt = resolveFromAppBuild ? await this.buildPrebuiltPageClientBrowserAssets(plan) : undefined;
		if (prebuilt) return prebuilt;

		const buildAssetsHook = this.integrationHooks.buildIslandClientAssets;
		if (buildAssetsHook) {
			return buildAssetsHook(plan);
		}

		const rendererCache = (getComponentRenderContext<RouteRenderContextState>()?.renderState?.session
			?.rendererCache ?? new Map<string, ForeignSubtreeExecutionOwningRenderer>()) as Map<
			string,
			ForeignSubtreeExecutionOwningRenderer
		>;
		return buildPageClientBrowserAssets({
			plan,
			integrationName: this.name,
			resolveContributor: async (integrationName) => {
				const owning = await this.resolveOwningRenderer(integrationName, rendererCache);
				return owning instanceof IntegrationRenderer
					? {
							contributesAppBrowserClientBuild: () => owning.contributesAppBrowserClientBuild(),
							buildPageClientBrowserAssets: (contributedPlan) =>
								owning.buildPageClientBrowserAssets(contributedPlan),
						}
					: undefined;
			},
			processLazyEntries: (entries) =>
				this.assetProcessingService.processDependencies(entries, this.getAssetProcessingIntegration()),
			applyPendingLazyTriggers: (assets, configs) =>
				this.dependencyResolverService.applyPendingLazyTriggers(assets, configs),
		});
	}

	/**
	 * Resolves the page's island and lazy entries to the outputs the app-wide browser build recorded.
	 *
	 * @remarks
	 * Returns nothing outside a production build or start, or when a bundleable entry is not recorded, so the
	 * Integration builds the entries itself through asset processing, which fails once `ecopages start` sealed
	 * the ledger. Entries the app-wide build does not bundle are processed on their own.
	 */
	private async buildPrebuiltPageClientBrowserAssets(
		plan: PageClientPlan,
	): Promise<PageClientBrowserAssets | undefined> {
		const ledger = requireAppRuntime(this.appConfig).processedAssets;
		if (!ledger.hasBrowserBuild) return undefined;

		const recordedAssets: ProcessedAsset[] = [];
		const unbundledGroups = new Map<string, PageClientBuildEntry['dependency'][]>();
		for (const { dependency, integrationName } of await this.collectAppBrowserClientBuildEntries(plan)) {
			if (!isBundleableScript(dependency)) {
				unbundledGroups.set(integrationName, [...(unbundledGroups.get(integrationName) ?? []), dependency]);
				continue;
			}
			const recorded = ledger.lookup(dependency);
			if (!recorded) return undefined;
			recordedAssets.push(recorded);
		}

		const unbundledAssets = (
			await Promise.all(
				[...unbundledGroups].map(([integrationName, dependencies]) =>
					this.assetProcessingService.processDependencies(
						dependencies,
						this.getAssetProcessingIntegration(integrationName),
					),
				),
			)
		).flat();
		const processedAssets = [...recordedAssets, ...unbundledAssets];
		return {
			processedAssets,
			lazyTriggers: this.dependencyResolverService.applyPendingLazyTriggers(processedAssets, plan.lazyConfigs),
		};
	}

	private async collectAppBrowserClientBuildEntries(
		plan: PageClientPlan,
	): Promise<Array<PageClientBuildEntry & { integrationName: string }>> {
		const entries: Array<PageClientBuildEntry & { integrationName: string }> = [];
		const ownEntries = await this.integrationHooks.collectAppBrowserClientBuildEntries?.(plan);
		if (ownEntries) {
			entries.push(...ownEntries.map((entry) => ({ ...entry, integrationName: this.name })));
		}

		const rendererCache = new Map<string, ForeignSubtreeExecutionOwningRenderer>();
		for (const integrationName of uniqueIslandIntegrationNames(plan)) {
			if (integrationName === this.name) continue;
			const owning = await this.resolveOwningRenderer(integrationName, rendererCache);
			if (!(owning instanceof IntegrationRenderer)) continue;
			const contributed = await owning.integrationHooks.collectAppBrowserClientBuildEntries?.(plan);
			if (contributed) {
				entries.push(...contributed.map((entry) => ({ ...entry, integrationName: owning.name })));
			}
		}

		entries.push(...plan.lazyClientEntries.map((dependency) => ({ dependency, integrationName: this.name })));
		return entries;
	}

	private prepareGraphLazyClientDependencies(graph: PreparedComponentGraph): void {
		const componentsByIntegration = new Map<string, EcoComponent[]>();
		for (const node of graph.nodes) {
			const components = componentsByIntegration.get(node.integrationName) ?? [];
			components.push(node.component);
			componentsByIntegration.set(node.integrationName, components);
		}

		for (const [integrationName, components] of componentsByIntegration) {
			this.dependencyResolverService.prepareLazyClientDependencies(components, integrationName);
		}
	}

	/**
	 * Render a single component and return structured output for orchestration paths.
	 *
	 * @remarks
	 * Core serializes string components and resolves queued foreign children.
	 * Framework integrations override this only when their component output needs
	 * framework-specific rendering or hydration metadata.
	 */
	async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		const renderHook = this.integrationHooks.renderComponent;
		if (renderHook) {
			const resolvedRender = await this.resolveQueuedForeignChildren(input, await renderHook(input));
			return this.finalizeIslandComponentRender(input, resolvedRender);
		}

		if (typeof input.component !== 'function') {
			throw new TypeError(`${this.name} renderer expected a callable component.`);
		}
		return this.renderStringComponentWithQueuedForeignSubtrees(
			input,
			input.component as EcoFunctionComponent<Record<string, unknown>, EcoPagesElement>,
		);
	}

	/**
	 * Collects declarative Page Browser Graph contributions for one Page.
	 *
	 * @remarks
	 * Integrations may describe page-scoped browser requirements here, while core
	 * retains ownership of dependency processing and final graph assembly. This is
	 * the supported page-browser extension point for integrations.
	 *
	 * @param context - The route file path and already imported page module.
	 * @returns The declared dependencies and watch paths, with the declaration's components and bundled scripts
	 * processed into `assets`.
	 */
	async collectPageBrowserGraphContribution(
		context: PageBrowserGraphContributionContext,
	): Promise<PageBrowserGraphContribution | undefined> {
		const declaration = await this.integrationHooks.collectPageBrowserGraphContribution?.(context);
		if (!declaration) return undefined;
		const { components, bundledScripts, dependencies, watchPaths } = declaration;
		const componentAssets = components?.length ? await this.processComponentDependencies([...components]) : [];
		const scriptAssets = bundledScripts?.length
			? await this.assetProcessingService.processDependencies(
					bundledScripts,
					this.getAssetProcessingIntegration(),
				)
			: [];
		const assets = [...componentAssets, ...scriptAssets];
		return { dependencies, watchPaths, ...(assets.length > 0 ? { assets } : {}) };
	}

	/**
	 * Creates the per-render foreign-child runtime adopted by the shared component
	 * render context.
	 *
	 * The default runtime queues delegated foreign subtrees inside the owning
	 * renderer so string and markup renderers do not need to re-declare the same
	 * handoff boilerplate. Override only when a renderer needs custom runtime
	 * context or a different foreign-child execution strategy.
	 */
	protected createForeignChildRuntime(options: {
		renderInput: ComponentRenderInput;
		rendererCache: Map<string, IntegrationRenderer<any>>;
	}): ForeignChildRuntime {
		const runtime = createQueuedRuntime({
			renderInput: options.renderInput,
			rendererCache: options.rendererCache,
			runtimeContextKey: getForeignSubtreeResolutionContextKey(this.name),
			tokenPrefix: getForeignSubtreeTokenPrefix(this.name),
		});
		const normalizeForeignChildProps = this.integrationHooks.normalizeForeignChildProps;
		if (!normalizeForeignChildProps) {
			return runtime;
		}

		const wrapInput = (input: ForeignChildInterceptionInput): ForeignChildInterceptionInput => ({
			...input,
			props: normalizeForeignChildProps(input),
		});
		const interceptForeignChild = runtime.interceptForeignChild;
		const interceptForeignChildSync = runtime.interceptForeignChildSync;

		return {
			interceptForeignChild: interceptForeignChild
				? (input) => interceptForeignChild(wrapInput(input))
				: undefined,
			interceptForeignChildSync: interceptForeignChildSync
				? (input) => interceptForeignChildSync(wrapInput(input))
				: undefined,
		};
	}
}

/**
 * Creates a renderer class from the optional Integration hook surface.
 *
 * @remarks
 * Integrations that only need the documented hooks can use this factory and
 * avoid subclassing `IntegrationRenderer`.
 */
export function createIntegrationRenderer<C = EcoPagesElement>(
	name: string,
	hooks: IntegrationRendererHooks | IntegrationRendererHookFactory = {},
): new (options: IntegrationRendererOptions) => IntegrationRenderer<C> & { name: string } {
	return class HookedIntegrationRenderer extends IntegrationRenderer<C> {
		name = name;

		constructor(options: IntegrationRendererOptions) {
			const rendererHooks = (factoryOptions: IntegrationRendererHookFactoryOptions) => {
				const configuredHooks =
					typeof hooks === 'function'
						? hooks({
								...factoryOptions,
								hooks: typeof options.hooks === 'function' ? {} : (options.hooks ?? {}),
							})
						: hooks;
				const instanceHooks =
					typeof options.hooks === 'function'
						? options.hooks({ ...factoryOptions, hooks: configuredHooks ?? {} })
						: options.hooks;

				return { ...configuredHooks, ...instanceHooks };
			};
			super({ ...options, hooks: rendererHooks });
		}
	};
}
