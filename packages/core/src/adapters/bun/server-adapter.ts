import type { Server as NodeHttpServer } from 'node:http';
import path from 'node:path';
import type { Server, ServerWebSocket, WebSocketHandler } from 'bun';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../../config/constants.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type {
	ApiHandler,
	ApiHandlerContext,
	ErrorHandler,
	StaticRoute,
	EcopagesSocket,
	EcopagesWebSocketHandler,
} from '../../types/public-types.ts';
import { HttpError } from '../../errors/http-error.ts';
import { createRequire } from '../../utils/locals-utils.ts';
import { findWebSocketRoute } from '../abstract/ws-pattern-matcher.ts';

import { fileSystem } from '@ecopages/file-system';
import { setupAppRuntimePlugins } from '../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';
import { installBuildRuntime } from '../../build/runtime/build-runtime.ts';
import { StaticSiteGenerator } from '../../static-site-generator/static-site-generator.ts';
import { ProjectWatcher } from '../../watchers/project-watcher.ts';
import { SharedServerAdapter } from '../shared/runtime/server-adapter.ts';
import type { ServerAdapterResult } from '../abstract/server-adapter.ts';
import { ApiResponseBuilder } from '../shared/http/api-response.ts';
import type { StaticPreviewHost } from '../shared/runtime/static-preview-host.ts';

import { ServerStaticBuilder } from '../shared/runtime/server-static-builder.ts';
import { attachNodeHttpWebSocketUpgrades } from '../shared/ws/node-http-websocket-upgrades.ts';
import { createBunUserWebSocketLifecycle, type BunUserWebSocketData } from './bun-user-websocket-lifecycle.ts';
import { createEcopagesSocket } from '../shared/ws/websocket-lifecycle.ts';
import { resolveServeRuntimeOrigin } from '../shared/runtime/runtime-app-bootstrap.ts';
import {
	attachHmrToIntegrations,
	awaitConfiguredClientGraphPrewarm,
	disposeDevResources,
	prepareRuntimePublicDir,
	startConfiguredClientGraphPrewarm,
	startConfiguredIntegrationRuntimePrewarm,
} from '../shared/runtime/runtime-server-lifecycle.ts';
import { ClientBridge } from './client-bridge.ts';
import { setAppDevClientBridge } from '../../dev/client-bridge-registry.ts';
import { setAppHmrManager } from '../../dev/hmr-manager-registry.ts';
import { HmrManager } from './hmr-manager.ts';
import { BunStaticPreviewHost } from './static-preview-host.ts';

type BunServerInstance = Server<unknown>;
type BunNativeServeOptions = Bun.Serve.Options<unknown>;
type WsKindData = BunUserWebSocketData;

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

/**
 * Construction parameters for the Bun server adapter.
 *
 * @remarks
 * Callers normally provide only the app-facing fields such as routes, handlers,
 * and `serveOptions`. The transport collaborators remain optional here because
 * `createBunServerAdapter()` fills in Bun-specific defaults before the concrete
 * adapter instance is created.
 */
export interface BunServerAdapterParams {
	appConfig: EcoPagesAppConfig;
	runtimeOrigin: string;
	serveOptions: BunServeAdapterServerOptions;
	apiHandlers?: ApiHandler<string, Request, BunServerInstance>[];
	staticRoutes?: StaticRoute[];
	errorHandler?: ErrorHandler;
	websocketHandlers?: Map<string, EcopagesWebSocketHandler<any, any>>;
	options?: {
		watch?: boolean;
	};
	delegateBrowserReloadToHost?: boolean;
	hostOwnsDevClient?: boolean;
	deferRuntimeAssetSetup?: boolean;
	allowPortFallback?: boolean;
	hmrManager?: HmrManager;
	bridge?: ClientBridge;
	previewHost?: StaticPreviewHost;
}

export interface BunServerAdapterResult extends ServerAdapterResult {
	getServerOptions: (options?: { enableHmr?: boolean }) => BunServeOptions;
	buildStatic: (options?: { preview?: boolean; force?: boolean }) => Promise<string | undefined>;
	servePreviewOnly: () => Promise<string | undefined>;
	completeInitialization: (server?: BunServerInstance | null) => Promise<void>;
	handleRequest: (request: Request) => Promise<Response>;
	attachUserWebSocketUpgrades: (server: NodeHttpServer, options?: { passthroughUnmatched?: boolean }) => void;
	dispose: () => Promise<void>;
}

/**
 * Bun transport adapter that wires shared Ecopages request handling onto a live
 * `Bun.serve()` runtime.
 *
 * @remarks
 * The adapter owns Bun-specific concerns that do not exist in the shared server
 * abstraction: websocket-backed HMR transport, runtime plugin registration, and
 * preview-host startup for static builds. Routing, rendering, and response
 * composition still delegate to the shared server adapter base.
 */
export class BunServerAdapter extends SharedServerAdapter<BunServerAdapterParams, BunServerAdapterResult> {
	declare appConfig: EcoPagesAppConfig;
	declare options: BunServerAdapterParams['options'];
	declare serveOptions: BunServeAdapterServerOptions;
	protected apiHandlers: ApiHandler<string, Request, BunServerInstance>[];
	protected staticRoutes: StaticRoute[];

	protected errorHandler?: ErrorHandler;

	private bridge!: ClientBridge;
	public hmrManager!: HmrManager;
	private initializationPromise: Promise<void> | null = null;
	private fullyInitialized = false;
	declare serverInstance: BunServerInstance | null;
	private projectWatcher: ProjectWatcher | null = null;
	private adapterDisposed = false;
	private readonly deferRuntimeAssetSetup: boolean;
	private readonly allowPortFallback: boolean;
	private readonly previewHost: StaticPreviewHost;

	/**
	 * Reference to the application-level WebSocket handlers map.
	 *
	 * @remarks
	 * This is a reference to the map owned by `AbstractApplicationAdapter`,
	 * passed in via the constructor. The Bun adapter reads from it to wire
	 * WebSocket upgrades for user-registered patterns.
	 */
	protected websocketHandlers: Map<string, EcopagesWebSocketHandler<any, any>> = new Map();

	private registerBunRuntimePlugin(plugin: EcoBuildPlugin): void {
		Bun.plugin(plugin as any);
	}

	private adaptBunWebSocket<TContext, TParams extends Record<string, string>>(
		ws: ServerWebSocket<WsKindData>,
		kind: string,
		params: TParams,
		search: Record<string, string>,
		context: TContext,
	): EcopagesSocket<TContext, TParams> {
		return createEcopagesSocket(
			{
				send: (data) => ws.send(data),
				close: (code, reason) => ws.close(code, reason),
			},
			{ kind, params, search, context },
		);
	}

	/**
	 * Resolves the per-connection context for a Bun user connection.
	 *
	 * @remarks
	 * `context()` is invoked exactly once per accepted connection. Its
	 * resolved value is shared by all subsequent lifecycle hooks. If
	 * `context()` throws, the connection is closed immediately with code
	 * 1011 (server error) and the error is logged.
	 *
	 * @param request - The original upgrade request (best-effort reconstructed)
	 * @param handler - The registered handler
	 * @param kind - The registered route pattern
	 * @param params - Dynamic path parameters
	 * @param search - Query string parameters
	 * @returns The resolved per-connection context
	 */
	private async resolveBunContext<TContext, TParams extends Record<string, string>>(
		request: Request,
		handler: EcopagesWebSocketHandler<TContext, TParams>,
		kind: string,
		params: TParams,
		search: Record<string, string>,
	): Promise<TContext> {
		if (!handler.context) {
			return undefined as unknown as TContext;
		}
		try {
			return (await handler.context({ request, kind, params, search })) as TContext;
		} catch (error) {
			appLogger.error(`[WS:${kind}] context() failed; closing connection.`, error as Error);
			throw error;
		}
	}

	/**
	 * Creates a Bun server adapter with already-resolved runtime collaborators.
	 *
	 * @remarks
	 * The public params interface keeps `hmrManager`, `bridge`, and `previewHost`
	 * optional so factory callers can omit them. By the time the concrete adapter
	 * is constructed, those collaborators are mandatory because the adapter cannot
	 * initialize Bun HMR or preview flows without them.
	 */
	constructor({
		appConfig,
		runtimeOrigin,
		serveOptions,
		apiHandlers,
		staticRoutes,
		errorHandler,
		websocketHandlers,
		options,
		hostOwnsDevClient,
		deferRuntimeAssetSetup,
		allowPortFallback,
		hmrManager,
		bridge,
		previewHost,
	}: BunServerAdapterParams & {
		hmrManager: HmrManager;
		bridge: ClientBridge;
		previewHost: StaticPreviewHost;
	}) {
		super({ appConfig, runtimeOrigin, serveOptions, options });
		this.deferRuntimeAssetSetup = deferRuntimeAssetSetup === true;
		this.allowPortFallback = allowPortFallback !== false;
		this.apiHandlers = apiHandlers || [];
		this.staticRoutes = staticRoutes || [];
		this.errorHandler = errorHandler;
		this.bridge = bridge;
		this.hmrManager = hmrManager;
		this.previewHost = previewHost;
		this.hostOwnsDevClient = hostOwnsDevClient === true;
		if (websocketHandlers) {
			this.websocketHandlers = websocketHandlers;
		}
	}

	/**
	 * Wires user WebSocket routes onto a Node HTTP server used by host integrations.
	 */
	public attachUserWebSocketUpgrades(server: NodeHttpServer, options?: { passthroughUnmatched?: boolean }): void {
		attachNodeHttpWebSocketUpgrades(server, {
			runtimeOrigin: this.runtimeOrigin,
			websocketHandlers: this.websocketHandlers,
			passthroughUnmatched: options?.passthroughUnmatched,
		});
	}

	/**
	 * Initializes the server adapter's core runtime components.
	 */
	public async initialize(): Promise<void> {
		installBuildRuntime(this.appConfig);

		this.staticSiteGenerator = new StaticSiteGenerator({ appConfig: this.appConfig });
		prepareRuntimePublicDir(this.appConfig);

		const staticBuilderOptions = {
			appConfig: this.appConfig,
			staticSiteGenerator: this.staticSiteGenerator,
			serveOptions: this.serveOptions,
			runtimeOrigin: this.runtimeOrigin,
			needsServerBundle: this.apiHandlers.length > 0 || this.websocketHandlers.size > 0,
			hmrManager: this.hmrManager,
			onRuntimePlugin: (plugin: EcoBuildPlugin) => {
				this.registerBunRuntimePlugin(plugin);
			},
		};

		this.staticBuilder = new ServerStaticBuilder(staticBuilderOptions);

		if (!this.deferRuntimeAssetSetup) {
			await this.initializeRuntimePlugins({ watch: this.options?.watch });
		}

		if (this.options?.watch) {
			await this.hmrManager.ensureRuntimeReady();
		}
	}

	/**
	 * Registers runtime plugins and propagates the final HMR manager into each
	 * integration.
	 *
	 * @remarks
	 * This is where Bun's runtime-plugin registration path meets the integration
	 * lifecycle. A failure here leaves the runtime partially bootstrapped, so the
	 * method logs the underlying error and rethrows instead of trying to limp on.
	 */
	private async initializeRuntimePlugins(options?: { watch?: boolean }): Promise<void> {
		try {
			this.hmrManager.setEnabled(Boolean(options?.watch));

			await setupAppRuntimePlugins({
				appConfig: this.appConfig,
				runtimeOrigin: this.runtimeOrigin,
				onRuntimePlugin: (plugin: EcoBuildPlugin) => {
					this.registerBunRuntimePlugin(plugin);
				},
			});

			if (options?.watch) {
				attachHmrToIntegrations(this.appConfig, this.hmrManager);
			}
		} catch (error) {
			appLogger.error(`Failed to initialize plugins: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	/**
	 * Rebuilds the shared routing state and hot-reloads the live Bun server when a
	 * watched route file changes.
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
		const watcher = new ProjectWatcher({
			config: this.appConfig,
			refreshRouterRoutesCallback: this.refreshRouterRoutes.bind(this),
			hmrManager: this.hmrManager,
			bridge: this.bridge,
			hostOwnsDevClient: this.hostOwnsDevClient,
		});

		this.projectWatcher = watcher;
		await watcher.createWatcherSubscription();
	}

	/**
	 * Builds the `Bun.serve()` options for the current adapter state.
	 *
	 * @remarks
	 * When HMR is enabled the websocket dispatcher merges HMR and user handlers,
	 * routing by the `kind` field embedded in socket data at upgrade time.
	 * This prevents user-registered websocket handlers from being silently overwritten
	 * by the HMR handler in development mode.
	 *
	 * User WebSocket paths are intercepted in the fetch handler via the pattern matcher.
	 * The upgrade happens implicitly — no manual GET route registration needed.
	 */
	public getServerOptions({ enableHmr = false } = {}): BunServeOptions {
		appLogger.debug(`[BunServerAdapter] getServerOptions called with enableHmr: ${enableHmr}`);
		const serverOptions = this.buildServerSettings();
		const hasUserWs = this.websocketHandlers.size > 0;

		if (!enableHmr && !hasUserWs) {
			return serverOptions as BunServeOptions;
		}

		const userLifecycle = this.createBunUserLifecycle();

		if (enableHmr) {
			(serverOptions as BunServeOptions & { development?: boolean }).development = true;
			serverOptions.websocket = this.createHmrAwareWebSocketHandler(userLifecycle);
		} else {
			serverOptions.websocket = userLifecycle;
		}

		serverOptions.fetch = this.wrapFetchWithWebSocketUpgrades(serverOptions.fetch, {
			serveHmrEndpoints: enableHmr,
		});

		return serverOptions as BunServeOptions;
	}

	private createBunUserLifecycle(): ReturnType<typeof createBunUserWebSocketLifecycle<WsKindData>> {
		return createBunUserWebSocketLifecycle<WsKindData>({
			runtimeOrigin: this.runtimeOrigin,
			userHandlers: this.websocketHandlers,
			resolveContext: this.resolveBunContext.bind(this),
			adaptSocket: (ws, kind, params, search, context) =>
				this.adaptBunWebSocket(ws, kind, params, search, context),
		});
	}

	/**
	 * @remarks
	 * HMR and user sockets share one Bun `websocket` handler. Upgrade tags HMR
	 * connections with `kind: '__hmr__'`; everything else routes to the user lifecycle.
	 */
	private createHmrAwareWebSocketHandler(
		userLifecycle: ReturnType<typeof createBunUserWebSocketLifecycle<WsKindData>>,
	): WebSocketHandler<WsKindData> {
		const hmrHandler = this.hmrManager.getWebSocketHandler();
		const isHmrSocket = (ws: ServerWebSocket<WsKindData>): boolean => (ws.data?.kind ?? '__hmr__') === '__hmr__';

		return {
			open(ws: ServerWebSocket<WsKindData>) {
				if (isHmrSocket(ws)) return void hmrHandler.open?.(ws);
				userLifecycle.open(ws);
			},
			message(ws: ServerWebSocket<WsKindData>, msg: string | Buffer) {
				if (isHmrSocket(ws)) return void hmrHandler.message?.(ws, msg as any);
				userLifecycle.message(ws, msg);
			},
			close(ws: ServerWebSocket<WsKindData>, code: number, reason: string) {
				if (isHmrSocket(ws)) return void hmrHandler.close?.(ws, code, reason);
				userLifecycle.close(ws, code, reason);
			},
			error(ws: ServerWebSocket<WsKindData>, error: Error) {
				if (isHmrSocket(ws)) return void appLogger.error('[HMR] WebSocket error:', error);
				userLifecycle.error(ws, error);
			},
		} as WebSocketHandler<WsKindData>;
	}

	/**
	 * @remarks
	 * When `serveHmrEndpoints` is set, `/_hmr` is checked before user websocket
	 * patterns so HMR upgrades are never captured by app routes. Runtime assets are
	 * served by `SharedServerAdapter.handleSharedRequest` via `tryHandleAssetRequest`.
	 * Production mode with only user handlers skips the HMR branch entirely.
	 */
	private wrapFetchWithWebSocketUpgrades(
		originalFetch: BunServeOptions['fetch'],
		{ serveHmrEndpoints }: { serveHmrEndpoints: boolean },
	): BunServeOptions['fetch'] {
		const matchRoute = (pathname: string) => findWebSocketRoute(this.websocketHandlers, pathname);

		return async function (this: Server<unknown>, request: Request, server: Server<unknown>) {
			const url = new URL(request.url);

			if (serveHmrEndpoints) {
				if (url.pathname === '/_hmr') {
					const success = this.upgrade(request, { data: { kind: '__hmr__', params: {}, search: {} } });
					return success ? undefined : new Response('WebSocket upgrade failed', { status: 400 });
				}
			}

			const wsMatch = matchRoute(url.pathname);
			if (wsMatch && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
				const search = Object.fromEntries(url.searchParams.entries());
				const success = this.upgrade(request, {
					data: { kind: wsMatch.kind, params: wsMatch.params, search, upgradeUrl: request.url },
				});
				return success ? undefined : new Response('WebSocket upgrade failed', { status: 400 });
			}

			if (!originalFetch) {
				return new Response('Not Found', { status: 404 });
			}

			const res = await originalFetch.call(this, request, server);
			return res instanceof Response ? res : new Response('Not Found', { status: 404 });
		};
	}

	/**
	 * Composes the base Bun server settings that all runtime modes build from.
	 *
	 * @remarks
	 * This method centralizes the Bun-specific error boundary. It preserves the
	 * shared route pipeline while still allowing adapter-level custom error-handler
	 * execution and `HttpError` passthrough.
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
	public async buildStatic(options?: { preview?: boolean; force?: boolean }): Promise<string | undefined> {
		if (!this.fullyInitialized) {
			await this.initializeSharedRouteHandling({
				staticRoutes: this.staticRoutes,
				hmrManager: this.hmrManager,
			});
		}

		const buildRuntimeOrigin = resolveServeRuntimeOrigin(this.serveOptions);

		await this.staticBuilder.build(
			{ baseUrl: buildRuntimeOrigin, force: options?.force },
			{
				router: this.router,
				routeRendererFactory: this.routeRendererFactory,
				staticRoutes: this.staticRoutes,
			},
		);

		if (!options?.preview) {
			return undefined;
		}

		return this.startPreviewServer();
	}

	/**
	 * Serves an existing static export without running SSG. Used by e2e preview
	 * launchers after a shared prewarm build.
	 */
	public async servePreviewOnly(): Promise<string | undefined> {
		if (!this.fullyInitialized) {
			await this.initializeSharedRouteHandling({
				staticRoutes: this.staticRoutes,
				hmrManager: this.hmrManager,
			});
		}

		const distPath = path.join(this.appConfig.rootDir, this.appConfig.distDir);
		if (!fileSystem.exists(distPath)) {
			throw new Error(
				`Cannot serve preview without building first: dist directory "${this.appConfig.distDir}" not found in "${this.appConfig.rootDir}".`,
			);
		}

		return this.startPreviewServer();
	}

	private async startPreviewServer(): Promise<string | undefined> {
		const previewHostname = this.serveOptions.hostname || DEFAULT_ECOPAGES_HOSTNAME;
		const previewPort = Number(this.serveOptions.port || DEFAULT_ECOPAGES_PORT);
		const activePreviewPort = await this.previewHost.start({
			appConfig: this.appConfig,
			hostname: String(previewHostname),
			port: previewPort,
			allowPortFallback: this.allowPortFallback,
		});

		if (!activePreviewPort) {
			return undefined;
		}

		return `http://${previewHostname}:${activePreviewPort}`;
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
	 * Performs the one-time post-bind initialization path for Bun servers.
	 *
	 * @remarks
	 * This is intentionally split from `initialize()` because shared route handling
	 * and file watching need the live server instance to exist before Bun can
	 * reload updated route handlers in place.
	 */
	private async _performInitialization(server: BunServerInstance | null): Promise<void> {
		this.serverInstance = server;
		appLogger.debug('Completing server initialization with dynamic routes');

		await this.initializeSharedRouteHandling({
			staticRoutes: this.staticRoutes,
			hmrManager: this.hmrManager,
		});

		if (this.options?.watch) {
			await this.hmrManager.ensureRuntimeReady();
			startConfiguredIntegrationRuntimePrewarm({
				appConfig: this.appConfig,
				runtimeOrigin: this.runtimeOrigin,
			});
			startConfiguredClientGraphPrewarm({
				appConfig: this.appConfig,
				templateRouteFilePaths: this.router.templateRoutes.map((route) => route.filePath),
				hmrEnabled: true,
			});
			await awaitConfiguredClientGraphPrewarm(this.appConfig);
		}

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
			servePreviewOnly: this.servePreviewOnly.bind(this),
			completeInitialization: this.completeInitialization.bind(this),
			handleRequest: this.handleRequest.bind(this),
			attachUserWebSocketUpgrades: this.attachUserWebSocketUpgrades.bind(this),
			listStaticGenerationRoutes: (input) => this.router.listStaticGenerationRoutes(input),
			dispose: this.dispose.bind(this),
		};
	}

	/**
	 * Releases dev-time resources owned by the adapter.
	 *
	 * @remarks
	 * Safe to call multiple times. Does not stop the bound Bun server — callers
	 * should shut down transport through the runtime host before disposing.
	 */
	public async dispose(): Promise<void> {
		if (this.adapterDisposed) {
			return;
		}

		this.adapterDisposed = true;

		await disposeDevResources({
			projectWatcher: this.projectWatcher,
			appConfig: this.appConfig,
			hmrManager: this.hmrManager,
			bridge: this.bridge,
			previewHost: this.previewHost,
		});

		this.projectWatcher = null;
	}

	/**
	 * Handles HTTP requests by passing them securely to the shared core router adapter.
	 *
	 * @remarks
	 * HMR HTML injection for API and page responses is owned by
	 * `SharedServerAdapter.handleSharedRequest`. This method only maps the
	 * request into the shared pipeline.
	 */
	public async handleRequest(request: Request): Promise<Response> {
		const response = await this.handleSharedRequest(request, {
			apiHandlers: this.apiHandlers,
			errorHandler: this.errorHandler,
			serverInstance: this.serverInstance,
			hmrManager: this.hmrManager,
		});

		return response;
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
 * Creates the Bun server adapter and fills in the runtime-specific collaborators
 * that Bun callers usually leave implicit.
 *
 * @remarks
 * This is the canonical entry point for Bun server-adapter construction. It
 * guarantees that the concrete adapter receives a Bun websocket bridge, HMR
 * manager, and preview host even though those dependencies are optional on the
 * public params type.
 */
export async function createBunServerAdapter(params: BunServerAdapterParams): Promise<BunServerAdapterResult> {
	const runtimeOrigin = params.runtimeOrigin ?? resolveServeRuntimeOrigin(params.serveOptions);
	const bridge = params.bridge ?? new ClientBridge();
	const hmrManager = params.hmrManager ?? new HmrManager({ appConfig: params.appConfig, bridge });
	setAppDevClientBridge(params.appConfig, bridge);
	setAppHmrManager(params.appConfig, hmrManager);
	const previewHost = params.previewHost ?? new BunStaticPreviewHost();

	const adapter = new BunServerAdapter({
		...params,
		runtimeOrigin,
		bridge,
		hmrManager,
		previewHost,
	});

	return adapter.createAdapter();
}
