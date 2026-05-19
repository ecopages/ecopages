import type { Server, WebSocketHandler } from 'bun';
import path from 'node:path';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../../config/constants.ts';
import { RESOLVED_ASSETS_DIR } from '../../config/constants.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { ApiHandler, ApiHandlerContext, ErrorHandler, StaticRoute } from '../../types/public-types.ts';
import { HttpError } from '../../errors/http-error.ts';
import { createRequire } from '../../utils/locals-utils.ts';

import { fileSystem } from '@ecopages/file-system';
import { getAppBrowserBuildPlugins, setupAppRuntimePlugins } from '../../build/build-adapter.ts';
import { installAppRuntimeBuildExecutor } from '../../build/runtime-build-executor.ts';
import { StaticSiteGenerator } from '../../static-site-generator/static-site-generator.ts';
import { ProjectWatcher } from '../../watchers/project-watcher.ts';
import { SharedServerAdapter } from '../shared/server-adapter.ts';
import type { ServerAdapterResult } from '../abstract/server-adapter.ts';
import { ApiResponseBuilder } from '../shared/api-response.ts';
import type { StaticPreviewHost } from '../shared/static-preview-host.ts';

import { ServerStaticBuilder } from '../shared/server-static-builder.ts';
import {
	injectHmrRuntimeIntoHtmlResponse,
	isHtmlResponse,
	shouldInjectHmrHtmlResponse,
} from '../shared/hmr-html-response.ts';
import { resolveServeRuntimeOrigin } from '../shared/runtime-app-bootstrap.ts';
import { ClientBridge } from './client-bridge.ts';
import { HmrManager } from './hmr-manager.ts';
import { BunStaticPreviewHost } from './static-preview-host.ts';

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
	options?: {
		watch?: boolean;
	};
	hmrManager?: HmrManager;
	bridge?: ClientBridge;
	previewHost?: StaticPreviewHost;
}

export interface BunServerAdapterResult extends ServerAdapterResult {
	getServerOptions: (options?: { enableHmr?: boolean }) => BunServeOptions;
	buildStatic: (options?: { preview?: boolean }) => Promise<void>;
	completeInitialization: (server?: BunServerInstance | null) => Promise<void>;
	handleRequest: (request: Request) => Promise<Response>;
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
	private readonly previewHost: StaticPreviewHost;

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
		options,
		hmrManager,
		bridge,
		previewHost,
	}: BunServerAdapterParams & {
		hmrManager: HmrManager;
		bridge: ClientBridge;
		previewHost: StaticPreviewHost;
	}) {
		super({ appConfig, runtimeOrigin, serveOptions, options });
		this.apiHandlers = apiHandlers || [];
		this.staticRoutes = staticRoutes || [];
		this.errorHandler = errorHandler;
		this.bridge = bridge;
		this.hmrManager = hmrManager;
		this.previewHost = previewHost;
	}

	/**
	 * Returns whether adapter-level HTML responses still need HMR runtime injection.
	 *
	 * @remarks
	 * Filesystem-routed pages are wrapped later in the shared route layer. This
	 * adapter-level check exists for explicit API handlers that return HTML and
	 * would otherwise bypass the route wrapper entirely.
	 */
	private shouldInjectHmrScript(): boolean {
		return shouldInjectHmrHtmlResponse(this.options?.watch === true, this.hmrManager);
	}

	/**
	 * Delegates the HTML-response test to the shared response helper used by both
	 * adapters.
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
	 * Initializes the server adapter's core runtime components.
	 */
	public async initialize(): Promise<void> {
		installAppRuntimeBuildExecutor(this.appConfig, {
			development: this.options?.watch === true,
		});

		this.staticSiteGenerator = new StaticSiteGenerator({ appConfig: this.appConfig });
		await this.hmrManager.buildRuntime();
		this.prepareRuntimePublicDir();

		const staticBuilderOptions = {
			appConfig: this.appConfig,
			staticSiteGenerator: this.staticSiteGenerator,
			serveOptions: this.serveOptions,
			apiHandlers: this.apiHandlers,
		};

		this.staticBuilder = new ServerStaticBuilder(staticBuilderOptions);

		await this.initializeRuntimePlugins({ watch: this.options?.watch });
	}

	/**
	 * Copies the source `public` directory into the runtime output and ensures the
	 * HMR assets directory exists before any runtime bundles are emitted.
	 */
	private prepareRuntimePublicDir(): void {
		const srcPublicDir = path.join(this.appConfig.rootDir, this.appConfig.srcDir, this.appConfig.publicDir);

		if (fileSystem.exists(srcPublicDir)) {
			fileSystem.copyDir(srcPublicDir, path.join(this.appConfig.rootDir, this.appConfig.distDir));
		}

		fileSystem.ensureDir(path.join(this.appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR));
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
				hmrManager: this.hmrManager,
				onRuntimePlugin: (plugin) => {
					Bun.plugin(plugin as any);
				},
			});

			const browserBuildPlugins = getAppBrowserBuildPlugins(this.appConfig);
			this.hmrManager.setPlugins(browserBuildPlugins);

			for (const integration of this.appConfig.integrations) {
				integration.setHmrManager(this.hmrManager);
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
		});

		await watcher.createWatcherSubscription();
	}

	/**
	 * Builds the `Bun.serve()` options for the current adapter state.
	 *
	 * @remarks
	 * The HMR-enabled variant wraps the base fetch handler so one Bun server can
	 * serve normal requests, accept HMR websocket upgrades, and expose the HMR
	 * runtime asset without splitting responsibility across separate listeners.
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
	public async buildStatic(options?: { preview?: boolean }): Promise<void> {
		if (!this.fullyInitialized) {
			await this.initializeSharedRouteHandling({
				staticRoutes: this.staticRoutes,
				hmrManager: this.hmrManager,
			});
		}

		const buildRuntimeOrigin = this.serverInstance
			? `http://${this.serverInstance.hostname || DEFAULT_ECOPAGES_HOSTNAME}:${this.serverInstance.port || DEFAULT_ECOPAGES_PORT}`
			: undefined;

		await this.staticBuilder.build(
			{ ...options, preview: false, baseUrl: buildRuntimeOrigin },
			{
				router: this.router,
				routeRendererFactory: this.routeRendererFactory,
				staticRoutes: this.staticRoutes,
			},
		);

		if (!options?.preview) {
			return;
		}

		const previewHostname = this.serveOptions.hostname || DEFAULT_ECOPAGES_HOSTNAME;
		const previewPort = Number(this.serveOptions.port || DEFAULT_ECOPAGES_PORT);
		const activePreviewPort = await this.previewHost.start({
			appConfig: this.appConfig,
			hostname: String(previewHostname),
			port: previewPort,
		});

		if (activePreviewPort) {
			appLogger.info(`Preview running at http://${previewHostname}:${activePreviewPort}`);
			return;
		}
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
