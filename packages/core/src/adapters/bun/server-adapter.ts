import type { Server, WebSocketHandler } from 'bun';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import type { ApiHandler, ApiHandlerContext, ErrorHandler, StaticRoute } from '../../public-types.ts';
import { HttpError } from '../../errors/http-error.ts';
import { createRequire } from '../../utils/locals-utils.ts';

import { fileSystem } from '@ecopages/file-system';
import { SharedServerAdapter } from '../shared/server-adapter.ts';
import type { ServerAdapterResult } from '../abstract/server-adapter.ts';
import { ApiResponseBuilder } from '../shared/api-response.ts';
import { installSharedRuntimeBuildExecutor } from '../shared/runtime-bootstrap.ts';

import { ServerRouteHandler, type ServerRouteHandlerParams } from '../shared/server-route-handler.ts';
import { ServerStaticBuilder, type ServerStaticBuilderParams } from '../shared/server-static-builder';
import {
	injectHmrRuntimeIntoHtmlResponse,
	isHtmlResponse,
	shouldInjectHmrHtmlResponse,
} from '../shared/hmr-html-response';
import { ClientBridge } from './client-bridge';
import { HmrManager } from './hmr-manager';
import { ServerLifecycle } from './server-lifecycle.ts';

type BunServerInstance = Server<unknown>;
type BunNativeServeOptions = Bun.Serve.Options<unknown>;

export type BunServerRoutes = Bun.Serve.Routes<unknown, string>;

export type BunServeAdapterServerOptions = Partial<
	Omit<BunNativeServeOptions, 'fetch'> & {
		fetch(this: BunServerInstance, request: Request): Promise<void | Response>;
	}
>;

export type BunServeOptions = Omit<BunNativeServeOptions, 'fetch'> & {
	fetch?: (this: BunServerInstance, request: Request, server: BunServerInstance) => Promise<void | Response>;
	websocket?: WebSocketHandler<unknown>;
};

export interface BunServerAdapterParams {
	appConfig: EcoPagesAppConfig;
	runtimeOrigin: string;
	serveOptions: BunServeAdapterServerOptions;
	apiHandlers?: ApiHandler<string, Request, BunServerInstance>[];
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
	completeInitialization: (server?: BunServerInstance | null) => Promise<void>;
	handleRequest: (request: Request) => Promise<Response>;
}

export class BunServerAdapter extends SharedServerAdapter<BunServerAdapterParams, BunServerAdapterResult> {
	declare appConfig: EcoPagesAppConfig;
	declare options: BunServerAdapterParams['options'];
	declare serveOptions: BunServeAdapterServerOptions;
	protected apiHandlers: ApiHandler<string, Request, BunServerInstance>[];
	protected staticRoutes: StaticRoute[];

	protected errorHandler?: ErrorHandler;

	private bridge!: ClientBridge;
	private lifecycle!: ServerLifecycle;
	public hmrManager!: HmrManager;
	private initializationPromise: Promise<void> | null = null;
	private fullyInitialized = false;
	declare serverInstance: BunServerInstance | null;

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
	 * Determines if HMR script should be injected.
	 * Only injects in watch mode when HMR manager is enabled.
	 */
	private shouldInjectHmrScript(): boolean {
		return shouldInjectHmrHtmlResponse(this.options?.watch === true, this.hmrManager);
	}

	/**
	 * Checks if a response contains HTML content.
	 */
	private isHtmlResponse(response: Response): boolean {
		return isHtmlResponse(response);
	}

	/**
	 * Injects HMR script into HTML responses in development mode.
	 * Ensures explicit API handlers that return HTML get auto-reload capability.
	 */
	private async maybeInjectHmrScript(response: Response): Promise<Response> {
		if (this.shouldInjectHmrScript() && this.isHtmlResponse(response)) {
			return injectHmrRuntimeIntoHtmlResponse(response);
		}
		return response;
	}

	/**
	 * Initializes the server adapter's core components.
	 * Delegates to ServerLifecycle for setup.
	 */
	public async initialize(): Promise<void> {
		installSharedRuntimeBuildExecutor(this.appConfig, {
			development: this.options?.watch === true,
		});

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
			apiHandlers: this.apiHandlers,
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
		if (!this.serverInstance || typeof this.serverInstance.reload !== 'function') {
			appLogger.error('Server instance is not available for reloading');
			return;
		}

		await this.createSharedWatchRefreshCallback({
			staticRoutes: this.staticRoutes,
			hmrManager: this.hmrManager,
			onRoutesReady: () => {
				const options = this.getServerOptions({ enableHmr: true });
				this.serverInstance!.reload(options as BunNativeServeOptions);
				appLogger.debug('Server routes updated with dynamic routes');
			},
			onError: (error) => {
				this.hmrManager.broadcast({ type: 'error', message: error.message });
				appLogger.error('Failed to refresh router routes:', error);
			},
		})();
	}

	private async watch(): Promise<void> {
		await this.lifecycle.startWatching({
			refreshRouterRoutesCallback: this.refreshRouterRoutes.bind(this),
		});
	}

	/**
	 * Retrieves the current server options, optionally enabling HMR.
	 * If HMR is enabled, modifies fetch to handle WebSocket upgrades and serve HMR runtime.
	 * Ensures original fetch logic is preserved and called for non-HMR requests.
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
					return new Response(fileSystem.readFileAsBuffer(hmrManager.getRuntimePath()) as BodyInit, {
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
	 * Helper method to retrieve and parse the request body.
	 * Handles JSON and plain text content types.
	 * For FormData (multipart/form-data, x-www-form-urlencoded), use ctx.request.formData() directly.
	 * Returns undefined for unsupported content types.
	 */
	private async retrieveBodyFromRequest(request: Request): Promise<unknown> {
		const contentType = request.headers.get('Content-Type') || '';

		if (contentType.includes('application/json')) {
			return await request.json();
		}

		if (contentType.includes('text/plain')) {
			return await request.text();
		}

		return undefined;
	}

	/**
	 * Creates complete server configuration with request handling.
	 * @returns Server options ready for Bun.serve()
	 */
	private buildServerSettings(): BunServeOptions {
		const serverOptions = { ...this.serveOptions } as BunServeAdapterServerOptions;
		const handleNoMatch = this.handleNoMatch.bind(this);
		const waitForInit = this.waitForInitialization.bind(this);
		const handleReq = this.handleRequest.bind(this);
		const errorHandler = this.errorHandler;
		const getCacheService = () => this.getCacheService();
		const getRenderContext = () => this.getRenderContext();

		appLogger.debug(`[BunServerAdapter] Building server settings`);

		const finalOptions: BunServeOptions = {
			...serverOptions,
			async fetch(this: Server<unknown>, request: Request, _server: Server<unknown>) {
				try {
					await waitForInit();
					return await handleReq(request);
				} catch (error) {
					if (error instanceof Response) return error;
					if (errorHandler) {
						try {
							const locals: Record<string, unknown> = {};
							const context: ApiHandlerContext<Request, BunServerInstance> = {
								request,
								params: {},
								response: new ApiResponseBuilder(),
								server: _server as BunServerInstance,
								locals,
								require: createRequire((): Record<string, unknown> => locals),
								services: {
									cache: getCacheService(),
								},
								...getRenderContext(),
							};

							return await errorHandler(error, context);
						} catch (handlerError) {
							appLogger.error(`[ecopages] Error in custom error handler: ${handlerError}`);
						}
					}
					if (error instanceof HttpError) return error.toResponse();

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
			await this.initSharedRouter();
			this.configureSharedResponseHandlers(this.staticRoutes, this.hmrManager);
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
	public async completeInitialization(server?: BunServerInstance | null): Promise<void> {
		if (this.fullyInitialized) {
			if (server && !this.serverInstance) {
				this.serverInstance = server;
			}
			return;
		}

		if (!this.initializationPromise) {
			this.initializationPromise = this._performInitialization(server ?? null);
		}

		return this.initializationPromise;
	}

	/**
	 * Performs complete server setup including routing, watchers, and HMR.
	 */
	private async _performInitialization(server: BunServerInstance | null): Promise<void> {
		this.serverInstance = server;
		appLogger.debug('Completing server initialization with dynamic routes');

		await this.initializeSharedRouteHandling({
			staticRoutes: this.staticRoutes,
			hmrManager: this.hmrManager,
		});

		this.fullyInitialized = true;

		if (this.options?.watch) await this.watch();

		if (server && typeof server.reload === 'function') {
			const updatedOptions = this.getServerOptions(this.options?.watch ? { enableHmr: true } : undefined);
			server.reload(updatedOptions as BunNativeServeOptions);
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
			handleRequest: this.handleRequest.bind(this),
		};
	}

	/**
	 * Handles HTTP requests by passing them securely to the shared core router adapter.
	 */
	public async handleRequest(request: Request): Promise<Response> {
		const response = await this.handleSharedRequest(request, {
			apiHandlers: this.apiHandlers,
			errorHandler: this.errorHandler,
			serverInstance: this.serverInstance,
			hmrManager: this.hmrManager,
		});

		// Filesystem page responses are wrapped by ServerRouteHandler. This adapter-
		// level pass only covers HTML returned by explicit API handlers, which bypass
		// that route-layer wrapper and would otherwise miss the dev HMR runtime.
		return await this.maybeInjectHmrScript(response);
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
