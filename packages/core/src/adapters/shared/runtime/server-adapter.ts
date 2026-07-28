import path from 'node:path';
import { AbstractServerAdapter } from '../../abstract/server-adapter.ts';
import type { ServerAdapterOptions, ServerAdapterResult } from '../../abstract/server-adapter.ts';
import { RouteRendererFactory } from '../../../route-renderer/route-renderer.ts';
import { RouteRegistry } from '../../../router/server/route-registry.ts';
import { startupTrace } from '../../../diagnostics/startup-trace.ts';
import { requestBuildDedupe } from '../../../diagnostics/request-build-dedupe.ts';
import { MemoryCacheStore } from '../../../services/cache/memory-cache-store.ts';
import { AllowlistedMemoryCacheStore } from '../../../services/cache/allowlisted-memory-cache-store.ts';
import {
	PageCacheService,
	registerAppPageCacheService,
} from '../../../services/cache/page-cache-service.ts';
import { SchemaValidationService } from '../../../services/validation/schema-validation-service.ts';
import { StaticSiteGenerator } from '../../../static-site-generator/static-site-generator.ts';
import { ServerStaticBuilder } from './server-static-builder.ts';
import { ExplicitStaticRouteMatcher } from '../http/explicit-static-route-matcher.ts';
import { FileSystemServerResponseFactory } from '../http/fs-server-response-factory.ts';
import { FileSystemResponseMatcher } from '../http/fs-server-response-matcher.ts';
import { ServerRouteHandler } from './server-route-handler.ts';
import { startDevStaticRoutePrewarm, runDevStaticRoutePrewarm } from './dev-static-route-prewarm.ts';
import { collectAppDevPrewarmPlan } from './collect-dev-prewarm-plan.ts';
import { createRenderContext } from './render-context.ts';
import { ApiRequestPipeline } from '../http/api-request-pipeline.ts';
import {
	injectDevToolbarIntoHtmlResponse,
	shouldInjectDevToolbarHtmlResponse,
} from '../../../dev-toolbar/dev-toolbar-html-response.ts';
import {
	injectHmrRuntimeIntoHtmlResponse,
	isHtmlResponse,
	shouldInjectHmrHtmlResponse,
} from '../hmr/hmr-html-response.ts';
import type { EcoPageFile } from '../../../types/public-types.ts';
import { getAppServerModuleTranspiler } from '../../../services/module-loading/app-server-module-transpiler.service.ts';
import { resolveInternalExecutionDir } from '../../../utils/resolve-work-dir.ts';
import type { RouteRegistryPageModuleAdapter } from '../../../router/server/route-registry.ts';
import type {
	ApiHandler,
	CacheInvalidator,
	ErrorHandler,
	IHmrManager,
	RenderContext,
	StaticRoute,
} from '../../../types/public-types.ts';

type SharedResponseHandlerDependencies = {
	cacheService: PageCacheService | null;
	fileSystemResponseMatcher: FileSystemResponseMatcher;
	explicitStaticRouteMatcher?: ExplicitStaticRouteMatcher;
};

type SharedHmrAssetManager = IHmrManager;

type SharedRequestContext<TServer = unknown> = {
	apiHandlers: ApiHandler[];
	errorHandler?: ErrorHandler<Request, TServer>;
	serverInstance?: TServer;
	hmrManager?: SharedHmrAssetManager;
};

export abstract class SharedServerAdapter<
	TOptions extends ServerAdapterOptions,
	TResult extends ServerAdapterResult,
> extends AbstractServerAdapter<TOptions, TResult> {
	protected router!: RouteRegistry;
	protected fileSystemResponseMatcher!: FileSystemResponseMatcher;
	protected routeRendererFactory!: RouteRendererFactory;
	protected routeHandler!: ServerRouteHandler;
	protected staticSiteGenerator!: StaticSiteGenerator;
	protected staticBuilder!: ServerStaticBuilder;
	protected schemaValidator = new SchemaValidationService();
	protected readonly apiRequestPipeline = new ApiRequestPipeline<Request, unknown>({
		schemaValidator: this.schemaValidator,
		getRenderContext: () => this.getRenderContext(),
		getCacheService: () => this.getCacheService(),
	});
	protected hostOwnsDevClient = false;
	private devStaticRoutePrewarmStarted = false;
	private sharedPageCacheService: PageCacheService | null | undefined;
	private watchAllowlistStore: AllowlistedMemoryCacheStore | null = null;

	/**
	 * Warms declared static paths after the final watch-mode response pipeline exists.
	 */
	protected async startDevStaticRoutePrewarmWhenReady(): Promise<void> {
		if (!this.options?.watch || this.devStaticRoutePrewarmStarted) {
			return;
		}

		this.devStaticRoutePrewarmStarted = true;

		const runtimeOrigin = this.runtimeOrigin;
		const plan = await collectAppDevPrewarmPlan(this.appConfig);
		const options = {
			pathnames: plan.pathnames,
			readiness: plan.readiness,
			renderPath: async (pathname: string) => {
				const response = await this.routeHandler.handleResponse(
					new Request(new URL(pathname, runtimeOrigin).toString(), { method: 'GET' }),
				);
				await response.arrayBuffer();
			},
			onPathnamesResolved: (pathnames: readonly string[]) => {
				this.watchAllowlistStore?.registerAllowedKeys(pathnames);
			},
		};

		if (plan.readiness === 'beforeReady') {
			await runDevStaticRoutePrewarm(options);
			return;
		}

		startDevStaticRoutePrewarm(options);
	}

	protected async initializeSharedRouteHandling(options: {
		staticRoutes: StaticRoute[];
		hmrManager?: SharedHmrAssetManager;
	}): Promise<void> {
		this.ensureRouteRendererFactory();
		await this.initSharedRouter();
		this.configureSharedResponseHandlers(options.staticRoutes, options.hmrManager);
	}

	private ensureRouteRendererFactory(): void {
		if (this.routeRendererFactory) {
			return;
		}

		this.routeRendererFactory = new RouteRendererFactory({
			appConfig: this.appConfig,
			rendererModules: this.appConfig.runtime?.rendererModuleContext,
			runtimeOrigin: this.runtimeOrigin,
		});
	}

	protected createSharedWatchRefreshCallback(options: {
		staticRoutes: StaticRoute[];
		hmrManager?: SharedHmrAssetManager;
		onRoutesReady?: () => Promise<void> | void;
		onError?: (error: Error) => Promise<void> | void;
	}): () => Promise<void> {
		return async () => {
			try {
				await this.initializeSharedRouteHandling({
					staticRoutes: options.staticRoutes,
					hmrManager: options.hmrManager,
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
			origin: this.runtimeOrigin,
			templatesExt: this.appConfig.templatesExt,
			buildMode: !this.options?.watch,
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
	 *
	 * @param staticRoutes - A map of explicitly served static assets.
	 * @param hmrManager - The runtime-specific Hot Module Replacement orchestrator (if watching).
	 */
	protected configureSharedResponseHandlers(staticRoutes: StaticRoute[], hmrManager?: IHmrManager): void {
		this.ensureRouteRendererFactory();

		const { fileSystemResponseMatcher, explicitStaticRouteMatcher } =
			this.createSharedResponseHandlerDependencies(staticRoutes);

		this.fileSystemResponseMatcher = fileSystemResponseMatcher;
		this.routeHandler = new ServerRouteHandler({
			router: this.router,
			fileSystemResponseMatcher: this.fileSystemResponseMatcher,
			explicitStaticRouteMatcher,
			hmrManager,
		});
	}

	private createSharedResponseHandlerDependencies(staticRoutes: StaticRoute[]): SharedResponseHandlerDependencies {
		const fileSystemResponseFactory = new FileSystemServerResponseFactory({
			options: {
				watchMode: !!this.options?.watch,
			},
		});

		const cacheService = this.getOrCreateSharedPageCacheService();
		const fileSystemResponseMatcher = new FileSystemResponseMatcher({
			appConfig: this.appConfig,
			assetPrefix: path.join(this.appConfig.rootDir, this.appConfig.distDir),
			router: this.router,
			routeRendererFactory: this.routeRendererFactory,
			fileSystemResponseFactory,
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

	private getOrCreateSharedPageCacheService(): PageCacheService | null {
		if (this.sharedPageCacheService !== undefined) {
			return this.sharedPageCacheService;
		}

		const cacheConfig = this.appConfig.cache;
		const watch = Boolean(this.options?.watch);

		if (watch) {
			const useFullWatchCache = cacheConfig?.enabled === true;
			const store = useFullWatchCache
				? cacheConfig?.store === 'memory' || !cacheConfig?.store
					? new MemoryCacheStore({ maxEntries: cacheConfig?.maxEntries })
					: cacheConfig.store
				: new AllowlistedMemoryCacheStore({ maxEntries: cacheConfig?.maxEntries });

			if (!useFullWatchCache && store instanceof AllowlistedMemoryCacheStore) {
				this.watchAllowlistStore = store;
			}

			const service = new PageCacheService({ store, enabled: true });
			this.sharedPageCacheService = service;
			registerAppPageCacheService(this.appConfig, service);
			return service;
		}

		const isCacheEnabled = cacheConfig?.enabled ?? true;
		if (!isCacheEnabled) {
			this.sharedPageCacheService = null;
			registerAppPageCacheService(this.appConfig, null);
			return null;
		}

		const store =
			cacheConfig?.store === 'memory' || !cacheConfig?.store
				? new MemoryCacheStore({ maxEntries: cacheConfig?.maxEntries })
				: cacheConfig.store;
		const service = new PageCacheService({ store, enabled: true });
		this.sharedPageCacheService = service;
		registerAppPageCacheService(this.appConfig, service);
		return service;
	}

	protected getCacheService(): CacheInvalidator | null {
		return this.fileSystemResponseMatcher?.getCacheService() ?? null;
	}

	protected getRenderContext(): RenderContext {
		const serverModuleTranspiler = getAppServerModuleTranspiler(this.appConfig);

		return createRenderContext({
			integrations: this.appConfig.integrations,
			rendererModules: this.appConfig.runtime?.rendererModuleContext,
			importServerModule: async <T = unknown>(filePath: string) =>
				await serverModuleTranspiler.importModule<T>({
					filePath,
					outdir: path.join(resolveInternalExecutionDir(this.appConfig), '.server-modules'),
					externalPackages: true,
				}),
		});
	}

	private async tryHandleSharedDevClientRequest(
		request: Request,
		context: SharedRequestContext,
	): Promise<Response | null> {
		const manager = context.hmrManager as {
			tryHandleDevClientRequest?: (request: Request) => Promise<Response | null>;
		} | null;
		return (await manager?.tryHandleDevClientRequest?.(request)) ?? null;
	}

	private tryHandleSharedHmrRequest(request: Request, context: SharedRequestContext): Response | null {
		return context.hmrManager?.tryHandleAssetRequest(request) ?? null;
	}

	private async injectSharedHmrHtmlResponse(response: Response, context: SharedRequestContext): Promise<Response> {
		if (!isHtmlResponse(response)) {
			return response;
		}

		let nextResponse = response;

		if (
			shouldInjectHmrHtmlResponse(this.options?.watch ?? false, context.hmrManager, this.hostOwnsDevClient) &&
			isHtmlResponse(nextResponse)
		) {
			nextResponse = await injectHmrRuntimeIntoHtmlResponse(nextResponse);
		}

		if (
			shouldInjectDevToolbarHtmlResponse(this.appConfig, {
				watch: this.options?.watch ?? false,
				hostOwnsDevClient: this.hostOwnsDevClient,
			})
		) {
			nextResponse = await injectDevToolbarIntoHtmlResponse(
				this.appConfig,
				{
					watch: this.options?.watch ?? false,
					hostOwnsDevClient: this.hostOwnsDevClient,
				},
				nextResponse,
			);
		}

		return nextResponse;
	}

	private async tryHandleSharedApiRequest(request: Request, context: SharedRequestContext): Promise<Response | null> {
		return await this.apiRequestPipeline.tryHandle(
			request,
			context.apiHandlers,
			context.serverInstance,
			context.errorHandler,
		);
	}

	/**
	 * Universally processes an incoming WinterCG Web standard Request.
	 *
	 * 1. Resolves static Hot Module Replacement runtime blobs if development.
	 * 2. Checks if the incoming request matches any parsed API route schemas.
	 *   - Routes through `ApiRequestPipeline` which performs strict validation.
	 * 3. Falls through to standard `ServerRouteHandler` for React/Lit filesystem pages.
	 *
	 * Both Bun and Node bindings fall back to this exact function once they have mapped their
	 * native HTTP objects into Web Standard Requests.
	 */
	public async handleSharedRequest(request: Request, context: SharedRequestContext): Promise<Response> {
		return requestBuildDedupe.run(() =>
			startupTrace.traceFirstRequest(request, async () => {
				const devClientResponse = await this.tryHandleSharedDevClientRequest(request, context);
				if (devClientResponse) {
					return devClientResponse;
				}

				const hmrResponse = this.tryHandleSharedHmrRequest(request, context);
				if (hmrResponse) {
					return hmrResponse;
				}

				const apiResponse = await this.tryHandleSharedApiRequest(request, context);
				if (apiResponse) {
					return await this.injectSharedHmrHtmlResponse(apiResponse, context);
				}

				const routeResponse = await this.routeHandler.handleResponse(request);
				return await this.injectSharedHmrHtmlResponse(routeResponse, context);
			}),
		);
	}
}
