import { createServer, type Server as NodeHttpServer } from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { fileSystem } from '@ecopages/file-system';
import { getAppBrowserBuildPlugins, setupAppRuntimePlugins } from '../../build/build-adapter.ts';
import { installAppRuntimeBuildExecutor } from '../../build/runtime-build-executor.ts';
import { RESOLVED_ASSETS_DIR } from '../../config/constants.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { NodeClientBridge } from './node-client-bridge.ts';
import { NodeHmrManager } from './node-hmr-manager.ts';
import type { ApiHandler, ErrorHandler, StaticRoute } from '../../types/public-types.ts';
import { ProjectWatcher } from '../../watchers/project-watcher.ts';

import { StaticSiteGenerator } from '../../static-site-generator/static-site-generator.ts';
import { SharedServerAdapter } from '../shared/server-adapter.ts';
import type { ServerAdapterResult } from '../abstract/server-adapter.ts';
import { ServerStaticBuilder } from '../shared/server-static-builder.ts';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../../config/constants.ts';
import {
	injectHmrRuntimeIntoHtmlResponse,
	isHtmlResponse,
	shouldInjectHmrHtmlResponse,
} from '../shared/hmr-html-response.ts';
import { resolveServeRuntimeOrigin } from '../shared/runtime-app-bootstrap.ts';
import { NodeClientAbortError, NodeHttpRequestBridge } from './http-request-bridge.ts';
import { NodeStaticPreviewHost } from './static-preview-host.ts';
import type { StaticPreviewHost } from '../shared/static-preview-host.ts';
import { DefaultNodeServerDevRuntimeFactory, type NodeServerDevRuntimeFactory } from './server-adapter-dependencies.ts';

export type NodeServerInstance = NodeHttpServer;
export type NodeServeAdapterServerOptions = {
	port?: number;
	hostname?: string;
	[key: string]: unknown;
};

export interface NodeServerAdapterParams {
	appConfig: EcoPagesAppConfig;
	runtimeOrigin: string;
	serveOptions: NodeServeAdapterServerOptions;
	apiHandlers?: ApiHandler[];
	staticRoutes?: StaticRoute[];
	errorHandler?: ErrorHandler;
	options?: {
		watch?: boolean;
	};
	previewHost?: StaticPreviewHost;
	requestBridge?: NodeHttpRequestBridge;
	devRuntimeFactory?: NodeServerDevRuntimeFactory;
}

export interface NodeServerAdapterResult extends ServerAdapterResult {
	completeInitialization: (server: NodeServerInstance) => Promise<void>;
	handleRequest: (request: Request) => Promise<Response>;
}

/**
 * Node.js HTTP server adapter for the Ecopages runtime.
 *
 * `NodeServerAdapter` bridges the Node.js `http` module and the Ecopages
 * `SharedServerAdapter` abstraction, translating between Node's
 * `IncomingMessage`/`ServerResponse` API and the platform-agnostic Web
 * `Request`/`Response` model.
 *
 * Lifecycle:
 * 1. `createAdapter()` — calls `initialize()` and returns the public adapter result.
 * 2. `completeInitialization(server)` — called once the HTTP server is listening.
 *    Conditionally wires HMR, WebSocket upgrades, and the file watcher when
 *    `options.watch` is `true`.
 * 3. `handleRequest(request)` — delegates to `handleSharedRequest` for routing;
 *    intercepts `ClientAbortError` to return 499 instead of 500.
 * 4. `buildStatic()` — spins up an ephemeral runtime server, generates all static
 *    pages against it, then tears it down.
 *
 * @see SharedServerAdapter for routing, caching and response handler logic.
 */
export class NodeServerAdapter extends SharedServerAdapter<NodeServerAdapterParams, NodeServerAdapterResult> {
	private serverInstance: NodeServerInstance | null = null;
	private initialized = false;
	private apiHandlers: ApiHandler[];
	private staticRoutes: StaticRoute[];
	private errorHandler?: ErrorHandler;
	private bridge: NodeClientBridge | null = null;
	private hmrManager: NodeHmrManager | null = null;
	private readonly previewHost: StaticPreviewHost;
	private readonly requestBridge: NodeHttpRequestBridge;
	private readonly devRuntimeFactory: NodeServerDevRuntimeFactory;

	private shouldInjectHmrScript(): boolean {
		return shouldInjectHmrHtmlResponse(this.options?.watch === true, this.hmrManager ?? undefined);
	}

	private isHtmlResponse(response: Response): boolean {
		return isHtmlResponse(response);
	}

	private async maybeInjectHmrScript(response: Response): Promise<Response> {
		if (this.shouldInjectHmrScript() && this.isHtmlResponse(response)) {
			return injectHmrRuntimeIntoHtmlResponse(response);
		}

		return response;
	}

	constructor(options: NodeServerAdapterParams) {
		super(options);
		this.apiHandlers = options.apiHandlers || [];
		this.staticRoutes = options.staticRoutes || [];
		this.errorHandler = options.errorHandler;
		this.previewHost = options.previewHost!;
		this.requestBridge = options.requestBridge!;
		this.devRuntimeFactory = options.devRuntimeFactory!;
	}

	/**
	 * Prepares the adapter for use.
	 *
	 * Order is intentional:
	 * 1. **Loaders** are registered first so processors and integrations can
	 *    reference loader-provided file types in their own plugins.
	 * 2. **Public dir** is copied before any build so static assets are in `distDir`
	 *    before the first request arrives.
	 * 3. **Plugins** (processors, then integrations) are set up after the public dir
	 *    is in place so they can safely reference dist-relative paths.
	 * 4. **Router** is initialised last because it may depend on files written by
	 *    processors during their `setup()` calls.
	 */
	public async initialize(): Promise<void> {
		installAppRuntimeBuildExecutor(this.appConfig, {
			development: this.options?.watch === true,
		});

		this.prepareRuntimePublicDir();
		await setupAppRuntimePlugins({
			appConfig: this.appConfig,
			runtimeOrigin: this.runtimeOrigin,
			hmrManager: this.hmrManager ?? undefined,
		});
		await this.initializeSharedRouteHandling({
			staticRoutes: this.staticRoutes,
			hmrManager: this.hmrManager ?? undefined,
		});
		this.staticSiteGenerator = new StaticSiteGenerator({ appConfig: this.appConfig });
		this.staticBuilder = new ServerStaticBuilder({
			appConfig: this.appConfig,
			staticSiteGenerator: this.staticSiteGenerator,
			serveOptions: this.serveOptions,
			apiHandlers: this.apiHandlers,
		});
		this.initialized = true;
	}

	private prepareRuntimePublicDir(): void {
		const srcPublicDir = path.join(this.appConfig.rootDir, this.appConfig.srcDir, this.appConfig.publicDir);

		if (fileSystem.exists(srcPublicDir)) {
			fileSystem.copyDir(srcPublicDir, path.join(this.appConfig.rootDir, this.appConfig.distDir));
		}

		fileSystem.ensureDir(path.join(this.appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR));
	}

	public getServerOptions(): NodeServeAdapterServerOptions {
		return {
			...this.serveOptions,
		};
	}

	public async buildStatic(options?: { preview?: boolean }): Promise<void> {
		if (!this.initialized) {
			await this.initialize();
		}

		const buildServer = await this.startBuildRuntimeServer();
		const buildRuntimeOrigin = this.getListeningServerOrigin(buildServer);

		try {
			await this.staticBuilder.build(
				{ preview: false, baseUrl: buildRuntimeOrigin },
				{
					router: this.router,
					routeRendererFactory: this.routeRendererFactory,
					staticRoutes: this.staticRoutes,
				},
			);
		} finally {
			await this.stopBuildRuntimeServer(buildServer);
		}

		if (!options?.preview) {
			return;
		}

		await this.previewHost.start({
			appConfig: this.appConfig,
			hostname: String(this.serveOptions.hostname || DEFAULT_ECOPAGES_HOSTNAME),
			port: Number(this.serveOptions.port || DEFAULT_ECOPAGES_PORT),
		});

		const previewHostname = this.serveOptions.hostname || DEFAULT_ECOPAGES_HOSTNAME;
		const previewPort = this.serveOptions.port || DEFAULT_ECOPAGES_PORT;
		appLogger.info(`Preview running at http://${previewHostname}:${previewPort}`);
	}

	private async startBuildRuntimeServer(): Promise<NodeHttpServer> {
		const hostname = String(this.serveOptions.hostname || DEFAULT_ECOPAGES_HOSTNAME);
		const port = 0;

		const server = createServer(async (req, res) => {
			try {
				const webRequest = this.requestBridge.createWebRequest(req, this.runtimeOrigin);
				const response = await this.handleRequest(webRequest);
				await this.requestBridge.sendNodeResponse(res, response);
			} catch (error) {
				if (error instanceof NodeClientAbortError) {
					return;
				}

				appLogger.error('Node static build runtime request failed', error as Error);
				res.statusCode = 500;
				res.end('Internal Server Error');
			}
		});

		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(port, hostname, () => {
				server.off('error', reject);
				resolve();
			});
		});

		this.serverInstance = server;
		appLogger.info(`Server running at ${this.getListeningServerOrigin(server)}`);

		return server;
	}

	private getListeningServerOrigin(server: NodeHttpServer): string {
		const address = server.address();
		const hostname = String(this.serveOptions.hostname || DEFAULT_ECOPAGES_HOSTNAME);

		if (!address || typeof address === 'string') {
			throw new Error('Build runtime server did not expose a numeric listening port');
		}

		return `http://${hostname}:${address.port}`;
	}

	/**
	 * Gracefully shuts down the ephemeral build runtime server.
	 *
	 * `closeAllConnections()` is called *before* `close()` because `server.close()`
	 * only stops accepting new connections — it waits for existing keep-alive
	 * connections to finish naturally, which can stall the build indefinitely.
	 * `closeAllConnections()` force-closes any lingering sockets immediately so
	 * the `close()` callback fires promptly.
	 *
	 * The `NodeClientBridge` heartbeat is also destroyed here so its `setInterval`
	 * does not prevent the Node.js process from exiting cleanly after the build.
	 */
	private async stopBuildRuntimeServer(server: NodeHttpServer): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
			server.closeAllConnections();
		});

		if (this.serverInstance === server) {
			this.serverInstance = null;
		}

		this.bridge?.destroy();
		this.bridge = null;
	}

	public async createAdapter(): Promise<NodeServerAdapterResult> {
		await this.initialize();

		return {
			getServerOptions: this.getServerOptions.bind(this),
			buildStatic: this.buildStatic.bind(this),
			completeInitialization: this.completeInitialization.bind(this),
			handleRequest: this.handleRequest.bind(this),
		};
	}

	/**
	 * Handles a single incoming Web `Request` and returns a Web `Response`.
	 *
	 * Delegates to `handleSharedRequest` for all routing, caching, and response
	 * handler logic. The only Node-specific concern here is translating a
	 * `ClientAbortError` — which the body `ReadableStream` raises when the
	 * underlying socket closes early — into a 499 response so it does not
	 * incorrectly surface as a 500 in application logs.
	 */
	public async handleRequest(request: Request): Promise<Response> {
		if (!this.initialized) {
			throw new Error('Node server adapter is not initialized. Call createAdapter() first.');
		}

		try {
			const response = await this.handleSharedRequest(request, {
				apiHandlers: this.apiHandlers,
				errorHandler: this.errorHandler,
				serverInstance: this.serverInstance,
				hmrManager: this.hmrManager,
			});

			return await this.maybeInjectHmrScript(response);
		} catch (error) {
			if (error instanceof NodeClientAbortError) {
				/**
				 * The client disconnected before the response was sent (killed tab,
				 * network drop, or programmatic abort). This is a normal browser behaviour,
				 * not a server fault. Return 499 (Client Closed Request) silently so the
				 * error does not surface in application logs as a 500.
				 */
				return new Response(null, { status: 499 });
			}
			throw error;
		}
	}

	/**
	 * Called once the HTTP server is bound and listening.
	 *
	 * When `options.watch` is `true` this method wires the full HMR pipeline:
	 * - A `WebSocketServer` is attached to the existing HTTP server via the
	 *   `upgrade` event (no separate port needed).
	 * - `NodeClientBridge` tracks active WebSocket connections and handles
	 *   broadcast + heartbeat cleanup.
	 * - `NodeHmrManager` watches the filesystem and triggers incremental esbuild
	 *   rebuilds, notifying connected clients via the bridge.
	 * - Shared watcher bootstrapping listens for route-level file changes and
	 *   refreshes the router and response handlers when pages are added or removed.
	 *
	 * WebSocket upgrade requests that do not target `/_hmr` are rejected with an
	 * immediate socket destroy to prevent unhandled upgrade leaks.
	 */
	public async completeInitialization(server: NodeServerInstance): Promise<void> {
		this.serverInstance = server;

		if (this.options?.watch) {
			const devRuntime = this.devRuntimeFactory.create({ appConfig: this.appConfig });
			const wss = devRuntime.websocketServer;
			this.bridge = devRuntime.bridge;
			this.hmrManager = devRuntime.hmrManager;
			this.hmrManager.setEnabled(true);

			await this.hmrManager.buildRuntime();

			server.on('upgrade', (req, socket, head) => {
				const url = new URL(req.url ?? '/', this.runtimeOrigin);
				if (url.pathname === '/_hmr') {
					wss.handleUpgrade(req, socket, head, (ws) => {
						this.bridge!.subscribe(ws);
						ws.on('close', () => this.bridge!.unsubscribe(ws));
						ws.on('error', (err) => appLogger.error('[HMR] WebSocket error:', err));
					});
				} else {
					socket.destroy();
				}
			});

			const browserBuildPlugins = getAppBrowserBuildPlugins(this.appConfig);
			this.hmrManager.setPlugins(browserBuildPlugins);

			for (const integration of this.appConfig.integrations) {
				integration.setHmrManager(this.hmrManager);
			}

			this.configureSharedResponseHandlers(this.staticRoutes, this.hmrManager);

			const watcher = new ProjectWatcher({
				config: this.appConfig,
				refreshRouterRoutesCallback: this.createSharedWatchRefreshCallback({
					staticRoutes: this.staticRoutes,
					hmrManager: this.hmrManager,
				}),
				hmrManager: this.hmrManager,
				bridge: this.bridge,
			});

			await watcher.createWatcherSubscription();
		}

		appLogger.debug('Node server adapter initialization completed', {
			apiHandlers: this.apiHandlers.length,
			staticRoutes: this.staticRoutes.length,
			hasErrorHandler: !!this.errorHandler,
			hmrEnabled: !!this.hmrManager?.isEnabled(),
		});
	}
}

/**
 * Factory function that creates and fully initialises a `NodeServerAdapter`.
 *
 * `runtimeOrigin` is derived from `serveOptions` when not explicitly provided,
 * so callers only need to set it when the server is behind a reverse proxy that
 * changes the effective host or port.
 */
export async function createNodeServerAdapter(params: NodeServerAdapterParams): Promise<NodeServerAdapterResult> {
	const runtimeOrigin = params.runtimeOrigin ?? resolveServeRuntimeOrigin(params.serveOptions);
	const previewHost = params.previewHost ?? new NodeStaticPreviewHost();
	const requestBridge = params.requestBridge ?? new NodeHttpRequestBridge();
	const devRuntimeFactory = params.devRuntimeFactory ?? new DefaultNodeServerDevRuntimeFactory();

	const adapter = new NodeServerAdapter({
		...params,
		runtimeOrigin,
		previewHost,
		requestBridge,
		devRuntimeFactory,
	});

	return adapter.createAdapter();
}
