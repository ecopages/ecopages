/**
 * This module contains the abstract class for the Integration Renderer
 * Every integration renderer should extend this class
 * @module
 */

import type { EcoPagesAppConfig, IHmrManager } from '../../types/internal-types.ts';
import type {
	ComponentRenderInput,
	ComponentRenderResult,
	ForeignSubtreeRenderPayload,
	EcoComponent,
	EcoComponentDependencies,
	EcoFunctionComponent,
	EcoPageFile,
	EcoPagesElement,
	BaseIntegrationContext,
	HtmlTemplateProps,
	IntegrationRendererRenderOptions,
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
import { invariant } from '../../utils/invariant.ts';
import { HttpError } from '../../errors/http-error.ts';
import { DependencyResolverService } from '../page-loading/dependency-resolver.ts';
import { PageModuleLoaderService } from '../page-loading/page-module-loader.ts';
import { OwnershipValidationService } from './ownership-validation.service.ts';
import {
	type RouteHtmlFinalization,
	RouteRenderOrchestrator,
	type RouteRenderOrchestratorAdapter,
	type RouteRenderOrchestratorResolvedInputs,
} from './route-render-orchestrator.ts';
import type { ForeignChildRuntime } from './component-render-context.ts';
import { normalizeUnresolvedMarkerArtifactHtml } from './render-output.utils.ts';
import { getComponentRenderContext, runWithComponentRenderContext } from './component-render-context.ts';
import {
	QueuedForeignSubtreeResolutionService,
	type QueuedForeignSubtreeResolution,
	type QueuedForeignSubtreeResolutionContext,
} from './queued-foreign-subtree-resolution.service.ts';

type ForeignChildResolutionDecisionInput = {
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
	protected routeRenderOrchestrator: RouteRenderOrchestrator;
	protected readonly queuedForeignSubtreeResolutionService = new QueuedForeignSubtreeResolutionService();

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
	 * Reads the execution-scoped owning-renderer cache from one render input.
	 *
	 * Shared page/layout/document shell helpers pass one cache through
	 * `integrationContext` so repeated delegation to the same foreign integration
	 * can reuse a single initialized renderer instance during one render flow.
	 * The cache is deliberately scoped to the current render execution rather than
	 * stored on the renderer, which avoids leaking mutable integration state across
	 * requests while still preventing redundant renderer initialization.
	 *
	 * @param integrationContext - Optional render context carried with one render input.
	 * @returns The current execution cache when present.
	 */
	private getOwningRendererCache(
		integrationContext?: BaseIntegrationContext,
	): Map<string, IntegrationRenderer<any>> | undefined {
		if (integrationContext?.rendererCache instanceof Map) {
			return integrationContext.rendererCache as Map<string, IntegrationRenderer<any>>;
		}

		return undefined;
	}

	private getForeignOwnerIntegrationName(component: EcoComponent): string | undefined {
		const integrationName = component.config?.integration ?? component.config?.__eco?.integration;
		if (!integrationName || integrationName === this.name) {
			return undefined;
		}

		return this.appConfig.integrations.some((integration) => integration.name === integrationName)
			? integrationName
			: undefined;
	}

	/**
	 * Attaches an execution-scoped owning-renderer cache to one render input.
	 *
	 * Foreign-owned page, layout, or document shells may delegate several times in
	 * the same render flow. Threading the cache through `integrationContext`
	 * preserves renderer reuse without changing the public render input contract.
	 * Existing integration-specific context is preserved and augmented.
	 *
	 * @param input - Original render input.
	 * @param rendererCache - Execution-scoped renderer cache to propagate.
	 * @returns Render input augmented with the shared renderer cache.
	 */
	private withOwningRendererCache(
		input: ComponentRenderInput,
		rendererCache: Map<string, IntegrationRenderer<any>>,
	): ComponentRenderInput {
		const integrationContext = input.integrationContext;
		const sharedRendererCache = rendererCache as BaseIntegrationContext['rendererCache'];

		return {
			...input,
			integrationContext: integrationContext
				? { ...integrationContext, rendererCache: sharedRendererCache }
				: { rendererCache: sharedRendererCache },
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
				packageRole: 'keep-separate',
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
		this.htmlTransformer.setPagePackage(createPagePackage(resolvedDependencies));
		return resolvedDependencies;
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

		const mergedDependencies = this.htmlTransformer.dedupeProcessedAssets([
			...this.htmlTransformer.getProcessedDependencies(),
			...nextDependencies,
		]);

		this.htmlTransformer.setPagePackage(createPagePackage(mergedDependencies));

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
	 * helper routes the render through `renderComponentWithForeignChildren()` instead so mixed
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
		if (input.renderInline && !this.hasForeignChildDescendants(input.view as EcoComponent)) {
			return this.createHtmlResponse(await input.renderInline(), input.ctx);
		}

		const rendererCache = new Map<string, unknown>() as BaseIntegrationContext['rendererCache'];
		const viewRender = await this.renderComponentWithForeignChildren({
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
			return this.renderPartialViewResponse(input);
		}

		await this.prepareViewDependencies(input.view, input.layout);

		const HtmlTemplate = await this.getHtmlTemplate();
		const metadata = await this.resolveViewMetadata(input.view, input.props);
		const { documentHtml } = await this.composeDocumentShell({
			primaryComponent: input.view as EcoComponent,
			primaryProps: normalizedProps,
			layout: input.layout
				? {
						component: input.layout,
						props: {},
					}
				: undefined,
			htmlTemplate: HtmlTemplate as EcoComponent,
			documentProps: {
				metadata,
				pageProps: normalizedProps,
			},
		});

		const html = await this.finalizeResolvedHtml({
			html: `${this.DOC_TYPE}${documentHtml}`,
			partial: false,
		});

		return this.createHtmlResponse(html, input.ctx);
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
		htmlTemplate: EcoComponent;
		metadata: PageMetadataProps;
		pageProps: Record<string, unknown>;
		documentProps?: Record<string, unknown>;
		transformDocumentHtml?: (html: string) => string;
	}): Promise<string> {
		const { documentHtml: composedDocumentHtml } = await this.composeDocumentShell({
			primaryComponent: input.page.component,
			primaryProps: input.page.props,
			layout: input.layout,
			htmlTemplate: input.htmlTemplate,
			documentProps: {
				metadata: input.metadata,
				pageProps: input.pageProps,
				...(input.documentProps ?? {}),
			},
		});

		const documentHtml = input.transformDocumentHtml
			? input.transformDocumentHtml(composedDocumentHtml)
			: composedDocumentHtml;

		return `${this.DOC_TYPE}${documentHtml}`;
	}

	private async composeDocumentShell(input: {
		primaryComponent: EcoComponent;
		primaryProps: Record<string, unknown>;
		layout?: {
			component: EcoComponent;
			props?: Record<string, unknown>;
		};
		htmlTemplate: EcoComponent;
		documentProps: Record<string, unknown>;
	}): Promise<{ documentHtml: string }> {
		const rendererCache = new Map<string, unknown>() as BaseIntegrationContext['rendererCache'];
		const primaryRender = await this.renderComponentWithForeignChildren({
			component: input.primaryComponent,
			props: input.primaryProps,
			integrationContext: { rendererCache },
		});
		const layoutRender = input.layout
			? await this.renderComponentWithForeignChildren({
					component: input.layout.component,
					props: input.layout.props ?? {},
					children: primaryRender.html,
					integrationContext: { rendererCache },
				})
			: undefined;
		const documentRender = await this.renderComponentWithForeignChildren({
			component: input.htmlTemplate,
			props: input.documentProps,
			children: layoutRender?.html ?? primaryRender.html,
			integrationContext: { rendererCache },
		});

		this.appendProcessedDependencies(primaryRender.assets, layoutRender?.assets, documentRender.assets);

		return {
			documentHtml: documentRender.html,
		};
	}

	/**
	 * Renders one string-first component with serialized children and collects its assets.
	 *
	 * String-oriented integrations frequently share the same component contract:
	 * pass serialized children through props, coerce the render result to HTML, and
	 * attach any component-scoped dependencies. This helper centralizes that flow
	 * so integrations can opt into shared orchestration without repeating the same
	 * string-render boilerplate.
	 *
	 * @param input - Component render input.
	 * @param component - String-oriented component implementation to execute.
	 * @returns Structured component render result for orchestration paths.
	 */
	protected async renderStringComponentWithSerializedChildren(
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

	protected getForeignSubtreeTokenPrefix(): string {
		return `__${this.name}_foreign_subtree__`;
	}

	protected getForeignSubtreeResolutionContextKey(): string {
		return `__${this.name}_foreign_subtree_runtime__`;
	}

	protected getQueuedForeignSubtreeResolutionContext<TContext extends QueuedForeignSubtreeResolutionContext>(
		input: ComponentRenderInput,
		runtimeContextKey = this.getForeignSubtreeResolutionContextKey(),
	): TContext | undefined {
		return this.queuedForeignSubtreeResolutionService.getRuntimeContext<TContext>(input, runtimeContextKey);
	}

	protected async resolveQueuedForeignSubtreeTokens(
		html: string,
		queuedResolutionsByToken: Map<string, QueuedForeignSubtreeResolution>,
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

	protected createQueuedForeignSubtreeResolutionRuntime<
		TContext extends QueuedForeignSubtreeResolutionContext,
	>(options: {
		renderInput: ComponentRenderInput;
		rendererCache: Map<string, IntegrationRenderer<any>>;
		runtimeContextKey?: string;
		tokenPrefix?: string;
		createRuntimeContext?: (
			integrationContext: BaseIntegrationContext & Record<string, unknown>,
			rendererCache: Map<string, unknown>,
		) => TContext;
	}): ForeignChildRuntime {
		return this.queuedForeignSubtreeResolutionService.createRuntime<TContext>({
			renderInput: options.renderInput,
			rendererCache: options.rendererCache as Map<string, unknown>,
			runtimeContextKey: options.runtimeContextKey ?? this.getForeignSubtreeResolutionContextKey(),
			tokenPrefix: options.tokenPrefix ?? this.getForeignSubtreeTokenPrefix(),
			shouldQueueForeignChild: (input) => this.shouldResolveForeignChildInOwningRenderer(input),
			createRuntimeContext: options.createRuntimeContext,
		});
	}

	protected async resolveRendererOwnedQueuedForeignSubtreeHtml<
		TContext extends QueuedForeignSubtreeResolutionContext,
	>(options: {
		html: string;
		runtimeContext?: TContext;
		queueLabel: string;
		renderQueuedChildren: (
			children: unknown,
			runtimeContext: TContext,
			queuedResolutionsByToken: Map<string, QueuedForeignSubtreeResolution>,
			resolveToken: (token: string) => Promise<string>,
		) => Promise<{ assets: ProcessedAsset[]; html?: string }>;
	}): Promise<{ assets: ProcessedAsset[]; html: string }> {
		return this.queuedForeignSubtreeResolutionService.resolveQueuedHtml({
			html: options.html,
			runtimeContext: options.runtimeContext,
			queueLabel: options.queueLabel,
			renderQueuedChildren: options.renderQueuedChildren,
			resolveForeignSubtree: (input, rendererCache) =>
				this.resolveForeignSubtreeInOwningRenderer(
					input,
					rendererCache as Map<string, IntegrationRenderer<any>>,
				),
			applyAttributesToFirstElement: (html, attributes) =>
				this.htmlTransformer.applyAttributesToFirstElement(html, attributes),
			dedupeProcessedAssets: (assets) => this.htmlTransformer.dedupeProcessedAssets(assets),
		});
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
		const queuedForeignSubtreeResolution = await this.resolveRendererOwnedQueuedForeignSubtreeHtml({
			html: componentRender.html,
			runtimeContext: this.getQueuedForeignSubtreeResolutionContext<QueuedForeignSubtreeResolutionContext>(input),
			queueLabel: 'String',
			renderQueuedChildren: async (children, _runtimeContext, queuedResolutionsByToken, resolveToken) => {
				if (children === undefined) {
					return { assets: [], html: undefined };
				}

				const html = await this.resolveQueuedForeignSubtreeTokens(
					typeof children === 'string' ? children : String(children ?? ''),
					queuedResolutionsByToken,
					resolveToken,
				);

				return { assets: [], html };
			},
		});
		const mergedAssets = this.htmlTransformer.dedupeProcessedAssets([
			...(componentRender.assets ?? []),
			...queuedForeignSubtreeResolution.assets,
		]);

		return {
			...componentRender,
			html: queuedForeignSubtreeResolution.html,
			rootTag: this.getRootTagName(queuedForeignSubtreeResolution.html),
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
		this.routeRenderOrchestrator = new RouteRenderOrchestrator(appConfig, assetProcessingService, {
			ownershipValidationService: new OwnershipValidationService(appConfig),
		});
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
	 * Builds the internal route-render adapter consumed by `RouteRenderOrchestrator`.
	 *
	 * The route orchestrator needs a narrow orchestration contract, but those hooks should
	 * not become public API on the renderer base class. Keeping the adapter object
	 * local to the execution path lets the orchestrator depend on one explicit seam while
	 * subclasses continue to override protected renderer behavior directly.
	 */
	protected createRouteRenderOrchestratorAdapter(): RouteRenderOrchestratorAdapter<C> {
		return {
			name: this.name,
			resolveRouteRenderInputs: (routeOptions) => this.resolveRouteRenderInputs(routeOptions),
			resolveRouteAssets: (input) => this.resolveRouteAssets(input),
			resolveRoutePageComponentRender: (input) => this.resolveRoutePageComponentRender(input),
			renderRouteBody: (renderOptions) => this.renderRouteBody(renderOptions),
			getRouteHtmlFinalization: (renderOptions) => this.getRouteHtmlFinalization(renderOptions),
			transformRouteResponse: (response) => this.transformRouteResponse(response),
		};
	}

	protected async resolveRouteRenderInputs(
		routeOptions: RouteRendererOptions,
	): Promise<RouteRenderOrchestratorResolvedInputs> {
		const pageModule = await this.pageModuleLoaderService.resolvePageModule({
			file: routeOptions.file,
			importPageFileFn: (targetFile) => this.importPageFile(targetFile),
		});
		const { Page, integrationSpecificProps } = pageModule;
		const HtmlTemplate = await this.getHtmlTemplate();
		const Layout = Page.config?.layout;
		const { props, metadata } = await this.pageModuleLoaderService.resolvePageData({
			pageModule,
			routeOptions,
		});

		return {
			Page,
			HtmlTemplate: HtmlTemplate as EcoComponent<HtmlTemplateProps>,
			Layout,
			props,
			metadata,
			integrationSpecificProps,
		};
	}

	protected async resolveRouteAssets(input: {
		routeOptions: RouteRendererOptions;
		components: (EcoComponent | Partial<EcoComponent>)[];
	}): Promise<{ resolvedDependencies: ProcessedAsset[]; pageBrowserGraph?: { assets: ProcessedAsset[] } }> {
		return {
			resolvedDependencies: await this.resolveDependencies(input.components),
			pageBrowserGraph: await this.buildPageBrowserGraph(input.routeOptions.file),
		};
	}

	protected async resolveRoutePageComponentRender(input: {
		Page: EcoComponent;
		Layout?: EcoComponent;
		props: Record<string, unknown>;
		routeOptions: RouteRendererOptions;
	}): Promise<ComponentRenderResult | undefined> {
		if (!this.shouldRenderPageComponent({ Page: input.Page, Layout: input.Layout, options: input.routeOptions })) {
			return undefined;
		}

		return this.renderComponentWithForeignChildren({
			component: input.Page,
			props: {
				...input.props,
				params: input.routeOptions.params || {},
				query: input.routeOptions.query || {},
			},
			integrationContext: {
				componentInstanceId: 'eco-page-root',
			},
		});
	}

	protected async renderRouteBody(renderOptions: IntegrationRendererRenderOptions<C>): Promise<RouteRendererBody> {
		return this.render(renderOptions);
	}

	protected getRouteHtmlFinalization(renderOptions: IntegrationRendererRenderOptions<C>): RouteHtmlFinalization {
		const componentRootAttributes =
			renderOptions.componentRender?.canAttachAttributes &&
			renderOptions.componentRender.rootAttributes &&
			Object.keys(renderOptions.componentRender.rootAttributes).length > 0
				? (renderOptions.componentRender.rootAttributes as Record<string, string>)
				: undefined;
		const documentAttributes = this.getDocumentAttributes(renderOptions);
		const hasStructuralFinalization =
			(componentRootAttributes && Object.keys(componentRootAttributes).length > 0) ||
			(documentAttributes && Object.keys(documentAttributes).length > 0);

		if (!hasStructuralFinalization) {
			return {};
		}

		return {
			finalizeHtml: (html) => {
				let renderedHtml = html;

				if (componentRootAttributes) {
					renderedHtml = this.htmlTransformer.applyAttributesToFirstBodyElement(
						renderedHtml,
						componentRootAttributes,
					);
				}

				if (documentAttributes) {
					renderedHtml = this.htmlTransformer.applyAttributesToHtmlElement(renderedHtml, documentAttributes);
				}

				return renderedHtml;
			},
		};
	}

	protected async transformRouteResponse(response: Response): Promise<RouteRendererBody> {
		const transformedResponse = await this.htmlTransformer.transform(response);
		return (transformedResponse.body ?? (await transformedResponse.text())) as RouteRendererBody;
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
		adapter = this.createRouteRenderOrchestratorAdapter(),
	): Promise<IntegrationRendererRenderOptions<C>> {
		const renderOptions = await this.routeRenderOrchestrator.prepareRenderOptions(options, adapter);
		invariant(renderOptions.pagePackage !== undefined, 'Expected render preparation to produce a page package');
		this.htmlTransformer.setPagePackage(renderOptions.pagePackage);
		return renderOptions;
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
	 * Executes the integration renderer with the provided options.
	 *
	 * Execution flow:
	 * 1. Build normalized render options (`prepareRenderOptions`).
	 * 2. Render the route body once.
	 * 3. Reject unresolved route-level eco-marker artifacts.
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
		const adapter = this.createRouteRenderOrchestratorAdapter();
		const renderOptions = await this.prepareRenderOptions(options, adapter);
		return this.routeRenderOrchestrator.executePrepared(renderOptions, adapter);
	}

	/**
	 * Finalizes already-resolved HTML for explicit renderer-owned paths.
	 *
	 * This keeps document and root-attribute stamping plus HTML transformation
	 * available after a renderer has completed nested foreign-subtree resolution without
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
		invariant(!!integrationPlugin, `[ecopages] Integration not found for foreign owner: ${integrationName}`);
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

	protected async resolveForeignChildInOwningRenderer(
		input: ComponentRenderInput,
		rendererCache: Map<string, IntegrationRenderer<any>>,
	): Promise<ComponentRenderResult | undefined> {
		return await this.runInForeignOwningRenderer(input, rendererCache, (owningRenderer, delegatedInput) =>
			owningRenderer.renderComponentWithForeignChildren(delegatedInput),
		);
	}

	protected async resolveForeignSubtreeInOwningRenderer(
		input: ComponentRenderInput,
		rendererCache: Map<string, IntegrationRenderer<any>>,
	): Promise<ForeignSubtreeRenderPayload | undefined> {
		return await this.runInForeignOwningRenderer(input, rendererCache, (owningRenderer, delegatedInput) =>
			owningRenderer.renderForeignSubtree(delegatedInput),
		);
	}

	private async runInForeignOwningRenderer<TResult>(
		input: ComponentRenderInput,
		rendererCache: Map<string, IntegrationRenderer<any>>,
		run: (owningRenderer: IntegrationRenderer<any>, delegatedInput: ComponentRenderInput) => Promise<TResult>,
	): Promise<TResult | undefined> {
		const foreignOwnerIntegrationName = this.getForeignOwnerIntegrationName(input.component);
		if (!foreignOwnerIntegrationName) {
			return undefined;
		}

		const owningRenderer = this.getIntegrationRendererForName(foreignOwnerIntegrationName, rendererCache);
		if (owningRenderer === this || owningRenderer.name === this.name) {
			return undefined;
		}

		return await run(owningRenderer, this.withOwningRendererCache(input, rendererCache));
	}

	/**
	 * Renders one component under this integration's foreign-child runtime and resolves
	 * any nested foreign children captured during that render.
	 *
	 * Without this wrapper, a component tree with foreign-owned descendants would
	 * render them with no active foreign-child runtime, which bypasses the owning
	 * renderer's nested foreign-child handoff.
	 */
	async renderComponentWithForeignChildren(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		const rendererCache =
			this.getOwningRendererCache(input.integrationContext) ?? new Map<string, IntegrationRenderer<any>>();
		const delegatedForeignChildRender = await this.resolveForeignChildInOwningRenderer(input, rendererCache);

		if (delegatedForeignChildRender) {
			return delegatedForeignChildRender;
		}

		const hasForeignChildren = this.hasForeignChildDescendants(input.component);
		const activeRenderContext = getComponentRenderContext();

		if (!hasForeignChildren) {
			if (!activeRenderContext || activeRenderContext.currentIntegration === this.name) {
				return this.normalizeComponentRenderOutput(await this.renderComponent(input));
			}

			const sameIntegrationExecution = await runWithComponentRenderContext(
				{
					currentIntegration: this.name,
				},
				async () => this.renderComponent(input),
			);

			return this.normalizeComponentRenderOutput(sameIntegrationExecution.value);
		}

		const execution = await runWithComponentRenderContext(
			{
				currentIntegration: this.name,
				foreignChildRuntime: this.createForeignChildRuntime({
					renderInput: input,
					rendererCache,
				}),
			},
			async () => this.renderComponent(input),
		);

		return this.normalizeComponentRenderOutput(execution.value);
	}

	/**
	 * Compatibility foreign-subtree contract that exposes a narrower payload shape for
	 * future route-composition work while preserving the current
	 * `renderComponentWithForeignChildren()` runtime semantics.
	 */
	async renderForeignSubtree(input: ComponentRenderInput): Promise<ForeignSubtreeRenderPayload> {
		const result = await this.renderComponentWithForeignChildren(input);

		return {
			html: result.html,
			assets: result.assets ?? [],
			rootTag: result.rootTag,
			rootAttributes: result.rootAttributes,
			attachmentPolicy: result.canAttachAttributes ? { kind: 'first-element' } : { kind: 'none' },
			integrationName: result.integrationName,
		};
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
	 * Returns whether the component dependency tree crosses into another
	 * integration.
	 *
	 * This keeps foreign-child runtime setup narrow: same-integration trees can render
	 * directly without paying the queue orchestration cost.
	 */
	protected hasForeignChildDescendants(component: EcoComponent): boolean {
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
	 * In foreign-subtree resolution, this method is the integration-owned step that turns an
	 * already-resolved deferred foreign subtree into concrete HTML, assets, and optional
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
	 * Builds the Page Browser Graph owned by this integration for one Page.
	 * This method can be optionally overridden by the specific integration renderer.
	 *
	 * @param file - The file path to build assets for.
	 * @returns The structured Page Browser Graph or undefined.
	 */
	protected async buildPageBrowserGraph(_file: string): Promise<{ assets: ProcessedAsset[] } | undefined> {
		return undefined;
	}

	/**
	 * Creates the per-render foreign-child runtime adopted by the shared component
	 * render context.
	 *
	 * Real mixed-integration renderers should override this and keep foreign
	 * child resolution inside their own renderer-owned queue. The base runtime
	 * fails fast when a renderer crosses into a foreign owner without providing its
	 * own handoff mechanism.
	 */
	protected createForeignChildRuntime(_options: {
		renderInput: ComponentRenderInput;
		rendererCache: Map<string, IntegrationRenderer<any>>;
	}): ForeignChildRuntime {
		const decideForeignChildInterception = (input: ForeignChildResolutionDecisionInput) => {
			if (!this.shouldResolveForeignChildInOwningRenderer(input)) {
				return { kind: 'inline' as const };
			}

			throw new Error(
				`[ecopages] ${this.name} renderer crossed into ${input.targetIntegration} without a renderer-owned foreign-child runtime. Override createForeignChildRuntime() to resolve foreign children inside the owning renderer.`,
			);
		};

		const runtime: ForeignChildRuntime = {
			interceptForeignChild: decideForeignChildInterception,
			interceptForeignChildSync: decideForeignChildInterception,
		};

		return runtime;
	}

	/**
	 * Resolves whether a foreign child should leave the current render pass and be
	 * resolved by its owning renderer.
	 *
	 * Foreign children owned by the current integration always render inline.
	 * Foreign-owned children must be handed off by a renderer-owned runtime.
	 *
	 * @param input Foreign-child metadata for the active render pass.
	 * @returns `true` when the foreign child should leave the current pass; otherwise `false`.
	 */
	protected shouldResolveForeignChildInOwningRenderer(input: ForeignChildResolutionDecisionInput): boolean {
		return !!input.targetIntegration && input.targetIntegration !== input.currentIntegration;
	}
}
