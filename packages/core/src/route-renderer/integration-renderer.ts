/**
 * This module contains the abstract class for the Integration Renderer
 * Every integration renderer should extend this class
 * @module
 */

import type { EcoPagesAppConfig, IHmrManager } from '../internal-types.ts';
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
	ResolvedLazyTrigger,
	RouteRendererBody,
	RouteRendererOptions,
	RouteRenderResult,
	StaticPageContext,
} from '../public-types.ts';
import {
	type AssetProcessingService,
	type ProcessedAsset,
} from '../services/asset-processing-service/index.ts';
import { HtmlTransformerService } from '../services/html-transformer.service.ts';
import { invariant } from '../utils/invariant.ts';
import { HttpError } from '../errors/http-error.ts';
import { LocalsAccessError } from '../errors/locals-access-error.ts';
import { DependencyResolverService } from './dependency-resolver.ts';
import { HtmlPostProcessingService } from './html-post-processing.service.ts';
import { PageModuleLoaderService } from './page-module-loader.ts';
import { MarkerGraphResolver, type MarkerGraphContext } from './marker-graph-resolver.ts';
import { RenderPreparationService } from './render-preparation.service.ts';
import {
	runWithComponentRenderContext,
	type ComponentGraphContext as CapturedComponentGraphContext,
} from '../eco/component-render-context.ts';

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

type ComponentGraphContext = {
	propsByRef?: Record<string, Record<string, unknown>>;
	slotChildrenByRef?: MarkerGraphContext['slotChildrenByRef'];
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
	protected htmlTransformer: HtmlTransformerService;
	protected hmrManager?: IHmrManager;
	protected resolvedIntegrationDependencies: ProcessedAsset[] = [];
	declare protected options: Required<IntegrationRendererRenderOptions>;
	protected runtimeOrigin: string;
	protected dependencyResolverService: DependencyResolverService;
	protected pageModuleLoaderService: PageModuleLoaderService;
	protected markerGraphResolver: MarkerGraphResolver;
	protected renderPreparationService: RenderPreparationService;
	protected htmlPostProcessingService: HtmlPostProcessingService;

	protected DOC_TYPE = '<!DOCTYPE html>';

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
		const resolvedDependencies = this.htmlPostProcessingService.dedupeProcessedAssets(
			await this.resolveDependencies(componentsToResolve),
		);
		this.htmlTransformer.setProcessedDependencies(resolvedDependencies);
		return resolvedDependencies;
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
		this.markerGraphResolver = new MarkerGraphResolver();
		this.renderPreparationService = new RenderPreparationService(appConfig, assetProcessingService);
		this.htmlPostProcessingService = new HtmlPostProcessingService();
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
		const { absolutePaths } = this.appConfig;
		try {
			const { default: HtmlTemplate } = await this.importPageFile(absolutePaths.htmlTemplatePath);
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

	/**
	 * Imports the page file from the specified path.
	 * It uses dynamic import to load the file and returns the imported module.
	 *
	 * @param file - The file path to import.
	 * @returns The imported module.
	 */
	protected async importPageFile(file: string): Promise<EcoPageFile> {
		return this.pageModuleLoaderService.importPageFile(file);
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
				this.renderComponent({
					component,
					props,
					integrationContext: {
						componentInstanceId: 'eco-page-root',
					},
				}),
			setProcessedDependencies: (dependencies) => this.htmlTransformer.setProcessedDependencies(dependencies),
			dedupeProcessedAssets: (assets) => this.htmlPostProcessingService.dedupeProcessedAssets(assets),
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
	 * 2. Render once inside component render context to capture marker graph refs.
	 * 3. Merge captured refs with optional explicit page-module graph context.
	 * 4. Resolve any `eco-marker` graph bottom-up and merge produced assets.
	 * 5. Optionally apply root attributes for page/component root boundaries.
	 * 6. Run HTML transformer with final dependency set.
	 *
	 * Stream-safety note: the first render result is normalized to a string once,
	 * then the pipeline continues with that immutable HTML value to avoid disturbed
	 * response-body errors.
	 *
	 * @param options Route renderer options.
	 * @returns Rendered route body plus effective cache strategy.
	 */
	public async execute(options: RouteRendererOptions): Promise<RouteRenderResult> {
		const renderOptions = (await this.prepareRenderOptions(options)) as IntegrationRendererRenderOptions<C>;
		const shouldApplyComponentRootAttributes =
			renderOptions.componentRender?.canAttachAttributes &&
			renderOptions.componentRender.rootAttributes &&
			Object.keys(renderOptions.componentRender.rootAttributes).length > 0;

		let capturedGraphContext: CapturedComponentGraphContext = {
			propsByRef: {},
			slotChildrenByRef: {},
		};
		const renderExecution = await runWithComponentRenderContext(
			{
				currentIntegration: this.name,
			},
			async () => this.render(renderOptions),
		);
		capturedGraphContext = renderExecution.graphContext;

		let renderedHtml = await new Response(renderExecution.value as BodyInit).text();
		const explicitComponentGraphContext =
			(renderOptions as IntegrationRendererRenderOptions<C> & { componentGraphContext?: ComponentGraphContext })
				.componentGraphContext ?? {};
		const componentGraphContext: ComponentGraphContext = {
			propsByRef: {
				...(capturedGraphContext.propsByRef ?? {}),
				...(explicitComponentGraphContext.propsByRef ?? {}),
			},
			slotChildrenByRef: {
				...(capturedGraphContext.slotChildrenByRef ?? {}),
				...(explicitComponentGraphContext.slotChildrenByRef ?? {}),
			},
		};

		if (renderedHtml.includes('<eco-marker')) {
			const componentsToResolve = renderOptions.Layout
				? [renderOptions.HtmlTemplate as EcoComponent, renderOptions.Layout as EcoComponent, renderOptions.Page]
				: [renderOptions.HtmlTemplate as EcoComponent, renderOptions.Page];
			const markerResolution = await this.resolveMarkerGraphHtml({
				html: renderedHtml,
				componentsToResolve,
				graphContext: componentGraphContext,
			});
			renderedHtml = markerResolution.html;

			if (markerResolution.assets.length > 0) {
				const mergedDependencies = this.htmlPostProcessingService.dedupeProcessedAssets([
					...this.htmlTransformer.getProcessedDependencies(),
					...markerResolution.assets,
				]);
				this.htmlTransformer.setProcessedDependencies(mergedDependencies);
			}
		}

		if (shouldApplyComponentRootAttributes) {
			renderedHtml = this.htmlPostProcessingService.applyAttributesToFirstBodyElement(
				renderedHtml,
				renderOptions.componentRender?.rootAttributes as Record<string, string>,
			);
		}

		const body = await this.htmlTransformer
			.transform(
				new Response(renderedHtml, {
					headers: {
						'Content-Type': 'text/html',
					},
				}),
			)
			.then((res: Response) => {
				return res.body as RouteRendererBody;
			});

		return {
			body,
			cacheStrategy: renderOptions.cacheStrategy,
		};
	}

	/**
	 * Resolves all `eco-marker` placeholders in rendered HTML using integration
	 * dispatch and bottom-up graph execution.
	 *
	 * Resolver callback behavior per marker:
	 * - resolve component definition by `componentRef`
	 * - resolve serialized props by `propsRef`
	 * - stitch resolved child HTML when `slotRef` is present
	 * - dispatch to target integration `renderComponent`
	 * - collect produced assets and apply root attributes when attachable
	 *
	 * @param options.html HTML that may still contain marker tokens.
	 * @param options.componentsToResolve Component set used to build component ref registry.
	 * @param options.graphContext Props/slot linkage captured during render.
	 * @returns Resolved HTML plus any component-scoped assets produced while resolving nodes.
	 * @throws Error when marker component refs or props refs cannot be resolved.
	 */
	private async resolveMarkerGraphHtml(options: {
		html: string;
		componentsToResolve: EcoComponent[];
		graphContext: ComponentGraphContext;
	}): Promise<{ html: string; assets: ProcessedAsset[] }> {
		const integrationRendererCache = new Map<string, IntegrationRenderer>();
		return this.markerGraphResolver.resolve({
			html: options.html,
			componentsToResolve: options.componentsToResolve,
			graphContext: options.graphContext,
			resolveRenderer: (integrationName) =>
				this.getIntegrationRendererForName(integrationName, integrationRendererCache),
			applyAttributesToFirstElement: (html, attributes) =>
				this.htmlPostProcessingService.applyAttributesToFirstElement(html, attributes),
		});
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
		invariant(!!integrationPlugin, `[ecopages] Integration not found for marker: ${integrationName}`);
		const renderer = integrationPlugin.initializeRenderer();
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
	 * Integrations can override this for richer behavior (asset emission,
	 * root attributes, integration-specific hydration metadata).
	 *
	 * @param input Component render request.
	 * @returns Structured render result used by marker/page orchestration.
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
		const rootTag = html.match(/^\s*<([a-zA-Z][a-zA-Z0-9:-]*)\b/);
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
}
