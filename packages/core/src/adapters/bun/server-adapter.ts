import path from 'node:path';
import type { BunRequest, Server, WebSocketHandler } from 'bun';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import type {
	ApiHandler,
	ApiHandlerContext,
	CacheInvalidator,
	ErrorHandler,
	RenderContext,
	StaticRoute,
} from '../../public-types.ts';
import { HttpError } from '../../errors/http-error.ts';
import { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import { FSRouter } from '../../router/fs-router.ts';
import { FSRouterScanner } from '../../router/fs-router-scanner.ts';
import { MemoryCacheStore } from '../../services/cache/memory-cache-store.ts';
import { PageCacheService } from '../../services/cache/page-cache-service.ts';
import { SchemaValidationService } from '../../services/schema-validation-service.ts';
import { StaticSiteGenerator } from '../../static-site-generator/static-site-generator.ts';
import { deepMerge } from '../../utils/deep-merge.ts';
import { AbstractServerAdapter, type ServerAdapterResult } from '../abstract/server-adapter.ts';
import { ApiResponseBuilder } from '../shared/api-response.js';
import { ExplicitStaticRouteMatcher } from '../shared/explicit-static-route-matcher.ts';
import { FileSystemServerResponseFactory } from '../shared/fs-server-response-factory.ts';
import { FileSystemResponseMatcher } from '../shared/fs-server-response-matcher.ts';
import { createRenderContext } from '../shared/render-context.ts';
import { ServerRouteHandler, type ServerRouteHandlerParams } from '../shared/server-route-handler';
import { ServerStaticBuilder, type ServerStaticBuilderParams } from '../shared/server-static-builder';
import { ClientBridge } from './client-bridge';
import { HmrManager } from './hmr-manager';
import { BunRouterAdapter } from './router-adapter.ts';
import { ServerLifecycle } from './server-lifecycle';

export type BunServerRoutes = Bun.Serve.Routes<unknown, string>;

export type BunServeAdapterServerOptions = Partial<
	Omit<Bun.Serve.Options<unknown>, 'fetch'> & {
		routes: BunServerRoutes;
		fetch(this: Server<unknown>, request: Request): Promise<void | Response>;
	}
>;

export type BunServeOptions = Omit<Bun.Serve.Options<unknown>, 'fetch'> & {
	routes: BunServerRoutes;
	fetch?: (this: Server<unknown>, request: Request, server: Server<unknown>) => Promise<void | Response>;
	websocket?: WebSocketHandler<unknown>;
};

export interface BunServerAdapterParams {
	appConfig: EcoPagesAppConfig;
	runtimeOrigin: string;
	serveOptions: BunServeAdapterServerOptions;
	apiHandlers?: ApiHandler<any, BunRequest, Server<unknown>>[];
	staticRoutes?: StaticRoute[];
	errorHandler?: ErrorHandler;
	options?: {
		watch?: boolean;
	};
	lifecycle?: ServerLifecycle;
	staticBuilderFactory?: (params: ServerStaticBuilderParams) => ServerStaticBuilder;
	routeHandlerFactory?: (params: ServerRouteHandlerParams) => ServerRouteHandler;
	hmrManager?: HmrManager;
	bridge?: ClientBridge;
}

export interface BunServerAdapterResult extends ServerAdapterResult {
	getServerOptions: (options?: { enableHmr?: boolean }) => BunServeOptions;
	buildStatic: (options?: { preview?: boolean }) => Promise<void>;
	completeInitialization: (server: Server<unknown>) => Promise<void>;
}

export class BunServerAdapter extends AbstractServerAdapter<BunServerAdapterParams, BunServerAdapterResult> {
	declare appConfig: EcoPagesAppConfig;
	declare options: BunServerAdapterParams['options'];
	declare serveOptions: BunServerAdapterParams['serveOptions'];
	protected apiHandlers: ApiHandler<any, BunRequest>[];
	protected staticRoutes: StaticRoute[];
	protected errorHandler?: ErrorHandler;

	private router!: FSRouter;
	private fileSystemResponseMatcher!: FileSystemResponseMatcher;
	private routeRendererFactory!: RouteRendererFactory;
	private routes: BunServerRoutes = {};
	private staticSiteGenerator!: StaticSiteGenerator;
	private bridge!: ClientBridge;
	private lifecycle!: ServerLifecycle;
	private staticBuilder!: ServerStaticBuilder;
	private routeHandler!: ServerRouteHandler;
	public hmrManager!: HmrManager;
	private initializationPromise: Promise<void> | null = null;
	private fullyInitialized = false;
	declare serverInstance: Server<unknown> | null;
	private readonly schemaValidator = new SchemaValidationService();

	private readonly lifecycleFactory?: ServerLifecycle;
	private readonly staticBuilderFactory?: (params: ServerStaticBuilderParams) => ServerStaticBuilder;
	private readonly routeHandlerFactory?: (params: ServerRouteHandlerParams) => ServerRouteHandler;
	private readonly hmrManagerFactory?: HmrManager;
	private readonly bridgeFactory?: ClientBridge;

	constructor({
		appConfig,
		runtimeOrigin,
		serveOptions,
		apiHandlers,
		staticRoutes,
		errorHandler,
		options,
		lifecycle,
		staticBuilderFactory,
		routeHandlerFactory,
		hmrManager,
		bridge,
	}: BunServerAdapterParams) {
		super({ appConfig, runtimeOrigin, serveOptions, options });
		this.apiHandlers = apiHandlers || [];
		this.staticRoutes = staticRoutes || [];
		this.errorHandler = errorHandler;
		this.lifecycleFactory = lifecycle;
		this.staticBuilderFactory = staticBuilderFactory;
		this.routeHandlerFactory = routeHandlerFactory;
		this.hmrManagerFactory = hmrManager;
		this.bridgeFactory = bridge;
	}

	/**
	 * Initializes the server adapter's core components.
	 * Delegates to ServerLifecycle for setup.
	 */
	public async initialize(): Promise<void> {
		this.bridge = this.bridgeFactory ?? new ClientBridge();
		this.hmrManager = this.hmrManagerFactory ?? new HmrManager({ appConfig: this.appConfig, bridge: this.bridge });
		this.lifecycle =
			this.lifecycleFactory ??
			new ServerLifecycle({
				appConfig: this.appConfig,
				runtimeOrigin: this.runtimeOrigin,
				hmrManager: this.hmrManager,
				bridge: this.bridge,
			});

		this.staticSiteGenerator = await this.lifecycle.initialize();

		const staticBuilderOptions = {
			appConfig: this.appConfig,
			staticSiteGenerator: this.staticSiteGenerator,
			serveOptions: this.serveOptions,
		};

		this.staticBuilder = this.staticBuilderFactory
			? this.staticBuilderFactory(staticBuilderOptions)
			: new ServerStaticBuilder(staticBuilderOptions);

		await this.lifecycle.initializePlugins({ watch: this.options?.watch });
	}

	/**
	 * Refreshes the router routes during watch mode.
	 */
	private async refreshRouterRoutes(): Promise<void> {
		if (this.serverInstance && typeof this.serverInstance.reload === 'function') {
			try {
				await this.router.init();
				this.configureResponseHandlers();
				const options = this.getServerOptions({ enableHmr: true });
				this.serverInstance.reload(options as Bun.Serve.Options<unknown>);
				appLogger.debug('Server routes updated with dynamic routes');
			} catch (error) {
				if (error instanceof Error) {
					this.hmrManager.broadcast({ type: 'error', message: error.message });
					appLogger.error('Failed to refresh router routes:', error);
				}
			}
		} else {
			appLogger.error('Server instance is not available for reloading');
		}
	}

	private async watch(): Promise<void> {
		await this.lifecycle.startWatching({
			refreshRouterRoutesCallback: this.refreshRouterRoutes.bind(this),
		});
	}

	/**
	 * Initializes the file system router.
	 */
	private async initRouter(): Promise<void> {
		const scanner = new FSRouterScanner({
			dir: path.join(this.appConfig.rootDir, this.appConfig.srcDir, this.appConfig.pagesDir),
			appConfig: this.appConfig,
			origin: this.runtimeOrigin,
			templatesExt: this.appConfig.templatesExt,
			options: {
				buildMode: !this.options?.watch,
			},
		});

		this.router = new FSRouter({
			origin: this.runtimeOrigin,
			assetPrefix: path.join(this.appConfig.rootDir, this.appConfig.distDir),
			scanner,
		});

		await this.router.init();
	}

	private configureResponseHandlers(): void {
		this.routeRendererFactory = new RouteRendererFactory({
			appConfig: this.appConfig,
			runtimeOrigin: this.runtimeOrigin,
		});

		const fileSystemResponseFactory = new FileSystemServerResponseFactory({
			appConfig: this.appConfig,
			routeRendererFactory: this.routeRendererFactory,
			options: {
				watchMode: !!this.options?.watch,
			},
		});

		const cacheConfig = this.appConfig.cache;
		const isCacheEnabled = cacheConfig?.enabled ?? !this.options?.watch;
		let cacheService: PageCacheService | null = null;

		if (isCacheEnabled) {
			const store =
				cacheConfig?.store === 'memory' || !cacheConfig?.store
					? new MemoryCacheStore({ maxEntries: cacheConfig?.maxEntries })
					: cacheConfig.store;
			cacheService = new PageCacheService({ store, enabled: true });
		}

		this.fileSystemResponseMatcher = new FileSystemResponseMatcher({
			router: this.router,
			routeRendererFactory: this.routeRendererFactory,
			fileSystemResponseFactory,
			cacheService,
			defaultCacheStrategy: cacheConfig?.defaultStrategy ?? 'static',
		});

		const explicitStaticRouteMatcher =
			this.staticRoutes.length > 0
				? new ExplicitStaticRouteMatcher({
						appConfig: this.appConfig,
						routeRendererFactory: this.routeRendererFactory,
						staticRoutes: this.staticRoutes,
					})
				: undefined;

		const routeHandlerParams: ServerRouteHandlerParams = {
			router: this.router,
			fileSystemResponseMatcher: this.fileSystemResponseMatcher,
			explicitStaticRouteMatcher,
			watch: !!this.options?.watch,
			hmrManager: this.hmrManager,
		};

		this.routeHandler = this.routeHandlerFactory
			? this.routeHandlerFactory(routeHandlerParams)
			: new ServerRouteHandler(routeHandlerParams);
	}

	private adaptRouterRoutes(): void {
		const routerAdapter = new BunRouterAdapter({ serverAdapter: this });
		this.routes = routerAdapter.adaptRoutes(this.router.routes);
	}

	/**
	 * Retrieves the current server options, optionally enabling HMR.
	 * @param options.enableHmr Whether to enable Hot Module Replacement
	 */
	public getServerOptions({ enableHmr = false } = {}): BunServeOptions {
		appLogger.debug(`[BunServerAdapter] getServerOptions called with enableHmr: ${enableHmr}`);
		const serverOptions = this.buildServerSettings();

		if (enableHmr) {
			const originalFetch = serverOptions.fetch;
			const hmrHandler = this.hmrManager.getWebSocketHandler();
			const hmrManager = this.hmrManager;

			(serverOptions as any).development = true;

			serverOptions.websocket = hmrHandler;
			serverOptions.fetch = async function (
				this: Server<unknown>,
				request: Request,
				_server: Server<unknown>,
			): Promise<Response | void> {
				const url = new URL(request.url);
				appLogger.debug(`[HMR] Request: ${url.pathname}`);

				/** Handle HMR WebSocket upgrade */
				if (url.pathname === '/_hmr') {
					const success = this.upgrade(request, {
						data: undefined,
					});
					if (success) return;
					return new Response('WebSocket upgrade failed', { status: 400 });
				}

				/** Serve HMR runtime script */
				if (url.pathname === '/_hmr_runtime.js') {
					appLogger.debug(`[HMR] Serving runtime from ${hmrManager.getRuntimePath()}`);
					return new Response(Bun.file(hmrManager.getRuntimePath()), {
						headers: { 'Content-Type': 'application/javascript' },
					});
				}

				/** Proceed with normal request handling */
				let response: Response;
				if (originalFetch) {
					const res = await originalFetch.call(this, request, this);
					response = res instanceof Response ? res : new Response('Not Found', { status: 404 });
				} else {
					response = new Response('Not Found', { status: 404 });
				}

				return response;
			};
		}

		return serverOptions as BunServeOptions;
	}

	/**
	 * Creates complete server configuration with merged routes, API handlers, and request handling.
	 * @returns Server options ready for Bun.serve()
	 */
	private buildServerSettings(): BunServeOptions {
		const { routes, ...serverOptions } = this.serveOptions as BunServeAdapterServerOptions;
		const handleNoMatch = this.handleNoMatch.bind(this);
		const waitForInit = this.waitForInitialization.bind(this);
		const handleReq = this.handleRequest.bind(this);
		const errorHandler = this.errorHandler;
		const getCacheService = (): CacheInvalidator | null =>
			this.fileSystemResponseMatcher?.getCacheService() ?? null;
		const getRenderContext = (): RenderContext =>
			createRenderContext({ integrations: this.appConfig.integrations });

		const mergedRoutes = deepMerge(routes || {}, this.routes);
		appLogger.debug(`[BunServerAdapter] Building server settings with ${this.apiHandlers.length} API handlers`);

		for (const routeConfig of this.apiHandlers) {
			const method = routeConfig.method || 'GET';
			const path = routeConfig.path;
			const middleware = routeConfig.middleware || [];
			const schema = routeConfig.schema;

			appLogger.debug(`[BunServerAdapter] Registering API route: ${method} ${path}`);

			const wrappedHandler = async (request: BunRequest<string>): Promise<Response> => {
				let context: ApiHandlerContext<BunRequest<string>, Server<unknown> | null> | undefined;

				try {
					await waitForInit();
					const renderContext = getRenderContext();
					context = {
						request,
						response: new ApiResponseBuilder(),
						server: this.serverInstance,
						services: {
							cache: getCacheService(),
						},
						...renderContext,
					};

					if (schema) {
						const url = new URL(request.url);
						const queryParams = Object.fromEntries(url.searchParams);
						const headers = Object.fromEntries(request.headers);

						let body: unknown;
						if (schema.body) {
							try {
								body = await request.json();
							} catch (error) {
								return context.response.status(400).json({
									error: 'Invalid JSON body',
								});
							}
						}

						const validationResult = await this.schemaValidator.validateRequest(
							{ body, query: queryParams, headers },
							schema,
						);

						if (!validationResult.success) {
							return context.response.status(400).json({
								error: 'Validation failed',
								issues: validationResult.errors,
							});
						}

						context.validated = validationResult.data;
					}

					if (middleware.length === 0) {
						return await routeConfig.handler(context);
					}

					let index = 0;
					const executeNext = async (): Promise<Response> => {
						if (index < middleware.length) {
							const currentMiddleware = middleware[index++];
							return await currentMiddleware(context!, executeNext);
						}
						return await routeConfig.handler(context!);
					};

					return await executeNext();
				} catch (error) {
					if (this.errorHandler) {
						try {
							if (!context) {
								const renderContext = getRenderContext();
								context = {
									request,
									response: new ApiResponseBuilder(),
									server: this.serverInstance,
									services: { cache: getCacheService() },
									...renderContext,
								};
							}
							return await this.errorHandler(error, context);
						} catch (handlerError) {
							appLogger.error(`[ecopages] Error in custom error handler: ${handlerError}`);
						}
					}

					if (error instanceof HttpError) {
						return error.toResponse();
					}
					appLogger.error(`[ecopages] Error handling API request: ${error}`);
					return new Response('Internal Server Error', { status: 500 });
				}
			};

			mergedRoutes[path] = {
				...mergedRoutes[path],
				[method.toUpperCase()]: wrappedHandler,
			};
		}

		appLogger.debug('[BunServerAdapter] Final bunRoutes:', Object.keys(mergedRoutes));

		const finalOptions: BunServeOptions = {
			...serverOptions,
			routes: mergedRoutes,
			async fetch(this: Server<unknown>, request: Request, _server: Server<unknown>) {
				try {
					await waitForInit();
					return await handleReq(request);
				} catch (error) {
					if (errorHandler) {
						try {
							const renderContext = getRenderContext();
							const context = {
								request,
								response: new ApiResponseBuilder(),
								server: this,
								services: { cache: getCacheService() },
								...renderContext,
							};
							return await errorHandler(error, context);
						} catch (handlerError) {
							appLogger.error(`[ecopages] Error in custom error handler: ${handlerError}`);
						}
					}

					if (error instanceof HttpError) {
						return error.toResponse();
					}

					appLogger.error(`[ecopages] Error handling request: ${error}`);
					return new Response('Internal Server Error', { status: 500 });
				}
			},
			error(this: Server<unknown>, error: Error) {
				appLogger.error(`[ecopages] Error handling request: ${error}`);
				return handleNoMatch(new Request('http://localhost'));
			},
		};

		return finalOptions as unknown as BunServeOptions;
	}

	/**
	 * Generates a static build of the site for deployment.
	 * @param options.preview - If true, starts a preview server after build
	 */
	public async buildStatic(options?: { preview?: boolean }): Promise<void> {
		if (!this.fullyInitialized) {
			await this.initRouter();
			this.configureResponseHandlers();
			this.adaptRouterRoutes();
		}

		await this.staticBuilder.build(options, {
			router: this.router,
			routeRendererFactory: this.routeRendererFactory,
			staticRoutes: this.staticRoutes,
		});
	}

	/**
	 * Initializes the server with dynamic routes after server creation.
	 * Must be called before handling any requests.
	 * @param server - The Bun server instance
	 */
	public async completeInitialization(server: Server<unknown>): Promise<void> {
		if (this.fullyInitialized) return;

		if (!this.initializationPromise) {
			this.initializationPromise = this._performInitialization(server);
		}

		return this.initializationPromise;
	}

	/**
	 * Performs complete server setup including routing, watchers, and HMR.
	 */
	private async _performInitialization(server: Server<unknown>): Promise<void> {
		this.serverInstance = server;
		appLogger.debug('Completing server initialization with dynamic routes');

		await this.initRouter();
		this.configureResponseHandlers();
		this.adaptRouterRoutes();

		this.fullyInitialized = true;

		if (this.options?.watch) await this.watch();

		if (server && typeof server.reload === 'function') {
			const updatedOptions = this.getServerOptions(this.options?.watch ? { enableHmr: true } : undefined);
			server.reload(updatedOptions as Bun.Serve.Options<unknown>);
			appLogger.debug('Server routes updated with dynamic routes');
		}
	}

	/**
	 * Creates and initializes the Bun server adapter.
	 * @returns Configured adapter with server methods
	 */
	public async createAdapter(): Promise<BunServerAdapterResult> {
		await this.initialize();

		return {
			getServerOptions: this.getServerOptions.bind(this),
			buildStatic: this.buildStatic.bind(this),
			completeInitialization: this.completeInitialization.bind(this),
		};
	}

	/**
	 * Handles HTTP requests from the router adapter.
	 */
	public async handleRequest(request: Request): Promise<Response> {
		return this.routeHandler.handleResponse(request);
	}

	/**
	 * Ensures server initialization completes before request handling.
	 * Prevents race conditions during startup.
	 */
	private async waitForInitialization(): Promise<void> {
		if (this.fullyInitialized) {
			return;
		}

		if (this.initializationPromise) {
			return this.initializationPromise;
		}

		throw new Error('Server not initialized. Call completeInitialization() first.');
	}

	/**
	 * Handles HTTP requests from the router adapter.
	 */
	public async handleResponse(request: Request): Promise<Response> {
		await this.waitForInitialization();
		return this.routeHandler.handleResponse(request);
	}

	/**
	 * Handles requests that do not match any routes.
	 */
	private async handleNoMatch(request: Request): Promise<Response> {
		await this.waitForInitialization();
		return this.routeHandler.handleNoMatch(request);
	}
}

/**
 * Factory function to create a Bun server adapter
 */
export async function createBunServerAdapter(params: BunServerAdapterParams): Promise<BunServerAdapterResult> {
	const runtimeOrigin =
		params.runtimeOrigin ??
		`http://${params.serveOptions.hostname || 'localhost'}:${params.serveOptions.port || 3000}`;

	const bridge = params.bridge ?? new ClientBridge();
	const hmrManager = params.hmrManager ?? new HmrManager({ appConfig: params.appConfig, bridge });
	const lifecycle =
		params.lifecycle ??
		new ServerLifecycle({
			appConfig: params.appConfig,
			runtimeOrigin,
			hmrManager,
			bridge,
		});

	const adapter = new BunServerAdapter({
		...params,
		runtimeOrigin,
		bridge,
		hmrManager,
		lifecycle,
		staticBuilderFactory: params.staticBuilderFactory ?? ((opts) => new ServerStaticBuilder(opts)),
		routeHandlerFactory: params.routeHandlerFactory ?? ((p) => new ServerRouteHandler(p)),
	});

	return adapter.createAdapter();
}
