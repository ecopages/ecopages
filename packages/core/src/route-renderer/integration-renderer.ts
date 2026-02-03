/**
 * This module contains the abstract class for the Integration Renderer
 * Every integration renderer should extend this class
 * @module
 */

import path from 'node:path';
import type { EcoPagesAppConfig, IHmrManager } from '../internal-types.ts';
import type {
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
	StaticPageContext,
} from '../public-types.ts';
import {
	type AssetDefinition,
	AssetFactory,
	type AssetProcessingService,
	type ProcessedAsset,
} from '../services/asset-processing-service/index.ts';
import { HtmlTransformerService } from '../services/html-transformer.service.ts';
import { invariant } from '../utils/invariant.ts';
import { HttpError } from '../errors/http-error.ts';
import { LocalsAccessError } from '../errors/locals-access-error.ts';

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
	declare protected options: Required<IntegrationRendererRenderOptions>;
	protected runtimeOrigin: string;

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
		const resolvedDependencies = await this.resolveDependencies(componentsToResolve);
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
			const { default: HtmlTemplate } = await import(absolutePaths.htmlTemplatePath);
			return HtmlTemplate;
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
		return getStaticProps && options?.params
			? await getStaticProps({
					pathname: { params: options.params },
					appConfig: this.appConfig,
					runtimeOrigin: this.runtimeOrigin,
				})
					.then((data) => data)
					.catch((err) => {
						throw new Error(`Error fetching static props: ${err.message}`);
					})
			: {
					props: {},
					metadata: undefined,
				};
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
		let metadata: PageMetadataProps = this.appConfig.defaultMetadata;
		if (getMetadata) {
			const dynamicMetadata = await getMetadata({
				params,
				query,
				props,
				appConfig: this.appConfig,
			});
			metadata = { ...metadata, ...dynamicMetadata };
		}
		return metadata;
	}

	/**
	 * Imports the page file from the specified path.
	 * It uses dynamic import to load the file and returns the imported module.
	 *
	 * @param file - The file path to import.
	 * @returns The imported module.
	 */
	protected async importPageFile(file: string): Promise<EcoPageFile> {
		try {
			const query = process.env.NODE_ENV === 'development' ? `?update=${Date.now()}` : '';
			return await import(file + query);
		} catch (error) {
			invariant(false, `Error importing page file: ${error}`);
		}
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
		return path.join(componentDir, pathUrl);
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
		const scriptsPaths = [...new Set(scripts?.map((script) => this.resolveDependencyPath(componentDir, script)))];

		const stylesheetsPaths = [
			...new Set(stylesheets?.map((style) => this.resolveDependencyPath(componentDir, style))),
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
		const getSafeFileName = (filepath: string): string => {
			const EXTENSIONS_TO_JS = ['ts', 'tsx'];
			const safe = filepath.replace(new RegExp(`\\.(${EXTENSIONS_TO_JS.join('|')})$`), '.js');
			return safe.startsWith('./') ? safe.slice(2) : safe;
		};

		const baseDir = componentDir.split(this.appConfig.srcDir)[1] ?? '';
		const resolvedPaths = scripts.map((script) => {
			return [AssetFactory.RESOLVED_ASSETS_DIR, baseDir, getSafeFileName(script)]
				.filter(Boolean)
				.join('/')
				.replace(/\/+/g, '/');
		});

		return resolvedPaths.join(',');
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
		if (!this.assetProcessingService?.processDependencies) return [];
		const dependencies: AssetDefinition[] = [];

		for (const component of components) {
			const componentFile = component.config?.__eco?.file;
			if (!componentFile) continue;

			const stylesheetsSet = new Set<string>();
			const scriptsSet = new Set<string>();

			/**
			 * Recursively collects dependencies from component config.
			 * Mutates config._resolvedScripts when lazy scripts are present.
			 */
			const collect = (config: EcoComponent['config']) => {
				if (!config?.dependencies) return;

				const file = config.__eco?.file;
				if (!file) return;
				const dir = path.dirname(file);

				if (config.dependencies.stylesheets) {
					for (const style of config.dependencies.stylesheets) {
						stylesheetsSet.add(this.resolveDependencyPath(dir, style));
					}
				}

				if (config.dependencies.scripts) {
					for (const script of config.dependencies.scripts) {
						scriptsSet.add(this.resolveDependencyPath(dir, script));
					}
				}

				/**
				 * Process lazy dependencies - resolve paths and store for auto-wrapping.
				 * Lazy scripts are bundled but excluded from HTML output.
				 */
				if (config.dependencies.lazy?.scripts) {
					const lazyScriptPaths = this.resolveLazyScripts(dir, config.dependencies.lazy.scripts);
					config._resolvedScripts = lazyScriptPaths;

					for (const script of config.dependencies.lazy.scripts) {
						const resolvedPath = this.resolveDependencyPath(dir, script);
						dependencies.push(
							AssetFactory.createFileScript({
								filepath: resolvedPath,
								position: 'head',
								excludeFromHtml: true,
								attributes: {
									type: 'module',
									defer: '',
								},
							}),
						);
					}
				}

				if (config.dependencies.components) {
					for (const component of config.dependencies.components) {
						if (component.config) {
							collect(component.config);
						}
					}
				}
			};

			collect(component.config);

			const deps = {
				stylesheets: Array.from(stylesheetsSet),
				scripts: Array.from(scriptsSet),
			};

			dependencies.push(
				...deps.stylesheets.map((stylesheet) =>
					AssetFactory.createFileStylesheet({
						filepath: stylesheet,
						position: 'head',
						attributes: { rel: 'stylesheet' },
					}),
				),
				...deps.scripts.map((script) =>
					AssetFactory.createFileScript({
						filepath: script,
						position: 'head',
						attributes: {
							type: 'module',
							defer: '',
						},
					}),
				),
			);
		}

		const hasLazyDependencies = dependencies.some((dep) => dep.kind === 'script' && dep.excludeFromHtml === true);

		if (hasLazyDependencies) {
			dependencies.unshift(
				AssetFactory.createNodeModuleScript({
					position: 'head',
					importPath: '@ecopages/scripts-injector',
					name: 'scripts-injector',
					attributes: {
						type: 'module',
						defer: '',
					},
				}),
			);
		}

		return await this.assetProcessingService.processDependencies(dependencies, this.name);
	}

	/**
	 * Prepares the render options for the integration renderer.
	 * It imports the page file, collects dependencies, and prepares the render options.
	 *
	 * @param options - The route renderer options.
	 * @returns The prepared render options.
	 */
	protected async prepareRenderOptions(options: RouteRendererOptions): Promise<IntegrationRendererRenderOptions> {
		const pageModule = await this.resolvePageModule(options.file);
		const { Page, integrationSpecificProps } = pageModule;

		const HtmlTemplate = await this.getHtmlTemplate();

		const { props, metadata } = await this.resolvePageData(pageModule, options);

		const Layout = Page.config?.layout;

		const componentsToResolve = Layout ? [HtmlTemplate, Layout, Page] : [HtmlTemplate, Page];
		const resolvedDependencies = await this.resolveDependencies(componentsToResolve);

		const pageDeps = (await this.buildRouteRenderAssets(options.file)) || [];

		const allDependencies = [...resolvedDependencies, ...pageDeps];

		this.htmlTransformer.setProcessedDependencies(allDependencies);

		const pageProps = {
			...props,
			params: options.params || {},
			query: options.query || {},
		};

		const cacheStrategy = (Page as EcoPageComponent<any>).cache;
		const defaultCacheStrategy = this.appConfig.cache?.defaultStrategy ?? 'static';
		const effectiveCacheStrategy = cacheStrategy ?? defaultCacheStrategy;
		const localsAvailable = effectiveCacheStrategy === 'dynamic' && options.locals !== undefined;

		const locals = localsAvailable
			? (options.locals as NonNullable<RouteRendererOptions['locals']>)
			: (createLocalsProxy(options.file) as unknown as NonNullable<RouteRendererOptions['locals']>);

		return {
			...options,
			...integrationSpecificProps,
			resolvedDependencies,
			HtmlTemplate,
			Layout,
			props,
			Page: Page as EcoFunctionComponent<StaticPageContext, EcoPagesElement>,
			cacheStrategy: (Page as EcoPageComponent<any>).cache,
		};
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
		const module = await this.importPageFile(file);
		const {
			default: Page,
			getStaticProps: moduleGetStaticProps,
			getMetadata: moduleGetMetadata,
			...integrationSpecificProps
		} = module;

		return {
			Page,
			/* Prefer attached static methods (new API) over exports (legacy) */
			getStaticProps: Page.staticProps ?? moduleGetStaticProps,
			getMetadata: Page.metadata ?? moduleGetMetadata,
			integrationSpecificProps,
		};
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
		const { props } = await this.getStaticProps(pageModule.getStaticProps, options);

		const metadata = await this.getMetadataProps(pageModule.getMetadata, {
			props,
			params: options.params ?? {},
			query: options.query ?? {},
		} as GetMetadataContext);

		return { props, metadata };
	}

	/**
	 * Executes the integration renderer with the provided options.
	 *
	 * @param options - The route renderer options.
	 * @returns The rendered body with cache strategy.
	 */
	public async execute(options: RouteRendererOptions): Promise<RouteRenderResult> {
		const renderOptions = (await this.prepareRenderOptions(options)) as IntegrationRendererRenderOptions<C>;

		const body = await this.htmlTransformer
			.transform(
				new Response((await this.render(renderOptions)) as BodyInit, {
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
