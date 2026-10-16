import path from 'node:path';
import type { AppRuntime } from '../../../config/app-runtime.ts';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import { RouteRendererFactory } from '../../../route-renderer/route-renderer.ts';
import { RouteRegistry } from '../../../router/server/route-registry.ts';
import type { StaticGenerationRoute } from '../../../router/server/route-registry.ts';
import { startupTrace } from '../../../diagnostics/startup-trace.ts';
import { requireBuildQueue } from '../../../build/runtime/build-queue.ts';
import { runWithBuildInputIndex } from '../../../build/cache/build-input-dependency-index.ts';
import { requireAppRuntime } from '../../../config/app-runtime.ts';
import { MemoryCacheStore } from '../../../services/cache/memory-cache-store.ts';
import { PageCacheService } from '../../../services/cache/page-cache-service.ts';
import { SchemaValidationService } from '../../../services/validation/schema-validation-service.ts';
import { ExplicitStaticRouteMatcher } from '../http/explicit-static-route-matcher.ts';
import { FileSystemServerResponseFactory } from '../http/fs-server-response-factory.ts';
import { FileSystemResponseMatcher } from '../http/fs-server-response-matcher.ts';
import { ServerRouteHandler } from './server-route-handler.ts';
import { createRenderContext } from './render-context.ts';
import { ApiRequestPipeline } from '../http/api-request-pipeline.ts';
import { isHtmlResponse, withUncachedDevHtml } from '../hmr/hmr-html-response.ts';
import type { EcoPageFile } from '../../../types/public-types.ts';
import { createAppServerModuleTranspiler } from '../../../services/module-loading/app-server-module-transpiler.service.ts';
import { resolveInternalExecutionDir } from '../../../utils/resolve-work-dir.ts';
import { ensureIntegrationRuntimeReady } from '../../../build/app-build-manifest-runtime.ts';
import type { RouteRegistryPageModuleAdapter } from '../../../router/server/route-registry.ts';
import type {
	ApiHandler,
	CacheInvalidator,
	ErrorHandler,
	RenderContext,
	StaticRoute,
	ErrorPageLoaders,
} from '../../../types/public-types.ts';

type SharedResponseHandlerDependencies = {
	cacheService: PageCacheService | null;
	fileSystemResponseMatcher: FileSystemResponseMatcher;
	explicitStaticRouteMatcher?: ExplicitStaticRouteMatcher;
};

export type ServerRequestContext<TServer = unknown> = {
	apiHandlers: ApiHandler[];
	errorHandler?: ErrorHandler<Request, TServer>;
	serverInstance?: TServer;
};

export type ServerRequestPipelineOptions = {
	appConfig: EcoPagesAppConfig;
	runtime: AppRuntime;
	watch?: boolean;
	isClientAbortError?: (error: unknown) => boolean;
};

export class ServerRequestPipeline {
	protected readonly appConfig: EcoPagesAppConfig;
	protected readonly runtime: AppRuntime;
	private readonly watchMode: boolean;
	private clientAbortDetector: (error: unknown) => boolean = () => false;
	protected router!: RouteRegistry;
	protected fileSystemResponseMatcher!: FileSystemResponseMatcher;
	protected routeRendererFactory!: RouteRendererFactory;
	protected routeHandler!: ServerRouteHandler;
	protected schemaValidator = new SchemaValidationService();
	protected readonly apiRequestPipeline = new ApiRequestPipeline<Request, unknown>({
		schemaValidator: this.schemaValidator,
		getRenderContext: () => this.getRenderContext(),
		getCacheService: () => this.getCacheService(),
		isClientAbort: (error) => this.clientAbortDetector(error),
	});
	private sharedPageCacheService: PageCacheService | null | undefined;

	public constructor(options: ServerRequestPipelineOptions) {
		this.appConfig = options.appConfig;
		this.runtime = options.runtime;
		this.watchMode = options.watch ?? false;
		this.clientAbortDetector = options.isClientAbortError ?? (() => false);
	}

	/** Renders one declared path inside the request build scope for a DevSession prewarm. */
	public async renderDevPrewarmPath(pathname: string, runtimeOrigin: string): Promise<void> {
		await requireBuildQueue(this.appConfig).withRequestScope(() =>
			runWithBuildInputIndex(requireAppRuntime(this.appConfig).buildInputIndex, async () => {
				const response = await this.routeHandler.handleResponse(
					new Request(new URL(pathname, runtimeOrigin).toString(), { method: 'GET' }),
				);
				await response.arrayBuffer();
			}),
		);
	}

	public async initializeRouteHandling(options: {
		staticRoutes: StaticRoute[];
		errorPageLoaders?: ErrorPageLoaders;
	}): Promise<void> {
		this.ensureRouteRendererFactory();
		await this.initSharedRouter();
		this.configureResponseHandlers(options);
	}

	private ensureRouteRendererFactory(): void {
		if (this.routeRendererFactory) {
			return;
		}

		this.routeRendererFactory = new RouteRendererFactory({
			appConfig: this.appConfig,
			runtime: this.runtime,
		});
	}

	public createWatchRefreshCallback(options: {
		staticRoutes: StaticRoute[];
		errorPageLoaders?: ErrorPageLoaders;
		onRoutesReady?: () => Promise<void> | void;
		onError?: (error: Error) => Promise<void> | void;
	}): () => Promise<void> {
		return async () => {
			try {
				await this.initializeRouteHandling({
					staticRoutes: options.staticRoutes,
					errorPageLoaders: options.errorPageLoaders,
				});

				if (options.onRoutesReady) {
					await options.onRoutesReady();
				}
			} catch (error) {
				if (options.onError) {
					await options.onError(error instanceof Error ? error : new Error(String(error)));
					return;
				}

				throw error;
			}
		};
	}

	/**
	 * Scans the filesystem and dynamically constructs the Route Registry.
	 *
	 * This process runs identically across both Bun and Node wrappers. It analyzes the configured pages
	 * directory, building a map of all available UI routes and API endpoints.
	 * The resulting `RouteRegistry` instance becomes the central nervous system for mapping WinterCG incoming
	 * Web Requests (`Request`) to their corresponding internal execution paths.
	 */
	protected async initSharedRouter(): Promise<void> {
		startupTrace.markPhaseStart('route-registry');

		this.router = new RouteRegistry({
			pagesDir: path.join(this.appConfig.rootDir, this.appConfig.srcDir, this.appConfig.pagesDir),
			appConfig: this.appConfig,
			origin: this.runtime.origin,
			templatesExt: this.appConfig.templatesExt,
			buildMode: !this.watchMode,
			pageModuleAdapter: this.createRouteRegistryPageModuleAdapter(),
		});

		await this.router.init();
		startupTrace.markPhaseEnd('route-registry');
	}

	private createRouteRegistryPageModuleAdapter(): RouteRegistryPageModuleAdapter {
		this.ensureRouteRendererFactory();

		return {
			loadPageModule: async (filePath) => {
				const module = (await this.routeRendererFactory
					.getPageRenderer(filePath)
					.loadPageModule(filePath)) as EcoPageFile;

				const page = module.default;

				return {
					staticPaths: page?.staticPaths ?? module.getStaticPaths,
					staticProps: page?.staticProps ?? module.getStaticProps,
				};
			},
		};
	}

	/**
	 * Sets up the unified rendering pipeline and response matching chain.
	 *
	 * It bridges several sub-systems together so that when an incoming request is received, the adapter knows:
	 * 1. How to render React/Lit pages via `RouteRendererFactory`
	 * 2. How to match logical routes to physical filesystem artifacts via `FileSystemResponseMatcher`
	 * 3. Whether to serve the response from the embedded `PageCacheService` or generate it fresh on the fly.
	 */
	public configureResponseHandlers(options: {
		staticRoutes: StaticRoute[];
		errorPageLoaders?: ErrorPageLoaders;
	}): void {
		this.ensureRouteRendererFactory();

		const { fileSystemResponseMatcher, explicitStaticRouteMatcher } = this.createSharedResponseHandlerDependencies(
			options.staticRoutes,
			options.errorPageLoaders,
		);

		this.fileSystemResponseMatcher = fileSystemResponseMatcher;
		this.routeHandler = new ServerRouteHandler({
			router: this.router,
			fileSystemResponseMatcher: this.fileSystemResponseMatcher,
			explicitStaticRouteMatcher,
		});
	}

	private createSharedResponseHandlerDependencies(
		staticRoutes: StaticRoute[],
		errorPageLoaders?: ErrorPageLoaders,
	): SharedResponseHandlerDependencies {
		const fileSystemResponseFactory = new FileSystemServerResponseFactory();

		const cacheService = this.getOrCreateSharedPageCacheService();
		const fileSystemResponseMatcher = new FileSystemResponseMatcher({
			appConfig: this.appConfig,
			assetPrefix: path.join(this.appConfig.rootDir, this.appConfig.distDir),
			router: this.router,
			routeRendererFactory: this.routeRendererFactory,
			errorPageLoaders,
			fileSystemResponseFactory,
			watchMode: this.watchMode,
			cacheService,
			defaultCacheStrategy: this.appConfig.cache?.defaultStrategy ?? 'static',
		});

		return {
			cacheService,
			fileSystemResponseMatcher,
			explicitStaticRouteMatcher:
				staticRoutes.length > 0
					? new ExplicitStaticRouteMatcher({
							appConfig: this.appConfig,
							routeRendererFactory: this.routeRendererFactory,
							staticRoutes,
						})
					: undefined,
		};
	}

	private createSharedPageCacheServiceFromConfig(): PageCacheService | null {
		const cacheConfig = this.appConfig.cache;
		const watch = this.watchMode;
		const isCacheEnabled = cacheConfig?.enabled ?? !watch;

		if (!isCacheEnabled) {
			return null;
		}

		const store =
			cacheConfig?.store === 'memory' || !cacheConfig?.store
				? new MemoryCacheStore({ maxEntries: cacheConfig?.maxEntries })
				: cacheConfig.store;

		return new PageCacheService({
			store,
			enabled: true,
			dependencyIndex: requireAppRuntime(this.appConfig).buildInputIndex,
		});
	}

	private getOrCreateSharedPageCacheService(): PageCacheService | null {
		if (this.sharedPageCacheService !== undefined) {
			return this.sharedPageCacheService;
		}

		const service = this.createSharedPageCacheServiceFromConfig();
		this.sharedPageCacheService = service;
		this.runtime.pageCache = service;
		return service;
	}

	protected getCacheService(): CacheInvalidator | null {
		return this.fileSystemResponseMatcher?.getCacheService() ?? null;
	}

	protected getRenderContext(): RenderContext {
		const serverModuleTranspiler = createAppServerModuleTranspiler(this.appConfig);

		return createRenderContext({
			integrations: this.appConfig.integrations,
			ensureIntegrationReady: (integrationName) =>
				ensureIntegrationRuntimeReady({ appConfig: this.appConfig, integrationName }),
			importServerModule: async <T = unknown>(filePath: string) =>
				await serverModuleTranspiler.importModule<T>({
					filePath,
					outdir: path.join(resolveInternalExecutionDir(this.appConfig), '.server-modules'),
					externalPackages: true,
				}),
		});
	}

	private async tryHandleSharedDevClientRequest(request: Request): Promise<Response | null> {
		return (await this.runtime.hmr?.tryHandleDevClientRequest(request)) ?? null;
	}

	private tryHandleSharedHmrRequest(request: Request): Response | null {
		return this.runtime.hmr?.tryHandleAssetRequest(request) ?? null;
	}

	private async injectSharedHmrHtmlResponse(response: Response): Promise<Response> {
		const hmrManager = this.runtime.hmr;
		if (!isHtmlResponse(response) || !hmrManager?.isEnabled()) {
			return response;
		}

		return await hmrManager.injectDevClientRuntimes(withUncachedDevHtml(response));
	}

	private async tryHandleSharedApiRequest(request: Request, context: ServerRequestContext): Promise<Response | null> {
		return await this.apiRequestPipeline.tryHandle(
			request,
			context.apiHandlers,
			context.serverInstance,
			context.errorHandler,
		);
	}

	/**
	 * Resolves an error that escaped {@link handleSharedRequest} with the same
	 * precedence as API handler errors, so `app.onError` sees it on every runtime.
	 */
	public async handleUnexpectedRequestError(
		error: unknown,
		request: Request,
		context: ServerRequestContext,
	): Promise<Response> {
		const response = await this.apiRequestPipeline.handleError(error, {
			request,
			serverInstance: context.serverInstance,
			errorHandler: context.errorHandler,
		});
		return this.watchMode && isHtmlResponse(response) ? withUncachedDevHtml(response) : response;
	}

	public getStaticBuildContext(): {
		router: RouteRegistry;
		routeRendererFactory: RouteRendererFactory;
	} {
		return { router: this.router, routeRendererFactory: this.routeRendererFactory };
	}

	public async listStaticGenerationRoutes(input: {
		runtimeOrigin: string;
	}): Promise<readonly StaticGenerationRoute[]> {
		return await this.router.listStaticGenerationRoutes(input);
	}

	/**
	 * Processes an incoming WinterCG Web standard Request from the Node adapter.
	 *
	 * 1. Resolves static Hot Module Replacement runtime blobs if development.
	 * 2. Checks if the incoming request matches any parsed API route schemas.
	 *   - Routes through `ApiRequestPipeline` which performs strict validation.
	 * 3. Falls through to standard `ServerRouteHandler` for React/Lit filesystem pages.
	 *
	 * The Node host maps its native HTTP request into a Web Request before calling this method.
	 */
	public async handleSharedRequest(request: Request, context: ServerRequestContext): Promise<Response> {
		return requireBuildQueue(this.appConfig).withRequestScope(() =>
			runWithBuildInputIndex(requireAppRuntime(this.appConfig).buildInputIndex, () =>
				startupTrace.traceFirstRequest(request, async () => {
					const devClientResponse = await this.tryHandleSharedDevClientRequest(request);
					if (devClientResponse) {
						return devClientResponse;
					}

					const hmrResponse = this.tryHandleSharedHmrRequest(request);
					if (hmrResponse) {
						return hmrResponse;
					}

					const apiResponse = await this.tryHandleSharedApiRequest(request, context);
					if (apiResponse) {
						return await this.injectSharedHmrHtmlResponse(apiResponse);
					}

					const routeResponse = await this.routeHandler.handleResponse(request);
					return await this.injectSharedHmrHtmlResponse(routeResponse);
				}),
			),
		);
	}
}
