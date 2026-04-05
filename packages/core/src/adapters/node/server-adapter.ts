import { createServer, type IncomingMessage, type Server as NodeHttpServer, type ServerResponse } from 'node:http';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { NodeClientBridge } from './node-client-bridge.ts';
import { NodeHmrManager } from './node-hmr-manager.ts';
import type { ApiHandler, ErrorHandler, StaticRoute } from '../../types/public-types.ts';

import { StaticSiteGenerator } from '../../static-site-generator/static-site-generator.ts';
import { SharedServerAdapter } from '../shared/server-adapter.ts';
import type { ServerAdapterResult } from '../abstract/server-adapter.ts';
import { ServerStaticBuilder } from '../shared/server-static-builder.ts';
import {
	bindSharedRuntimeHmrManager,
	initializeSharedRuntimePlugins,
	installSharedRuntimeBuildExecutor,
	prepareSharedRuntimePublicDir,
	startSharedProjectWatching,
} from '../shared/runtime-bootstrap.ts';

import { NodeStaticContentServer } from './static-content-server.ts';

/**
 * Sentinel error thrown when the client closes the connection before the
 * request body is fully consumed (killed tab, ECONNRESET, cancelled upload).
 * Caught by `handleRequest` to return 499 instead of 500.
 */
class ClientAbortError extends Error {
	constructor() {
		super('Client closed the request');
		this.name = 'ClientAbortError';
	}
}

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
	private previewServer: NodeStaticContentServer | null = null;
	private bridge: NodeClientBridge | null = null;
	private hmrManager: NodeHmrManager | null = null;

	constructor(options: NodeServerAdapterParams) {
		super(options);
		this.apiHandlers = options.apiHandlers || [];
		this.staticRoutes = options.staticRoutes || [];
		this.errorHandler = options.errorHandler;
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
		installSharedRuntimeBuildExecutor(this.appConfig, {
			development: this.options?.watch === true,
		});

		prepareSharedRuntimePublicDir(this.appConfig);
		await initializeSharedRuntimePlugins({
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

		try {
			await this.staticBuilder.build(
				{ preview: false },
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

		if (this.previewServer) {
			await this.previewServer.stop();
		}

		this.previewServer = new NodeStaticContentServer({
			appConfig: this.appConfig,
			options: {
				hostname: this.serveOptions.hostname,
				port: Number(this.serveOptions.port || 3000),
			},
		});

		await this.previewServer.start();
		const previewHostname = this.serveOptions.hostname || 'localhost';
		const previewPort = this.serveOptions.port || 3000;
		appLogger.info(`Preview running at http://${previewHostname}:${previewPort}`);
	}

	/**
	 * Converts a Node.js `IncomingMessage` into a Web API `Request`.
	 *
	 * Multi-value headers (e.g. `set-cookie`) are appended individually so no
	 * value is silently dropped.
	 *
	 * For methods that carry a body (`POST`, `PUT`, `PATCH`, …), the raw
	 * `IncomingMessage` stream is wrapped in a `ReadableStream` rather than
	 * cast directly to `BodyInit`. See the inline doc block inside the `if`
	 * branch for the rationale (client-abort handling).
	 *
	 * `duplex: 'half'` is required by the `fetch` spec when a streaming body is
	 * provided — without it Node.js 18+ throws a `TypeError`.
	 */
	private createWebRequest(req: IncomingMessage): Request {
		const url = new URL(req.url ?? '/', this.runtimeOrigin);
		const headers = new Headers();

		for (const [key, value] of Object.entries(req.headers)) {
			if (Array.isArray(value)) {
				for (const item of value) {
					headers.append(key, item);
				}
				continue;
			}

			if (value !== undefined) {
				headers.set(key, value);
			}
		}

		const method = (req.method ?? 'GET').toUpperCase();
		const requestInit: RequestInit & { duplex?: 'half' } = {
			method,
			headers,
		};

		if (method !== 'GET' && method !== 'HEAD') {
			/**
			 * Wrap the IncomingMessage in a ReadableStream so we can intercept
			 * mid-stream client aborts (killed tab, network drop, cancelled upload).
			 *
			 * Without this, Node.js emits 'aborted'/'error' on the raw stream *after*
			 * the Request body is already being consumed, causing the error to bubble
			 * up as a generic 500 Internal Server Error with noise in the logs.
			 *
			 * The ReadableStream controller.error() triggers a stream-level rejection
			 * which propagates as a ClientAbortError. The `handleRequest` catch block
			 * detects it and returns 499 (Client Closed Request) silently instead.
			 */
			const body = new ReadableStream({
				start(controller) {
					req.on('data', (chunk: Buffer) => controller.enqueue(chunk));
					req.once('end', () => controller.close());
					req.once('aborted', () => {
						controller.error(new ClientAbortError());
					});
					req.once('error', (err) => {
						const isClientAbort = (err as NodeJS.ErrnoException).code === 'ECONNRESET';
						controller.error(isClientAbort ? new ClientAbortError() : err);
					});
				},
				cancel() {
					/**
					 * Client cancelled the stream mid-transfer (e.g. back button, fetch abort).
					 * Destroy the underlying socket so Node.js releases the file descriptor
					 * immediately rather than waiting for TCP keepalive to time out.
					 */
					req.destroy();
				},
			});

			requestInit.body = body;
			requestInit.duplex = 'half';
		}

		return new Request(url, requestInit);
	}

	/**
	 * Writes a Web `Response` back to a Node.js `ServerResponse`.
	 *
	 * The entire body is buffered via `arrayBuffer()` before writing. This is
	 * intentional for the current use-case (SSR pages and API routes), where
	 * responses are typically small and fully materialised. Streaming responses
	 * are not yet supported.
	 */
	private async sendNodeResponse(res: ServerResponse, response: Response): Promise<void> {
		res.statusCode = response.status;

		response.headers.forEach((value, key) => {
			res.setHeader(key, value);
		});

		if (!response.body) {
			res.end();
			return;
		}

		const body = Buffer.from(await response.arrayBuffer());
		res.end(body);
	}

	/**
	 * Starts an ephemeral HTTP server used *only* during a static site generation
	 * run.
	 *
	 * Static generation works by having the `StaticSiteGenerator` issue real HTTP
	 * requests to a live server for each route, capturing the rendered HTML. This
	 * approach reuses the normal request pipeline (middleware, caching, API
	 * handlers) without any special-casing for the build path.
	 *
	 * The server is torn down immediately after generation completes via
	 * `stopBuildRuntimeServer`, so it never overlaps with the actual dev/prod server.
	 */
	private async startBuildRuntimeServer(): Promise<NodeHttpServer> {
		const hostname = String(this.serveOptions.hostname || 'localhost');
		const port = Number(this.serveOptions.port || 3000);

		const server = createServer(async (req, res) => {
			try {
				const webRequest = this.createWebRequest(req);
				const response = await this.handleRequest(webRequest);
				await this.sendNodeResponse(res, response);
			} catch (error) {
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
		appLogger.info(`Server running at http://${hostname}:${port}`);

		return server;
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
	public async handleRequest(_request: Request): Promise<Response> {
		if (!this.initialized) {
			throw new Error('Node server adapter is not initialized. Call createAdapter() first.');
		}

		try {
			return await this.handleSharedRequest(_request, {
				apiHandlers: this.apiHandlers,
				errorHandler: this.errorHandler,
				serverInstance: this.serverInstance,
				hmrManager: this.hmrManager,
			});
		} catch (error) {
			if (error instanceof ClientAbortError) {
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
	public async completeInitialization(_server: NodeServerInstance): Promise<void> {
		this.serverInstance = _server;

		if (this.options?.watch) {
			const { WebSocketServer } = await import('ws');
			const wss = new WebSocketServer({ noServer: true });
			this.bridge = new NodeClientBridge();
			this.hmrManager = new NodeHmrManager({ appConfig: this.appConfig, bridge: this.bridge });
			this.hmrManager.setEnabled(true);

			await this.hmrManager.buildRuntime();

			_server.on('upgrade', (req, socket, head) => {
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

			bindSharedRuntimeHmrManager(this.appConfig, this.hmrManager);

			this.configureSharedResponseHandlers(this.staticRoutes, this.hmrManager);

			await startSharedProjectWatching({
				appConfig: this.appConfig,
				refreshRouterRoutesCallback: this.createSharedWatchRefreshCallback({
					staticRoutes: this.staticRoutes,
					hmrManager: this.hmrManager,
				}),
				hmrManager: this.hmrManager,
				bridge: this.bridge,
			});
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
	const runtimeOrigin =
		params.runtimeOrigin ??
		`http://${params.serveOptions.hostname || 'localhost'}:${params.serveOptions.port || 3000}`;

	const adapter = new NodeServerAdapter({
		...params,
		runtimeOrigin,
	});

	return adapter.createAdapter();
}
