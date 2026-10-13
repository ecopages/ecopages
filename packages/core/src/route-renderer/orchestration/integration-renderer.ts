/**
 * This module contains the abstract class for the Integration Renderer
 * Every integration renderer should extend this class
 * @module
 */

import type { EcoPagesAppConfig, IHmrManager, InternalComponentRenderInput } from '../../types/internal-types.ts';
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
	PageBrowserGraphContribution,
	PageBrowserGraphContributionContext,
	PageBrowserGraphResult,
	PageMetadataProps,
	RouteRendererBody,
	RouteRendererOptions,
	RouteRenderResult,
} from '../../types/public-types.ts';
import {
	type AssetProcessingService,
	createPagePackage,
	type ProcessedAsset,
} from '../../services/assets/asset-processing-service/index.ts';
import { HtmlTransformerService } from '../../services/html/html-transformer.service.ts';
import type { HtmlDocumentContribution } from '../../services/html/html-transformer.service.ts';
import { invariant } from '../../utils/invariant.ts';
import { HttpError } from '../../errors/http-error.ts';
import { DependencyResolverService } from '../page-loading/dependency-resolver.ts';
import { PageModuleLoaderService } from '../page-loading/page-module-loader.ts';
import { getComponentIdentity } from '../../eco/component-identity.ts';
import { OwnershipValidationService } from './ownership-graph/ownership-validation.service.ts';
import {
	collectPageClientPlan,
	planHasForeignChildDescendants,
	uniqueIslandIntegrationNames,
	type PageClientBrowserAssets,
	type PageClientPlan,
} from './ownership-graph/page-client-plan.ts';
import {
	finalizeComponentRender,
	getComponentRenderContext,
	runWithComponentRenderContext,
} from './foreign-child/component-render-context.ts';
import {
	RouteRenderOrchestrator,
	type RouteRenderOrchestratorAdapter,
	type RouteRenderOrchestratorResolvedInputs,
} from './route-pipeline/route-render-orchestrator.ts';
import { createIntegrationRouteRenderAdapter } from './route-pipeline/integration-route-render-adapter.ts';
import { createPageDependencyInstanceKey } from './page-browser-graph/route-instance-key.ts';
import { mergePageBrowserGraphContributions } from './page-browser-graph/page-browser-graph-contribution.merge.ts';
import { collectDependencyWatchPaths } from '../page-loading/file-scoped-dependency-components.ts';
import {
	resolvePageDependenciesFromContext,
	type ResolvedPageDependencies,
} from '../page-loading/resolved-page-dependencies.ts';
import {
	createGroupedGraphBuildPlanKey,
	type GroupedGraphBuildPlan,
} from './page-browser-graph/grouped-graph-build-plan.ts';
import type { ForeignChildRuntime } from './foreign-child/component-render-context.ts';
import { normalizeUnresolvedMarkerArtifactHtml } from './route-pipeline/marker-artifact.utils.ts';
import { isMarkupNodeLike } from './foreign-child/foreign-child-output.utils.ts';
import {
	getForeignSubtreeResolutionContextKey,
	getForeignSubtreeTokenPrefix,
	resolveOwningIntegrationRenderer,
} from './foreign-child/owning-renderer-resolution.ts';
import { ensureIntegrationRuntimeReady } from '../../build/app-build-manifest-runtime.ts';
import {
	ForeignSubtreeExecutionService,
	type ForeignSubtreeExecutionOwningRenderer,
	type QueuedForeignSubtreeResolutionContext,
	type RenderQueuedForeignSubtreeChildren,
} from './foreign-child/foreign-subtree-execution.service.ts';
import {
	renderPageDocumentShell,
	type DocumentShellLayoutInput,
} from './document-shell/document-shell-render.service.ts';
import {
	resolveInnermostPageLayout,
	resolvePageLayoutComponents,
} from './document-shell/layout-shell-props.service.ts';
import { finalizeIslandComponentRender } from '../../islands/island-host.ts';

/**
 * Controls how one route module is loaded outside the normal render path.
 */
export type RouteModuleLoadOptions = {
	bypassCache?: boolean;
};

/**
 * Response options for an explicit view render.
 */
export interface RenderToResponseContext {
	partial?: boolean;
	status?: number;
	headers?: HeadersInit;
}

/**
 * Request data an explicit view render forwards to the route pipeline.
 */
export type ExplicitViewRenderContext = RenderToResponseContext &
	Partial<Pick<RouteRendererOptions, 'params' | 'query' | 'locals' | 'file'>>;

export type HtmlDocumentContributionContext<C = EcoPagesElement> = {
	renderOptions?: IntegrationRendererRenderOptions<C>;
	partial?: boolean;
};

export type { PageBrowserGraphContribution, PageBrowserGraphContributionContext } from '../../types/public-types.ts';
export {
	selectHydrationIslandEntries,
	type PageClientBrowserAssets,
	type PageClientPlan,
} from './ownership-graph/page-client-plan.ts';
export type { HtmlDocumentContribution } from '../../services/html/html-transformer.service.ts';

/**
 * The IntegrationRenderer class is an abstract class that provides a base for rendering integration-specific components in the EcoPages framework.
 * It handles the import of page files, collection of dependencies, and preparation of render options.
 * The class is designed to be extended by specific integration renderers.
 */
export abstract class IntegrationRenderer<C = EcoPagesElement> {
	abstract name: string;
	protected appConfig: EcoPagesAppConfig;
	protected assetProcessingService: AssetProcessingService;
	protected htmlTransformer: HtmlTransformerService;
	protected hmrManager?: IHmrManager;
	protected resolvedIntegrationDependencies: ProcessedAsset[] = [];
	declare protected options: Required<IntegrationRendererRenderOptions>;
	protected runtimeOrigin: string;
	protected dependencyResolverService: DependencyResolverService;
	protected pageModuleLoaderService: PageModuleLoaderService;
	protected routeRenderOrchestrator: RouteRenderOrchestrator;
	protected readonly foreignSubtreeExecutionService: ForeignSubtreeExecutionService =
		new ForeignSubtreeExecutionService();
	/**
	 * Serializes route and view renders that mutate `htmlTransformer` state.
	 *
	 * Integration renderers are cached per integration, so concurrent static builds
	 * and overlapping SSR requests must not share one transformer page package.
	 */
	private renderExclusiveChain: Promise<void> = Promise.resolve();

	protected DOC_TYPE = '<!DOCTYPE html>';

	private runRenderExclusive<T>(operation: () => Promise<T>): Promise<T> {
		const run = this.renderExclusiveChain.then(async () => {
			await this.ensureIntegrationRuntimeActivated();
			return operation();
		});
		this.renderExclusiveChain = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	/**
	 * Activates the owning integration runtime on first render or graph use.
	 */
	protected async ensureIntegrationRuntimeActivated(): Promise<void> {
		await ensureIntegrationRuntimeReady({
			appConfig: this.appConfig,
			integrationName: this.name,
			runtimeOrigin: this.runtimeOrigin,
		});
		const integration = this.appConfig.integrations?.find((entry) => entry.name === this.name);
		if (integration?.getResolvedIntegrationDependencies) {
			this.resolvedIntegrationDependencies = integration.getResolvedIntegrationDependencies();
		}
	}

	/**
	 * Prebuilds the production Page Browser Graph for one route file and optional params.
	 */
	public async prebuildProductionPageBrowserGraph(
		routeFile: string,
		options?: Pick<RouteRendererOptions, 'params' | 'query'> & {
			groupedBuildPlan?: GroupedGraphBuildPlan;
		},
	): Promise<void> {
		await this.ensureIntegrationRuntimeActivated();
		await this.resolvePageBrowserGraphForRoute(routeFile, options, options?.groupedBuildPlan);
	}

	/**
	 * Builds one production grouped graph plan for the supplied static route instances.
	 */
	public async buildGroupedGraphBuildPlan(
		instances: ReadonlyArray<{
			routeFile: string;
			params?: RouteRendererOptions['params'];
			query?: RouteRendererOptions['query'];
		}>,
	): Promise<GroupedGraphBuildPlan> {
		const builtInstances = await Promise.all(
			instances.map(async (routeInstance) => {
				const context = await this.buildPageBrowserGraphContributionContext(
					routeInstance.routeFile,
					routeInstance,
				);
				const resolvedPageDependencies = await this.resolvePageDependencies(context);
				return {
					routeFile: routeInstance.routeFile,
					dependencyInstanceKey: context.dependencyInstanceKey ?? '',
					contribution: mergePageBrowserGraphContributions(
						await this.collectPageBrowserGraphContribution(context),
						resolvedPageDependencies?.contribution,
					),
				};
			}),
		);

		return {
			integrationName: this.name,
			planKey: createGroupedGraphBuildPlanKey(this.name, builtInstances),
			instances: builtInstances,
		};
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
	protected createHtmlResponse(body: BodyInit, ctx: RenderToResponseContext): Response {
		return new Response(body, {
			status: ctx.status ?? 200,
			headers: this.buildHeaders('text/html; charset=utf-8', ctx.headers),
		});
	}

	/**
	 * Create an HttpError for unexpected render failures.
	 * @param message - Error message
	 * @param cause - Original error if available
	 * @returns The original HttpError when the cause is already one, otherwise a 500 HttpError
	 * @remarks HttpError from pages (for example NotFound from content lookup) must keep its
	 * status so the request matcher can serve a 404 instead of a 500.
	 */
	protected createRenderError(message: string, cause?: unknown): HttpError {
		if (HttpError.isHttpError(cause)) {
			return cause;
		}
		const errorMessage = cause instanceof Error ? `${message}: ${cause.message}` : message;
		return HttpError.InternalServerError(errorMessage);
	}

	protected async resolvePageBrowserGraphForFile(filePath: string): Promise<PageBrowserGraphResult | undefined> {
		/**
		 * @remarks
		 * Integration renderers such as React still call this file-only entry point
		 * during explicit view rendering. Route-instance-aware callers should prefer
		 * `resolvePageBrowserGraphForRoute`.
		 */
		return this.resolvePageBrowserGraphForRoute(filePath);
	}

	protected async resolvePageBrowserGraphForRoute(
		filePath: string,
		routeOptions?: Pick<RouteRendererOptions, 'params' | 'query'>,
		groupedBuildPlan?: GroupedGraphBuildPlan,
	): Promise<PageBrowserGraphResult | undefined> {
		const graphContext = await this.buildPageBrowserGraphContributionContext(filePath, routeOptions);
		const resolvedPageDependencies = await this.resolvePageDependencies(graphContext);

		return await this.routeRenderOrchestrator.resolveDeclaredPageBrowserGraph({
			routeFile: filePath,
			dependencyInstanceKey: graphContext.dependencyInstanceKey,
			integrationName: this.name,
			groupedBuildPlan,
			collectContribution: async () =>
				mergePageBrowserGraphContributions(
					await this.collectPageBrowserGraphContribution(graphContext),
					resolvedPageDependencies?.contribution,
				),
		});
	}

	/**
	 * Merges component-scoped assets into the active HTML transformer state.
	 *
	 * Explicit page, layout, and document shell composition can produce assets at
	 * each foreign subtree. This helper deduplicates those groups and folds them back into
	 * the transformer so downstream HTML finalization sees one canonical asset set.
	 *
	 * @param assetGroups - Optional groups of processed assets to merge.
	 * @returns The deduplicated asset subset contributed by this merge operation.
	 */
	protected appendProcessedDependencies(
		...assetGroups: Array<readonly ProcessedAsset[] | undefined>
	): ProcessedAsset[] {
		const nextDependencies = this.htmlTransformer.dedupeProcessedAssets(
			assetGroups.flatMap((assets) => assets ?? []),
		);

		if (nextDependencies.length === 0) {
			return nextDependencies;
		}

		const context = getComponentRenderContext();
		const existingDependencies = context?.pagePackage?.assets ?? this.htmlTransformer.getProcessedDependencies();
		const mergedDependencies = this.htmlTransformer.dedupeProcessedAssets([
			...existingDependencies,
			...nextDependencies,
		]);
		const currentPageBrowserGraph =
			context?.pagePackage?.pageBrowserGraph ?? this.htmlTransformer.getPagePackage()?.pageBrowserGraph;
		const pagePackage = createPagePackage(mergedDependencies, {
			pageBrowserGraph: currentPageBrowserGraph,
		});

		if (context) {
			context.pagePackage = pagePackage;
		} else {
			this.htmlTransformer.setPagePackage(pagePackage);
		}

		return nextDependencies;
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
		return renderPageDocumentShell(
			{
				renderComponentWithForeignChildren: (renderInput) =>
					this.renderComponentWithForeignChildren(renderInput),
				appendProcessedDependencies: (...assetGroups) => this.appendProcessedDependencies(...assetGroups),
			},
			input,
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
		const html = content as string;
		const assets = input.component.config?.dependencies
			? await this.processComponentDependencies([input.component])
			: undefined;

		return {
			html,
			canAttachAttributes: true,
			rootTag: this.getRootTagName(html),
			integrationName: this.name,
			assets,
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
		const queuedForeignSubtreeResolution = await this.foreignSubtreeExecutionService.resolveStringQueuedHtml({
			currentIntegrationName: this.name,
			html: componentRender.html,
			runtimeContext: this.getQueuedForeignSubtreeContext(input),
			getOwningRenderer: (integrationName, rendererCache) =>
				this.resolveOwningRenderer(integrationName, rendererCache),
		});
		const mergedAssets = this.htmlTransformer.dedupeProcessedAssets([
			...(componentRender.assets ?? []),
			...queuedForeignSubtreeResolution.assets,
		]);

		return this.finalizeIslandComponentRender(input, {
			...componentRender,
			html: queuedForeignSubtreeResolution.html,
			rootTag: this.getRootTagName(queuedForeignSubtreeResolution.html),
			assets: mergedAssets.length > 0 ? mergedAssets : undefined,
		});
	}

	constructor({
		appConfig,
		assetProcessingService,
		resolvedIntegrationDependencies,
		runtimeOrigin,
	}: {
		appConfig: EcoPagesAppConfig;
		assetProcessingService: AssetProcessingService;
		resolvedIntegrationDependencies?: ProcessedAsset[];
		runtimeOrigin: string;
	}) {
		this.appConfig = appConfig;
		this.assetProcessingService = assetProcessingService;
		this.htmlTransformer = new HtmlTransformerService();
		this.resolvedIntegrationDependencies = resolvedIntegrationDependencies || [];
		this.runtimeOrigin = runtimeOrigin;
		this.dependencyResolverService = new DependencyResolverService(appConfig, assetProcessingService);
		this.pageModuleLoaderService = new PageModuleLoaderService(appConfig, runtimeOrigin);
		this.routeRenderOrchestrator = new RouteRenderOrchestrator(appConfig, assetProcessingService, {
			ownershipValidationService: new OwnershipValidationService(appConfig),
		});
	}

	/**
	 * Returns the HTML template component.
	 * It imports the HTML template from the specified path in the app configuration.
	 *
	 * @returns The HTML template component.
	 */
	protected async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		const htmlTemplatePath = this.appConfig.absolutePaths.htmlTemplatePath;
		try {
			const { default: HtmlTemplate } = await this.importPageFile(htmlTemplatePath);
			return HtmlTemplate as EcoComponent<HtmlTemplateProps>;
		} catch (error) {
			invariant(false, `Error importing HtmlTemplate: ${error}`);
		}
	}

	protected normalizeImportedPageFile<TPageModule extends EcoPageFile>(
		_file: string,
		pageModule: TPageModule,
	): TPageModule {
		return pageModule;
	}

	/**
	 * Imports the page file from the specified path.
	 *
	 * @param file - The file path to import.
	 * @returns The imported module.
	 */
	protected async importPageFile(file: string, options?: RouteModuleLoadOptions): Promise<EcoPageFile> {
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
	): Promise<ProcessedAsset[]> {
		const componentDeps = await this.processComponentDependencies(components);
		return this.resolvedIntegrationDependencies.concat(componentDeps);
	}

	/**
	 * Processes component-specific dependencies WITHOUT prepending global integration dependencies.
	 * Use this method when you need only the component's own assets.
	 *
	 * @param components - The components to collect dependencies from.
	 */
	protected async processComponentDependencies(
		components: (EcoComponent | Partial<EcoComponent>)[],
	): Promise<ProcessedAsset[]> {
		return this.dependencyResolverService.processComponentDependencies(components, this.name);
	}

	/**
	 * Builds the internal route-render adapter consumed by `RouteRenderOrchestrator`.
	 *
	 * The route orchestrator needs a narrow orchestration contract, but those hooks should
	 * not become public API on the renderer base class. Keeping the adapter object
	 * local to the execution path lets the orchestrator depend on one explicit seam while
	 * subclasses continue to override protected renderer behavior directly.
	 */
	protected createRouteRenderOrchestratorAdapter(): RouteRenderOrchestratorAdapter<C> {
		return createIntegrationRouteRenderAdapter({
			name: this.name,
			appConfig: this.appConfig,
			watch: this.hmrManager?.isEnabled() === true,
			resolveRouteRenderInputs: (routeOptions) => this.resolveRouteRenderInputs(routeOptions),
			resolveRouteDependencies: (input) => this.resolveRouteDependencies(input),
			importPageFile: (file) => this.importPageFile(file),
			collectPageBrowserGraphContribution: (context) => this.collectPageBrowserGraphContribution(context),
			resolvePageDependencies: (context) => this.resolvePageDependencies(context),
			buildPageBrowserGraphContributionContext: (routeFile, routeOptions) =>
				this.buildPageBrowserGraphContributionContext(routeFile, routeOptions),
			renderRouteBody: (renderOptions) => this.renderRouteBody(renderOptions),
			buildPageClientBrowserAssets: (plan) => this.buildPageClientBrowserAssets(plan),
			getDocumentAttributes: (renderOptions) => this.getDocumentAttributes(renderOptions),
			getHtmlDocumentContributions: (options) => this.getHtmlDocumentContributions(options),
			applyAttributesToHtmlElement: (html, attributes) => this.applyAttributesToHtmlElement(html, attributes),
			transformRouteResponse: async (response, htmlContributions, pagePackage) => {
				const resolvedPagePackage =
					getComponentRenderContext()?.pagePackage ?? this.htmlTransformer.getPagePackage() ?? pagePackage;
				const transformedResponse = this.htmlTransformer.transform(
					response,
					htmlContributions,
					resolvedPagePackage,
				);
				return (transformedResponse.body ?? (await transformedResponse.text())) as RouteRendererBody;
			},
		});
	}

	protected async resolveRouteRenderInputs(
		routeOptions: RouteRendererOptions,
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

	protected async buildPageBrowserGraphContributionContext(
		routeFile: string,
		routeOptions?: Pick<RouteRendererOptions, 'params' | 'query' | 'pageModule'>,
	): Promise<PageBrowserGraphContributionContext> {
		const { module: pageModule, ...resolvedPageModule } = await this.pageModuleLoaderService.resolvePageModule({
			file: routeFile,
			pageModule: routeOptions?.pageModule,
			importPageFileFn: (targetFile) => this.importPageFile(targetFile),
		});
		const { props } = await this.pageModuleLoaderService.resolvePageData({
			pageModule: resolvedPageModule,
			routeOptions: {
				file: routeFile,
				params: routeOptions?.params,
				query: routeOptions?.query,
			},
		});

		return {
			file: routeFile,
			pageModule,
			props,
			params: routeOptions?.params,
			query: routeOptions?.query,
			dependencyInstanceKey: createPageDependencyInstanceKey({
				params: routeOptions?.params,
				query: routeOptions?.query,
			}),
		};
	}

	protected async resolvePageDependencies(
		context: PageBrowserGraphContributionContext,
	): Promise<ResolvedPageDependencies | undefined> {
		return resolvePageDependenciesFromContext(context, this.name, (components, ownerFile) =>
			this.resolvePageBrowserGraphContributionFromComponents(components, ownerFile),
		);
	}

	protected async resolvePageBrowserGraphContributionFromComponents(
		components: ReadonlyArray<EcoComponent | Partial<EcoComponent>>,
		ownerFile: string,
	): Promise<PageBrowserGraphContribution | undefined> {
		if (components.length === 0) {
			return undefined;
		}

		return {
			assets: await this.processComponentDependencies([...components]),
			watchPaths: collectDependencyWatchPaths(ownerFile, components),
		};
	}

	protected async resolveRouteDependencies(input: {
		components: (EcoComponent | Partial<EcoComponent>)[];
	}): Promise<{ resolvedDependencies: ProcessedAsset[] }> {
		return {
			resolvedDependencies: await this.resolveDependencies(input.components),
		};
	}

	protected async renderRouteBody(renderOptions: IntegrationRendererRenderOptions<C>): Promise<RouteRendererBody> {
		return this.render(renderOptions);
	}

	/**
	 * Prepares the render options for the integration renderer.
	 * It imports the page file, collects dependencies, and prepares the render options.
	 *
	 * @param options - The route renderer options.
	 * @returns The prepared render options.
	 */
	protected async prepareRenderOptions(
		options: RouteRendererOptions,
		adapter: RouteRenderOrchestratorAdapter<C> = this.createRouteRenderOrchestratorAdapter(),
	): Promise<IntegrationRendererRenderOptions<C>> {
		const renderOptions = await this.routeRenderOrchestrator.prepareRenderOptions(options, adapter);
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
	 * @returns Rendered route body plus effective cache strategy.
	 */
	public async execute(options: RouteRendererOptions): Promise<RouteRenderResult> {
		return this.runRenderExclusive(async () => {
			this.htmlTransformer.setProcessedDependencies([]);

			const adapter = this.createRouteRenderOrchestratorAdapter();
			const renderOptions = await this.prepareRenderOptions(options, adapter);
			const { value } = await runWithComponentRenderContext(
				{
					currentIntegration: this.name,
					pageClientPlan: renderOptions.pageClientPlan,
					islandRenderAssetsByFile: renderOptions.islandRenderAssetsByFile,
					pagePackage: renderOptions.pagePackage,
				},
				() => this.routeRenderOrchestrator.executePrepared(renderOptions, adapter),
			);
			return value;
		});
	}

	/**
	 * Renders one explicit view through the route pipeline.
	 *
	 * @remarks
	 * A partial render stays on `renderComponentWithForeignChildren`. A full render
	 * goes through {@link IntegrationRenderer.executeExplicitView}, so it receives the
	 * same layouts, metadata, and client plan as a filesystem Page.
	 */
	async renderExplicitView<P>(view: EcoComponent<P>, props: P, ctx: ExplicitViewRenderContext): Promise<Response> {
		if (ctx.partial) {
			const plan = collectPageClientPlan([{ component: view }], this.name);
			const assets = await this.buildPageClientBrowserAssets(plan);
			const rendererCache = new Map<string, unknown>() as BaseIntegrationContext['rendererCache'];
			const { value } = await runWithComponentRenderContext(
				{
					currentIntegration: this.name,
					pageClientPlan: plan,
					islandRenderAssetsByFile: assets.islandRenderAssetsByFile,
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
			file: ctx.file ?? identity?.file ?? `explicit:${this.name}:${identity?.id ?? 'view'}`,
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
		_renderOptions: IntegrationRendererRenderOptions<C>,
	): Record<string, string> | undefined {
		return undefined;
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
		_options: HtmlDocumentContributionContext<C>,
	): HtmlDocumentContribution[] | undefined {
		return undefined;
	}

	/**
	 * Abstract method to render the integration-specific component.
	 * This method should be implemented by the specific integration renderer.
	 *
	 * @param options - The integration renderer render options.
	 * @returns The rendered body.
	 */
	abstract render(options: IntegrationRendererRenderOptions<C>): Promise<RouteRendererBody>;

	/**
	 * Renders one component under this integration's foreign-child runtime and resolves
	 * any nested foreign children captured during that render.
	 *
	 * Without this wrapper, a component tree with foreign-owned descendants would
	 * render them with no active foreign-child runtime, which bypasses the owning
	 * renderer's nested foreign-child handoff.
	 */
	async renderComponentWithForeignChildren(input: InternalComponentRenderInput): Promise<ComponentRenderResult> {
		return await this.foreignSubtreeExecutionService.executeComponentRender({
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
			runtimeOrigin: this.runtimeOrigin,
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
		return this.foreignSubtreeExecutionService.getQueuedRuntimeContext<TContext>(
			input,
			getForeignSubtreeResolutionContextKey(this.name),
		);
	}

	/**
	 * Replaces the foreign-subtree tokens queued while rendering `html` with the
	 * HTML each owning renderer produces.
	 *
	 * @remarks
	 * `renderQueuedChildren` renders a subtree's children inside this renderer
	 * before the owning renderer renders the subtree around them. The returned
	 * assets are the owning renderers' assets, deduplicated.
	 */
	protected resolveQueuedForeignSubtrees<TContext extends QueuedForeignSubtreeResolutionContext>(
		html: string,
		runtimeContext: TContext | undefined,
		renderQueuedChildren: RenderQueuedForeignSubtreeChildren<TContext>,
	): Promise<{ assets: ProcessedAsset[]; html: string }> {
		return this.foreignSubtreeExecutionService.resolveQueuedHtml({
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
	 * @remarks Reads the component's own declarations, excluding Foreign Children, instead of `result.assets`,
	 * which also carries the assets of Foreign Subtrees and of declared Foreign Children. Components without
	 * `dependencies` emit no assets of their own, so they are never stamped.
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
	 * Island assets for the active render.
	 *
	 * @remarks
	 * The render context owns the map; outside a render there are none.
	 */
	protected getActiveIslandRenderAssets(): ReadonlyMap<string, ProcessedAsset[]> {
		return getComponentRenderContext()?.islandRenderAssetsByFile ?? new Map();
	}

	/**
	 * @remarks
	 * The active plan answers "foreign to whom" for the page owner. A nested renderer of another
	 * Integration, such as a React leaf under a Kita page, must not reuse it: every React component
	 * is foreign to Kita, so the plan would report foreign children for a leaf that has none. That
	 * renderer builds a plan for itself.
	 */
	protected hasForeignChildDescendants(
		component: EcoComponent,
		foreignChildRoots?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>,
	): boolean {
		const activePlan = getComponentRenderContext()?.pageClientPlan;
		if (activePlan?.currentIntegrationName === this.name) {
			return planHasForeignChildDescendants(activePlan, component, this.name, foreignChildRoots);
		}

		const plan = collectPageClientPlan(
			[{ component }, ...(foreignChildRoots ?? []).map((child) => ({ component: child }))],
			this.name,
		);
		return planHasForeignChildDescendants(plan, component, this.name, foreignChildRoots);
	}

	/**
	 * Builds island client assets from the page client plan before SSR.
	 *
	 * @remarks
	 * Default is none. Integrations that hydrate islands override this so
	 * {@link IntegrationRenderer.execute} never starts a browser build during SSR.
	 * Page owners also call this on other hydrating integrations listed in the plan.
	 */
	protected async collectIslandRenderAssets(_plan: PageClientPlan): Promise<Map<string, ProcessedAsset[]>> {
		return new Map();
	}

	/**
	 * Returns whether this renderer builds island and lazy-entry scripts in the
	 * app-wide grouped browser build that other page owners should run for the plan.
	 */
	protected contributesAppBrowserClientBuild(): boolean {
		return false;
	}

	/**
	 * Builds island and lazy-entry browser assets from the page client plan.
	 *
	 * @remarks
	 * The page owner collects its own island assets, then asks every other
	 * island-hydrating integration on the plan to contribute its grouped client
	 * build. Lazy entries join that same grouped build when an Integration
	 * includes them; otherwise they are processed here as one grouped batch.
	 */
	protected async buildPageClientBrowserAssets(plan: PageClientPlan): Promise<PageClientBrowserAssets> {
		const { islandRenderAssetsByFile, processedAssets: combined } =
			await this.collectContributorPageClientAssets(plan);
		const lazyAlreadyProcessed = combined.some((asset) => Boolean(asset.attributes?.['data-eco-lazy-key']));
		const processedLazy =
			!lazyAlreadyProcessed && plan.lazyClientEntries.length > 0
				? await this.assetProcessingService.processDependencies(plan.lazyClientEntries, this.name)
				: [];
		const processedAssets = [...combined, ...processedLazy];
		const lazyTriggers = this.dependencyResolverService.applyPendingLazyTriggers(processedAssets, plan.lazyConfigs);
		return {
			processedAssets,
			islandRenderAssetsByFile,
			lazyTriggers,
		};
	}

	/**
	 * Merges this renderer's island assets with grouped client builds from other
	 * island-hydrating integrations on the plan.
	 */
	private async collectContributorPageClientAssets(plan: PageClientPlan): Promise<{
		islandRenderAssetsByFile: Map<string, ProcessedAsset[]>;
		processedAssets: ProcessedAsset[];
	}> {
		const ownIslands = await this.collectIslandRenderAssets(plan);
		const islandRenderAssetsByFile = new Map<string, ProcessedAsset[]>();
		mergeIslandRenderAssetMaps(islandRenderAssetsByFile, ownIslands);
		const processedAssets = [...ownIslands.values()].flat();
		const rendererCache = new Map<string, ForeignSubtreeExecutionOwningRenderer>();

		for (const integrationName of uniqueIslandIntegrationNames(plan)) {
			if (integrationName === this.name) {
				continue;
			}
			const owning = await this.resolveOwningRenderer(integrationName, rendererCache);
			if (!(owning instanceof IntegrationRenderer) || !owning.contributesAppBrowserClientBuild()) {
				continue;
			}
			const contributed = await owning.buildPageClientBrowserAssets(plan);
			mergeIslandRenderAssetMaps(islandRenderAssetsByFile, contributed.islandRenderAssetsByFile);
			processedAssets.push(...contributed.processedAssets);
		}

		return { islandRenderAssetsByFile, processedAssets };
	}

	/**
	 * Render a single component and return structured output for orchestration paths.
	 *
	 * @remarks
	 * Integrations override this for asset emission, root attributes, and hydration
	 * metadata. The default calls the component and stringifies a string result.
	 */
	async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		if (typeof input.component !== 'function') {
			throw new TypeError(`${this.name} renderer expected a callable component.`);
		}

		const rendered = await (input.component as EcoFunctionComponent<Record<string, unknown>, EcoPagesElement>)(
			input.props,
		);
		const html = typeof rendered === 'string' ? rendered : '';

		return {
			html,
			canAttachAttributes: true,
			rootTag: this.getRootTagName(html),
			integrationName: this.name,
		};
	}

	/**
	 * Extracts the first root element tag name from HTML output.
	 *
	 * @param html HTML fragment.
	 * @returns Root tag name when present; otherwise `undefined`.
	 */
	protected getRootTagName(html: string): string | undefined {
		const rootTag = html.match(/^(?:\s|<!--[\s\S]*?-->)*<([a-zA-Z][a-zA-Z0-9:-]*)\b/);
		return rootTag?.[1];
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
	 * @returns Declarative dependencies or pre-resolved assets for the Page.
	 */
	protected async collectPageBrowserGraphContribution(
		_context: PageBrowserGraphContributionContext,
	): Promise<PageBrowserGraphContribution | undefined> {
		return undefined;
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
		return this.foreignSubtreeExecutionService.createQueuedRuntime({
			renderInput: options.renderInput,
			rendererCache: options.rendererCache,
			runtimeContextKey: getForeignSubtreeResolutionContextKey(this.name),
			tokenPrefix: getForeignSubtreeTokenPrefix(this.name),
		});
	}
}

function mergeIslandRenderAssetMaps(
	target: Map<string, ProcessedAsset[]>,
	source: Map<string, ProcessedAsset[]>,
): void {
	for (const [file, assets] of source) {
		const existing = target.get(file);
		target.set(file, existing ? [...existing, ...assets] : assets);
	}
}
