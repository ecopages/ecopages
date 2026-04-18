/**
 * This module contains the abstract class for the Integration Renderer
 * Every integration renderer should extend this class
 * @module
 */

import type { EcoPagesAppConfig, IHmrManager } from '../../types/internal-types.ts';
import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	EcoComponentDependencies,
	EcoFunctionComponent,
	EcoPageComponent,
	EcoPageFile,
	EcoPagesElement,
	GetMetadata,
	GetMetadataContext,
	GetStaticProps,
	HtmlTemplateProps,
	IntegrationRendererRenderOptions,
	PageMetadataProps,
	RouteRendererBody,
	RouteRendererOptions,
	RouteRenderResult,
} from '../../types/public-types.ts';
import {
	type AssetProcessingService,
	type ProcessedAsset,
} from '../../services/assets/asset-processing-service/index.ts';
import { HtmlTransformerService } from '../../services/html/html-transformer.service.ts';
import { invariant } from '../../utils/invariant.ts';
import { HttpError } from '../../errors/http-error.ts';
import { LocalsAccessError } from '../../errors/locals-access-error.ts';
import { DependencyResolverService } from '../page-loading/dependency-resolver.ts';
import { PageModuleLoaderService } from '../page-loading/page-module-loader.ts';
import { RenderExecutionService } from './render-execution.service.ts';
import { RenderPreparationService } from './render-preparation.service.ts';
import type { ComponentBoundaryRuntime } from './component-render-context.ts';
import { normalizeBoundaryArtifactHtml } from './render-output.utils.ts';
import { getComponentRenderContext, runWithComponentRenderContext } from './component-render-context.ts';
import {
	QueuedBoundaryRuntimeService,
	type QueuedBoundaryResolution,
	type QueuedBoundaryRuntimeContext,
} from './queued-boundary-runtime.service.ts';

type BoundaryRenderDecisionInput = {
	currentIntegration: string;
	targetIntegration?: string;
};

/**
 * Controls how one route module is loaded outside the normal render path.
 *
 * Request-time metadata inspection and static-generation probes use these
 * options to isolate their module identity from the main render cache while
 * still going through the owning integration's import setup.
 */
export type RouteModuleLoadOptions = {
	bypassCache?: boolean;
	cacheScope?: string;
};

/**
 * Creates a Proxy that throws LocalsAccessError on any property access.
 * Used to protect static pages from accidentally accessing request locals.
 *
 * @param filePath - The file path of the page attempting to access locals (for error reporting)
 * @returns A Proxy object that blocks all property access operations
 * @throws {LocalsAccessError} When any property access operation is attempted
 */
function createLocalsProxy(filePath: string): Record<string, never> {
	const errorMessage = `[ecopages] Request locals are only available during request-time rendering with cache: 'dynamic'. Page: ${filePath}. If you meant to use locals here, set cache: 'dynamic' and provide locals from route middleware/handlers.`;

	return new Proxy(
		{},
		{
			get: () => {
				throw new LocalsAccessError(errorMessage);
			},
			set: () => {
				throw new LocalsAccessError(errorMessage);
			},
			has: () => {
				throw new LocalsAccessError(errorMessage);
			},
			ownKeys: () => {
				throw new LocalsAccessError(errorMessage);
			},
			deleteProperty: () => {
				throw new LocalsAccessError(errorMessage);
			},
			defineProperty: () => {
				throw new LocalsAccessError(errorMessage);
			},
			getOwnPropertyDescriptor: () => {
				throw new LocalsAccessError(errorMessage);
			},
		},
	);
}

/**
 * Context for renderToResponse method.
 */
export interface RenderToResponseContext {
	partial?: boolean;
	status?: number;
	headers?: HeadersInit;
}

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
	protected rendererModules?: unknown;
	declare protected options: Required<IntegrationRendererRenderOptions>;
	protected runtimeOrigin: string;
	protected dependencyResolverService: DependencyResolverService;
	protected pageModuleLoaderService: PageModuleLoaderService;
	protected renderPreparationService: RenderPreparationService;
	protected renderExecutionService: RenderExecutionService;
	protected readonly queuedBoundaryRuntimeService = new QueuedBoundaryRuntimeService();

	protected DOC_TYPE = '<!DOCTYPE html>';

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

	/**
	 * Reads the execution-scoped foreign renderer cache from one boundary input.
	 *
	 * Shared page/layout/document shell helpers pass one cache through
	 * `integrationContext` so repeated delegation to the same foreign integration
	 * can reuse a single initialized renderer instance during one render flow.
	 * The cache is deliberately scoped to the current render execution rather than
	 * stored on the renderer, which avoids leaking mutable integration state across
	 * requests while still preventing redundant renderer initialization.
	 *
	 * @param integrationContext - Optional boundary context carried with one render input.
	 * @returns The current execution cache when present.
	 */
	private getBoundaryRendererCache(integrationContext: unknown): Map<string, IntegrationRenderer<any>> | undefined {
		if (
			typeof integrationContext === 'object' &&
			integrationContext !== null &&
			'rendererCache' in integrationContext &&
			integrationContext.rendererCache instanceof Map
		) {
			return integrationContext.rendererCache as Map<string, IntegrationRenderer<any>>;
		}

		return undefined;
	}

	private getRegisteredBoundaryOwner(component: EcoComponent): string | undefined {
		const integrationName = component.config?.integration ?? component.config?.__eco?.integration;
		if (!integrationName || integrationName === this.name) {
			return undefined;
		}

		return this.appConfig.integrations.some((integration) => integration.name === integrationName)
			? integrationName
			: undefined;
	}

	/**
	 * Attaches an execution-scoped foreign renderer cache to one boundary input.
	 *
	 * Foreign-owned page, layout, or document shells may delegate several times in
	 * the same render flow. Threading the cache through `integrationContext`
	 * preserves renderer reuse without changing the public boundary input contract.
	 * Existing integration-specific context is preserved and augmented.
	 *
	 * @param input - Original boundary render input.
	 * @param rendererCache - Execution-scoped renderer cache to propagate.
	 * @returns Boundary input augmented with the shared renderer cache.
	 */
	private withBoundaryRendererCache(
		input: ComponentRenderInput,
		rendererCache: Map<string, IntegrationRenderer<any>>,
	): ComponentRenderInput {
		const integrationContext = input.integrationContext;

		return {
			...input,
			integrationContext:
				typeof integrationContext === 'object' && integrationContext !== null
					? { ...(integrationContext as Record<string, unknown>), rendererCache }
					: { rendererCache },
		};
	}

	protected getRendererModuleValue(key: string): unknown {
		if (!this.rendererModules || typeof this.rendererModules !== 'object') {
			return undefined;
		}

		return (this.rendererModules as Record<string, unknown>)[key];
	}

	protected getRendererModuleString(key: string): string | undefined {
		const value = this.getRendererModuleValue(key);
		return typeof value === 'string' && value.length > 0 ? value : undefined;
	}

	protected getRendererBootstrapDependencies(partial = false): ProcessedAsset[] {
		if (partial) {
			return [];
		}

		const islandClientModuleId = this.getRendererModuleString('islandClientModuleId');
		if (!islandClientModuleId) {
			return [];
		}

		return [
			{
				attributes: {
					crossorigin: 'anonymous',
					'data-ecopages-runtime': 'islands',
					type: 'module',
				},
				content: `import ${JSON.stringify(islandClientModuleId)};`,
				inline: true,
				kind: 'script',
				position: 'body',
			},
		];
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
	 * Create an HttpError for render failures.
	 * @param message - Error message
	 * @param cause - Original error if available
	 * @returns HttpError with 500 status
	 */
	protected createRenderError(message: string, cause?: unknown): HttpError {
		const errorMessage = cause instanceof Error ? `${message}: ${cause.message}` : message;
		return HttpError.InternalServerError(errorMessage);
	}

	/**
	 * Prepares dependencies for renderToResponse by resolving component dependencies
	 * and configuring the HTML transformer.
	 * @param view - The view component being rendered
	 * @param layout - Optional layout component
	 * @returns Resolved processed assets
	 */
	protected async prepareViewDependencies(view: EcoComponent, layout?: EcoComponent): Promise<ProcessedAsset[]> {
		const HtmlTemplate = await this.getHtmlTemplate();
		const componentsToResolve = layout ? [HtmlTemplate, layout, view] : [HtmlTemplate, view];
		const resolvedDependencies = this.htmlTransformer.dedupeProcessedAssets(
			await this.resolveDependencies(componentsToResolve),
		);
		this.htmlTransformer.setProcessedDependencies(resolvedDependencies);
		return resolvedDependencies;
	}

	/**
	 * Merges component-scoped assets into the active HTML transformer state.
	 *
	 * Explicit page, layout, and document shell composition can produce assets at
	 * each boundary. This helper deduplicates those groups and folds them back into
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

		this.htmlTransformer.setProcessedDependencies(
			this.htmlTransformer.dedupeProcessedAssets([
				...this.htmlTransformer.getProcessedDependencies(),
				...nextDependencies,
			]),
		);

		return nextDependencies;
	}

	/**
	 * Resolves metadata for explicit view rendering.
	 *
	 * When a view declares a `metadata()` function, that contract owns the final
	 * metadata for the explicit render. Otherwise the app-level default metadata is
	 * reused so explicit routes and page-module routes share the same fallback.
	 *
	 * @param view - View component being rendered.
	 * @param props - Props passed to the view.
	 * @returns Resolved metadata for the final document shell.
	 */
	protected async resolveViewMetadata<P>(view: EcoComponent<P>, props: P): Promise<PageMetadataProps> {
		return view.metadata
			? await view.metadata({
					params: {},
					query: {},
					props,
					appConfig: this.appConfig,
				})
			: this.appConfig.defaultMetadata;
	}

	/**
	 * Renders one explicit view response in partial mode.
	 *
	 * Same-integration views can optionally stream or render inline via the caller's
	 * `renderInline()` hook. Once a view may cross integration boundaries, this
	 * helper routes the render through `renderComponentBoundary()` instead so mixed
	 * shells can reuse the execution-scoped renderer cache and resolve nested
	 * foreign ownership before the partial response is returned.
	 *
	 * @param input - View render options for the partial response.
	 * @returns HTML response for the partial render.
	 */
	protected async renderPartialViewResponse<P>(input: {
		view: EcoComponent<P>;
		props: P;
		ctx: RenderToResponseContext;
		renderInline?: () => Promise<BodyInit>;
		transformHtml?: (html: string) => string;
	}): Promise<Response> {
		if (input.renderInline && !this.hasForeignBoundaryDescendants(input.view as EcoComponent)) {
			return this.createHtmlResponse(await input.renderInline(), input.ctx);
		}

		const rendererCache = new Map<string, IntegrationRenderer<any>>();

		const viewRender = await this.renderComponentBoundary({
			component: input.view as EcoComponent,
			props: (input.props ?? {}) as Record<string, unknown>,
			integrationContext: { rendererCache },
		});
		const html = input.transformHtml ? input.transformHtml(viewRender.html) : viewRender.html;

		return this.createHtmlResponse(html, input.ctx);
	}

	/**
	 * Renders an explicit view through optional layout and document shells.
	 *
	 * This helper is the shared explicit-route path for string-oriented and mixed
	 * integrations. It prepares view dependencies, resolves metadata, and composes
	 * view, layout, and html template boundaries with one execution-scoped renderer
	 * cache so repeated foreign shell delegation can reuse initialized renderers
	 * during the same render flow.
	 *
	 * @param input - View, props, and optional layout metadata for the render.
	 * @returns HTML response for the explicit view render.
	 */
	protected async renderViewWithDocumentShell<P>(input: {
		view: EcoComponent<P>;
		props: P;
		ctx: RenderToResponseContext;
		layout?: EcoComponent;
	}): Promise<Response> {
		const normalizedProps = (input.props ?? {}) as Record<string, unknown>;

		if (input.ctx.partial) {
			return this.renderPartialViewResponse({
				view: input.view,
				props: input.props,
				ctx: input.ctx,
			});
		}

		await this.prepareViewDependencies(input.view, input.layout);

		const HtmlTemplate = await this.getHtmlTemplate();
		const metadata = await this.resolveViewMetadata(input.view, input.props);
		const rendererCache = new Map<string, IntegrationRenderer<any>>();
		const viewRender = await this.renderComponentBoundary({
			component: input.view as EcoComponent,
			props: normalizedProps,
			integrationContext: { rendererCache },
		});
		const layoutRender = input.layout
			? await this.renderComponentBoundary({
					component: input.layout,
					props: {},
					children: viewRender.html,
					integrationContext: { rendererCache },
				})
			: undefined;
		const documentRender = await this.renderComponentBoundary({
			component: HtmlTemplate as EcoComponent,
			props: {
				metadata,
				pageProps: normalizedProps,
			},
			children: layoutRender?.html ?? viewRender.html,
			integrationContext: { rendererCache },
		});

		this.appendProcessedDependencies(viewRender.assets, layoutRender?.assets, documentRender.assets);

		const html = await this.finalizeResolvedHtml({
			html: `${this.DOC_TYPE}${documentRender.html}`,
			partial: false,
		});

		return this.createHtmlResponse(html, input.ctx);
	}

	/**
	 * Renders a route page through optional layout and document shells.
	 *
	 * Route rendering and explicit view rendering now share the same boundary-owned
	 * shell composition model. This helper composes page, layout, and html template
	 * boundaries while threading one execution-scoped renderer cache through every
	 * delegated boundary so foreign shell ownership remains stable and renderer
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
		htmlTemplate: EcoComponent;
		metadata: PageMetadataProps;
		pageProps: Record<string, unknown>;
		documentProps?: Record<string, unknown>;
		transformDocumentHtml?: (html: string) => string;
	}): Promise<string> {
		const rendererCache = new Map<string, IntegrationRenderer<any>>();
		const pageRender = await this.renderComponentBoundary({
			component: input.page.component,
			props: input.page.props,
			integrationContext: { rendererCache },
		});
		const layoutRender = input.layout
			? await this.renderComponentBoundary({
					component: input.layout.component,
					props: input.layout.props ?? {},
					children: pageRender.html,
					integrationContext: { rendererCache },
				})
			: undefined;
		const documentRender = await this.renderComponentBoundary({
			component: input.htmlTemplate,
			props: {
				metadata: input.metadata,
				pageProps: input.pageProps,
				...(input.documentProps ?? {}),
			},
			children: layoutRender?.html ?? pageRender.html,
			integrationContext: { rendererCache },
		});

		this.appendProcessedDependencies(pageRender.assets, layoutRender?.assets, documentRender.assets);

		const documentHtml = input.transformDocumentHtml
			? input.transformDocumentHtml(documentRender.html)
			: documentRender.html;

		return `${this.DOC_TYPE}${documentHtml}`;
	}

	/**
	 * Renders one string-first component boundary and collects its assets.
	 *
	 * String-oriented integrations frequently share the same boundary contract:
	 * pass serialized children through props, coerce the render result to HTML, and
	 * attach any component-scoped dependencies. This helper centralizes that flow
	 * so integrations can opt into shared orchestration without repeating the same
	 * boundary boilerplate.
	 *
	 * @param input - Boundary render input.
	 * @param component - String-oriented component implementation to execute.
	 * @returns Structured component render result for orchestration paths.
	 */
	protected async renderStringComponentBoundary(
		input: ComponentRenderInput,
		component: (props: Record<string, unknown>) => Promise<EcoPagesElement> | EcoPagesElement,
	): Promise<ComponentRenderResult> {
		const props = input.children === undefined ? input.props : { ...input.props, children: input.children };
		const content = await component(props);
		const html = String(content);
		const assets =
			input.component.config?.dependencies &&
			typeof this.assetProcessingService?.processDependencies === 'function'
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

	protected getBoundaryTokenPrefix(): string {
		return `__${this.name}_boundary__`;
	}

	protected getBoundaryRuntimeContextKey(): string {
		return `__${this.name}_boundary_runtime__`;
	}

	protected getQueuedBoundaryRuntime<TContext extends QueuedBoundaryRuntimeContext>(
		input: ComponentRenderInput,
		runtimeContextKey = this.getBoundaryRuntimeContextKey(),
	): TContext | undefined {
		return this.queuedBoundaryRuntimeService.getRuntimeContext<TContext>(input, runtimeContextKey);
	}

	protected async resolveQueuedBoundaryTokens(
		html: string,
		queuedResolutionsByToken: Map<string, QueuedBoundaryResolution>,
		resolveToken: (token: string) => Promise<string>,
	): Promise<string> {
		let resolvedHtml = html;

		for (const token of queuedResolutionsByToken.keys()) {
			if (!resolvedHtml.includes(token)) {
				continue;
			}

			resolvedHtml = resolvedHtml.split(token).join(await resolveToken(token));
		}

		return resolvedHtml;
	}

	protected createQueuedBoundaryRuntime<TContext extends QueuedBoundaryRuntimeContext>(options: {
		boundaryInput: ComponentRenderInput;
		rendererCache: Map<string, IntegrationRenderer<any>>;
		runtimeContextKey?: string;
		tokenPrefix?: string;
		createRuntimeContext?: (
			integrationContext: {
				rendererCache?: Map<string, unknown>;
				componentInstanceId?: string;
				[key: string]: unknown;
			},
			rendererCache: Map<string, unknown>,
		) => TContext;
	}): ComponentBoundaryRuntime {
		return this.queuedBoundaryRuntimeService.createRuntime<TContext>({
			boundaryInput: options.boundaryInput,
			rendererCache: options.rendererCache as Map<string, unknown>,
			runtimeContextKey: options.runtimeContextKey ?? this.getBoundaryRuntimeContextKey(),
			tokenPrefix: options.tokenPrefix ?? this.getBoundaryTokenPrefix(),
			shouldQueueBoundary: (input) => this.shouldResolveBoundaryInOwningRenderer(input),
			createRuntimeContext: options.createRuntimeContext,
		});
	}

	protected async resolveRendererOwnedQueuedBoundaryHtml<TContext extends QueuedBoundaryRuntimeContext>(options: {
		html: string;
		runtimeContext?: TContext;
		queueLabel: string;
		renderQueuedChildren: (
			children: unknown,
			runtimeContext: TContext,
			queuedResolutionsByToken: Map<string, QueuedBoundaryResolution>,
			resolveToken: (token: string) => Promise<string>,
		) => Promise<{ assets: ProcessedAsset[]; html?: string }>;
	}): Promise<{ assets: ProcessedAsset[]; html: string }> {
		return this.queuedBoundaryRuntimeService.resolveQueuedHtml({
			html: options.html,
			runtimeContext: options.runtimeContext,
			queueLabel: options.queueLabel,
			renderQueuedChildren: options.renderQueuedChildren,
			resolveBoundary: (input, rendererCache) =>
				this.resolveBoundaryInOwningRenderer(input, rendererCache as Map<string, IntegrationRenderer<any>>),
			applyAttributesToFirstElement: (html, attributes) =>
				this.htmlTransformer.applyAttributesToFirstElement(html, attributes),
			dedupeProcessedAssets: (assets) => this.htmlTransformer.dedupeProcessedAssets(assets),
		});
	}

	/**
	 * Renders a string-first component, then resolves any queued foreign
	 * boundaries before returning final component HTML.
	 */
	protected async renderStringComponentBoundaryWithQueuedForeignBoundaries(
		input: ComponentRenderInput,
		component: (props: Record<string, unknown>) => Promise<EcoPagesElement> | EcoPagesElement,
	): Promise<ComponentRenderResult> {
		const componentRender = await this.renderStringComponentBoundary(input, component);
		const queuedBoundaryResolution = await this.resolveRendererOwnedQueuedBoundaryHtml({
			html: componentRender.html,
			runtimeContext: this.getQueuedBoundaryRuntime<QueuedBoundaryRuntimeContext>(input),
			queueLabel: 'String',
			renderQueuedChildren: async (children, _runtimeContext, queuedResolutionsByToken, resolveToken) => {
				if (children === undefined) {
					return { assets: [], html: undefined };
				}

				const html = await this.resolveQueuedBoundaryTokens(
					typeof children === 'string' ? children : String(children ?? ''),
					queuedResolutionsByToken,
					resolveToken,
				);

				return { assets: [], html };
			},
		});
		const mergedAssets = this.htmlTransformer.dedupeProcessedAssets([
			...(componentRender.assets ?? []),
			...queuedBoundaryResolution.assets,
		]);

		return {
			...componentRender,
			html: queuedBoundaryResolution.html,
			rootTag: this.getRootTagName(queuedBoundaryResolution.html),
			assets: mergedAssets.length > 0 ? mergedAssets : undefined,
		};
	}

	constructor({
		appConfig,
		assetProcessingService,
		resolvedIntegrationDependencies,
		rendererModules,
		runtimeOrigin,
	}: {
		appConfig: EcoPagesAppConfig;
		assetProcessingService: AssetProcessingService;
		resolvedIntegrationDependencies?: ProcessedAsset[];
		rendererModules?: unknown;
		runtimeOrigin: string;
	}) {
		this.appConfig = appConfig;
		this.assetProcessingService = assetProcessingService;
		this.htmlTransformer = new HtmlTransformerService();
		this.resolvedIntegrationDependencies = resolvedIntegrationDependencies || [];
		this.rendererModules = rendererModules ?? appConfig.runtime?.rendererModuleContext;
		this.runtimeOrigin = runtimeOrigin;
		this.dependencyResolverService = new DependencyResolverService(appConfig, assetProcessingService);
		this.pageModuleLoaderService = new PageModuleLoaderService(appConfig, runtimeOrigin);
		this.renderPreparationService = new RenderPreparationService(appConfig, assetProcessingService);
		this.renderExecutionService = new RenderExecutionService();
	}

	/**
	 * Returns the HTML path from the provided file path.
	 * It extracts the path relative to the pages directory and removes the 'index' part if present.
	 *
	 * @param file - The file path to extract the HTML path from.
	 * @returns The extracted HTML path.
	 */
	protected getHtmlPath({ file }: { file: string }): string {
		const pagesDir = this.appConfig.absolutePaths.pagesDir;
		const pagesIndex = file.indexOf(pagesDir);
		if (pagesIndex === -1) return file;
		const startIndex = file.indexOf(pagesDir) + pagesDir.length;
		const endIndex = file.lastIndexOf('/');
		const path = file.substring(startIndex, endIndex);
		if (path === '/index') return '';
		return path;
	}

	/**
	 * Returns the HTML template component.
	 * It imports the HTML template from the specified path in the app configuration.
	 *
	 * @returns The HTML template component.
	 */
	protected async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		const htmlTemplatePath =
			this.getRendererModuleString('htmlTemplateModulePath') ?? this.appConfig.absolutePaths.htmlTemplatePath;
		try {
			const { default: HtmlTemplate } = await this.importPageFile(htmlTemplatePath);
			return HtmlTemplate as EcoComponent<HtmlTemplateProps>;
		} catch (error) {
			invariant(false, `Error importing HtmlTemplate: ${error}`);
		}
	}

	/**
	 * Returns the static props for the page.
	 * It calls the provided getStaticProps function with the given options.
	 *
	 * @param getStaticProps - The function to get static props.
	 * @param options - The options to pass to the getStaticProps function.
	 * @returns The static props and metadata.
	 */
	protected async getStaticProps(
		getStaticProps?: GetStaticProps<Record<string, unknown>>,
		options?: Pick<RouteRendererOptions, 'params'>,
	): Promise<{
		props: Record<string, unknown>;
		metadata?: PageMetadataProps;
	}> {
		return this.pageModuleLoaderService.getStaticPropsForPage({
			getStaticProps,
			params: options?.params,
		});
	}

	/**
	 * Returns the metadata properties for the page.
	 * It calls the provided getMetadata function with the given context.
	 *
	 * @param getMetadata - The function to get metadata.
	 * @param context - The context to pass to the getMetadata function.
	 * @returns The metadata properties.
	 */
	protected async getMetadataProps(
		getMetadata: GetMetadata | undefined,
		{ props, params, query }: GetMetadataContext,
	): Promise<PageMetadataProps> {
		return this.pageModuleLoaderService.getMetadataPropsForPage({
			getMetadata,
			context: { props, params, query } as GetMetadataContext,
		});
	}

	protected usesIntegrationPageImporter(_file: string): boolean {
		return false;
	}

	protected async importIntegrationPageFile(_file: string, _options?: RouteModuleLoadOptions): Promise<EcoPageFile> {
		invariant(false, 'Integration page importer must be implemented when enabled');
	}

	protected normalizeImportedPageFile<TPageModule extends EcoPageFile>(
		_file: string,
		pageModule: TPageModule,
	): TPageModule {
		return pageModule;
	}

	/**
	 * Imports the page file from the specified path.
	 * It uses dynamic import to load the file and returns the imported module.
	 *
	 * @param file - The file path to import.
	 * @returns The imported module.
	 */
	protected async importPageFile(file: string, options?: RouteModuleLoadOptions): Promise<EcoPageFile> {
		const bypassCache =
			options?.bypassCache ?? (typeof Bun !== 'undefined' && process.env.NODE_ENV === 'development');
		const pageModule = this.usesIntegrationPageImporter(file)
			? await this.importIntegrationPageFile(file, {
					bypassCache,
					cacheScope: options?.cacheScope,
				})
			: await this.pageModuleLoaderService.importPageFile(file, {
					bypassCache,
					cacheScope: options?.cacheScope,
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
	 * Extracts the dependencies from the provided component configuration.
	 * It resolves the paths for scripts and stylesheets based on the component directory.
	 *
	 * @param componentDir - The component directory path.
	 * @param scripts - The scripts to extract.
	 * @param stylesheets - The stylesheets to extract.
	 * @returns The extracted dependencies.
	 */
	protected extractDependencies({
		componentDir,
		scripts,
		stylesheets,
	}: {
		componentDir: string;
	} & EcoComponentDependencies): EcoComponentDependencies {
		const scriptsPaths = [
			...new Set(
				(scripts ?? [])
					.filter((script) => (typeof script === 'string' ? true : !script.lazy))
					.map((script) => (typeof script === 'string' ? script : script.src))
					.filter((script): script is string => Boolean(script))
					.map((script) => this.resolveDependencyPath(componentDir, script)),
			),
		];

		const stylesheetsPaths = [
			...new Set(
				(stylesheets ?? [])
					.map((style) => (typeof style === 'string' ? style : style.src))
					.filter((style): style is string => Boolean(style))
					.map((style) => this.resolveDependencyPath(componentDir, style)),
			),
		];

		return {
			scripts: scriptsPaths,
			stylesheets: stylesheetsPaths,
		};
	}

	/**
	 * Resolves lazy script paths to public asset URLs.
	 * Converts source paths to their final bundled output paths.
	 *
	 * @param componentDir - The component directory path.
	 * @param scripts - The lazy script paths to resolve.
	 * @returns Comma-separated string of resolved public script paths.
	 */
	protected resolveLazyScripts(componentDir: string, scripts: string[]): string {
		return this.dependencyResolverService.resolveLazyScripts(componentDir, scripts);
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
	 * Prepares the render options for the integration renderer.
	 * It imports the page file, collects dependencies, and prepares the render options.
	 *
	 * @param options - The route renderer options.
	 * @returns The prepared render options.
	 */
	protected async prepareRenderOptions(options: RouteRendererOptions): Promise<IntegrationRendererRenderOptions> {
		return this.renderPreparationService.prepare(options, this.name, {
			resolvePageModule: (file) => this.resolvePageModule(file),
			getHtmlTemplate: () => this.getHtmlTemplate(),
			resolvePageData: (pageModule, routeOptions) => this.resolvePageData(pageModule, routeOptions),
			resolveDependencies: (components) => this.resolveDependencies(components),
			buildRouteRenderAssets: (file) => this.buildRouteRenderAssets(file),
			shouldRenderPageComponent: (input) => this.shouldRenderPageComponent(input),
			renderPageComponent: ({ component, props }) =>
				this.renderComponentBoundary({
					component,
					props,
					integrationContext: {
						componentInstanceId: 'eco-page-root',
					},
				}),
			setProcessedDependencies: (dependencies) => this.htmlTransformer.setProcessedDependencies(dependencies),
			dedupeProcessedAssets: (assets) => this.htmlTransformer.dedupeProcessedAssets(assets),
			createPageLocalsProxy: (filePath) =>
				createLocalsProxy(filePath) as unknown as RouteRendererOptions['locals'],
		});
	}

	/**
	 * Controls whether the page root should be rendered through `renderComponent()`
	 * during route option preparation in component-capable modes.
	 *
	 * Integrations that already own page-level hydration (for example router-driven
	 * React rendering) can override this and return `false` to avoid duplicate root
	 * mount assets and competing hydration entrypoints.
	 */
	protected shouldRenderPageComponent(_input: {
		Page: EcoComponent;
		Layout?: EcoComponent;
		options: RouteRendererOptions;
	}): boolean {
		return true;
	}

	/**
	 * Resolves the page module and normalizes exports.
	 */
	protected async resolvePageModule(file: string): Promise<{
		Page: EcoPageFile['default'] | EcoPageComponent<any>;
		getStaticProps?: GetStaticProps<Record<string, unknown>>;
		getMetadata?: GetMetadata;
		integrationSpecificProps: Record<string, unknown>;
	}> {
		return this.pageModuleLoaderService.resolvePageModule({
			file,
			importPageFileFn: (targetFile) => this.importPageFile(targetFile),
		});
	}

	/**
	 * Resolves static props and metadata for the page.
	 */
	protected async resolvePageData(
		pageModule: {
			getStaticProps?: GetStaticProps<Record<string, unknown>>;
			getMetadata?: GetMetadata;
		},
		options: RouteRendererOptions,
	): Promise<{
		props: Record<string, unknown>;
		metadata: PageMetadataProps;
	}> {
		return this.pageModuleLoaderService.resolvePageData({
			pageModule,
			routeOptions: options,
		});
	}

	/**
	 * Executes the integration renderer with the provided options.
	 *
	 * Execution flow:
	 * 1. Build normalized render options (`prepareRenderOptions`).
	 * 2. Render the route body once.
	 * 3. Reject unresolved route-level boundary artifacts.
	 * 4. Optionally apply root attributes for page/component root boundaries.
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
		return this.renderExecutionService.execute(options, {
			prepareRenderOptions: (routeOptions) =>
				this.prepareRenderOptions(routeOptions) as Promise<IntegrationRendererRenderOptions<C>>,
			render: (renderOptions) => this.render(renderOptions),
			getDocumentAttributes: (renderOptions) => this.getDocumentAttributes(renderOptions),
			applyAttributesToHtmlElement: (html, attributes) =>
				this.htmlTransformer.applyAttributesToHtmlElement(html, attributes),
			applyAttributesToFirstBodyElement: (html, attributes) =>
				this.htmlTransformer.applyAttributesToFirstBodyElement(html, attributes),
			transformResponse: async (response) => {
				const transformedResponse = await this.htmlTransformer.transform(response);
				return (transformedResponse.body ?? (await transformedResponse.text())) as RouteRendererBody;
			},
		});
	}

	/**
	 * Finalizes already-resolved HTML for explicit renderer-owned paths.
	 *
	 * This keeps document and root-attribute stamping plus HTML transformation
	 * available after a renderer has completed nested boundary resolution without
	 * routing back through shared route execution.
	 */
	protected async finalizeResolvedHtml(options: {
		html: string;
		partial?: boolean;
		componentRootAttributes?: Record<string, string>;
		documentAttributes?: Record<string, string>;
		transformHtml?: boolean;
	}): Promise<string> {
		const rendererBootstrapDependencies = this.getRendererBootstrapDependencies(options.partial);
		this.appendProcessedDependencies(rendererBootstrapDependencies);

		let html = options.html;

		if (options.componentRootAttributes && Object.keys(options.componentRootAttributes).length > 0) {
			html = this.htmlTransformer.applyAttributesToFirstBodyElement(html, options.componentRootAttributes);
		}

		if (options.documentAttributes && Object.keys(options.documentAttributes).length > 0) {
			html = this.htmlTransformer.applyAttributesToHtmlElement(html, options.documentAttributes);
		}

		const shouldTransform = options.transformHtml ?? !options.partial;
		if (!shouldTransform) {
			return html;
		}

		const transformedResponse = await this.htmlTransformer.transform(
			new Response(html, {
				headers: { 'Content-Type': 'text/html' },
			}),
		);

		return await transformedResponse.text();
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

	/**
	 * Returns a renderer instance for a given integration name.
	 *
	 * Uses a per-execution cache to avoid repeated renderer initialization.
	 *
	 * @param integrationName Target integration name.
	 * @param cache Render-pass renderer cache.
	 * @returns Renderer for the requested integration.
	 * @throws Error when no integration plugin matches `integrationName`.
	 */
	private getIntegrationRendererForName(
		integrationName: string,
		cache: Map<string, IntegrationRenderer<any>>,
	): IntegrationRenderer<any> {
		if (cache.has(integrationName)) {
			return cache.get(integrationName) as IntegrationRenderer<any>;
		}

		if (integrationName === this.name) {
			cache.set(integrationName, this);
			return this;
		}

		const integrationPlugin = this.appConfig.integrations.find(
			(integration) => integration.name === integrationName,
		);
		invariant(!!integrationPlugin, `[ecopages] Integration not found for boundary owner: ${integrationName}`);
		const renderer = integrationPlugin.initializeRenderer({
			rendererModules: this.appConfig.runtime?.rendererModuleContext,
		});
		cache.set(integrationName, renderer);
		return renderer;
	}

	/**
	 * Abstract method to render the integration-specific component.
	 * This method should be implemented by the specific integration renderer.
	 *
	 * @param options - The integration renderer render options.
	 * @returns The rendered body.
	 */
	abstract render(options: IntegrationRendererRenderOptions<C>): Promise<RouteRendererBody>;

	protected async resolveBoundaryInOwningRenderer(
		input: ComponentRenderInput,
		rendererCache: Map<string, IntegrationRenderer<any>>,
	): Promise<ComponentRenderResult | undefined> {
		const boundaryOwner = this.getRegisteredBoundaryOwner(input.component);
		if (!boundaryOwner) {
			return undefined;
		}

		const owningRenderer = this.getIntegrationRendererForName(boundaryOwner, rendererCache);
		if (owningRenderer === this || owningRenderer.name === this.name) {
			return undefined;
		}
		return await owningRenderer.renderComponentBoundary(this.withBoundaryRendererCache(input, rendererCache));
	}

	/**
	 * Renders one component under this integration's boundary runtime and resolves
	 * any nested foreign boundaries captured during that render.
	 *
	 * Without this wrapper, a component tree with foreign-owned descendants would
	 * render them with no active boundary runtime, which bypasses the owning
	 * renderer's nested-boundary handoff.
	 */
	async renderComponentBoundary(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		const rendererCache =
			this.getBoundaryRendererCache(input.integrationContext) ?? new Map<string, IntegrationRenderer<any>>();
		const delegatedBoundaryRender = await this.resolveBoundaryInOwningRenderer(input, rendererCache);

		if (delegatedBoundaryRender) {
			return delegatedBoundaryRender;
		}

		const hasForeignBoundaries = this.hasForeignBoundaryDescendants(input.component);
		const activeRenderContext = getComponentRenderContext();

		if (!hasForeignBoundaries) {
			if (!activeRenderContext || activeRenderContext.currentIntegration === this.name) {
				return this.normalizeComponentBoundaryRender(await this.renderComponent(input));
			}

			const sameIntegrationExecution = await runWithComponentRenderContext(
				{
					currentIntegration: this.name,
				},
				async () => this.renderComponent(input),
			);

			return this.normalizeComponentBoundaryRender(sameIntegrationExecution.value);
		}

		const execution = await runWithComponentRenderContext(
			{
				currentIntegration: this.name,
				boundaryRuntime: this.createComponentBoundaryRuntime({
					boundaryInput: input,
					rendererCache,
				}),
			},
			async () => this.renderComponent(input),
		);

		return this.normalizeComponentBoundaryRender(execution.value);
	}

	private normalizeComponentBoundaryRender(result: ComponentRenderResult): ComponentRenderResult {
		const normalizedHtml = this.normalizeBoundaryArtifactHtml(result.html);

		return normalizedHtml === result.html
			? result
			: {
					...result,
					html: normalizedHtml,
				};
	}

	protected normalizeBoundaryArtifactHtml(html: string): string {
		return normalizeBoundaryArtifactHtml(html);
	}

	/**
	 * Returns whether the component dependency tree crosses into another
	 * integration.
	 *
	 * This keeps boundary-runtime setup narrow: same-integration trees can render
	 * directly without paying the queue orchestration cost.
	 */
	protected hasForeignBoundaryDescendants(component: EcoComponent): boolean {
		const stack = [component];
		const seen = new Set<EcoComponent>();

		while (stack.length > 0) {
			const current = stack.pop();
			if (!current || seen.has(current)) {
				continue;
			}

			seen.add(current);
			const integrationName = current.config?.integration ?? current.config?.__eco?.integration;
			if (integrationName && integrationName !== this.name) {
				return true;
			}

			stack.push(...(current.config?.dependencies?.components ?? []));
		}

		return false;
	}

	/**
	 * Render a view directly to a Response object.
	 * Used for explicit routing where views are rendered from route handlers.
	 *
	 * @param view - The eco.page component to render
	 * @param props - Props to pass to the view
	 * @param ctx - Render context with partial flag and response options
	 * @returns A Response object with the rendered content
	 */
	abstract renderToResponse<P = Record<string, unknown>>(
		view: EcoComponent<P>,
		props: P,
		ctx: RenderToResponseContext,
	): Promise<Response>;

	/**
	 * Render a single component and return structured output for orchestration paths.
	 *
	 * Default behavior delegates to `renderToResponse` in partial mode and wraps
	 * the resulting HTML into the `ComponentRenderResult` contract.
	 *
	 * In boundary resolution, this method is the integration-owned step that turns an
	 * already-resolved deferred boundary into concrete HTML, assets, and optional
	 * root attributes.
	 *
	 * Integrations can override this for richer behavior (asset emission,
	 * root attributes, integration-specific hydration metadata).
	 *
	 * @param input Component render request.
	 * @returns Structured render result used by component/page orchestration.
	 */
	async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		const response = await this.renderToResponse(
			input.component as EcoFunctionComponent<Record<string, unknown>, EcoPagesElement>,
			input.props,
			{ partial: true },
		);
		const html = await response.text();

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
	 * Method to build route render assets.
	 * This method can be optionally overridden by the specific integration renderer.
	 *
	 * @param file - The file path to build assets for.
	 * @returns The processed assets or undefined.
	 */
	protected buildRouteRenderAssets(_file: string): Promise<ProcessedAsset[]> | undefined {
		return undefined;
	}

	/**
	 * Creates the per-render boundary runtime adopted by the shared component
	 * render context.
	 *
	 * Real mixed-integration renderers should override this and keep foreign
	 * boundary resolution inside their own renderer-owned queue. The base runtime
	 * fails fast when a renderer crosses into a foreign owner without providing its
	 * own handoff mechanism.
	 */
	protected createComponentBoundaryRuntime(_options: {
		boundaryInput: ComponentRenderInput;
		rendererCache: Map<string, IntegrationRenderer<any>>;
	}): ComponentBoundaryRuntime {
		const decideBoundaryInterception = (input: BoundaryRenderDecisionInput) => {
			if (!this.shouldResolveBoundaryInOwningRenderer(input)) {
				return { kind: 'inline' as const };
			}

			throw new Error(
				`[ecopages] ${this.name} renderer crossed into ${input.targetIntegration} without a renderer-owned boundary runtime. Override createComponentBoundaryRuntime() to resolve foreign boundaries inside the owning renderer.`,
			);
		};

		const runtime: ComponentBoundaryRuntime = {
			interceptBoundary: decideBoundaryInterception,
			interceptBoundarySync: decideBoundaryInterception,
		};

		return runtime;
	}

	/**
	 * Resolves whether a boundary should leave the current render pass and be
	 * resolved by its owning renderer.
	 *
	 * Boundaries owned by the current integration always render inline. Foreign-
	 * owned boundaries must be handed off by a renderer-owned runtime.
	 *
	 * @param input Boundary metadata for the active render pass.
	 * @returns `true` when the boundary should leave the current pass; otherwise `false`.
	 */
	protected shouldResolveBoundaryInOwningRenderer(input: BoundaryRenderDecisionInput): boolean {
		return !!input.targetIntegration && input.targetIntegration !== input.currentIntegration;
	}
}
