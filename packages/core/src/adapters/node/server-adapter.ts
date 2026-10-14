import { type Server as NodeHttpServer, type IncomingMessage } from 'node:http';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { setupAppRuntimePlugins } from '../../build/build-adapter.ts';
import { installBuildQueue } from '../../build/runtime/build-queue.ts';
import { appLogger } from '../../global/app-logger.ts';
import { entryWatcherOwnsConfig } from '../../dev/development-restart.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { NodeClientBridge } from './node-client-bridge.ts';
import { NodeHmrManager } from './node-hmr-manager.ts';
import type {
	ApiHandler,
	ErrorHandler,
	StaticRoute,
	ErrorPageLoaders,
	EcopagesWebSocketHandler,
} from '../../types/public-types.ts';
import { ProjectWatcher } from '../../watchers/project-watcher.ts';
import { attachNodeHttpWebSocketUpgrades } from '../shared/ws/node-http-websocket-upgrades.ts';

import { StaticSiteGenerator } from '../../static-site-generator/static-site-generator.ts';
import { SharedServerAdapter } from '../shared/runtime/server-adapter.ts';
import type { ServerAdapterResult } from '../abstract/server-adapter.ts';
import { ServerStaticBuilder } from '../shared/runtime/server-static-builder.ts';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../../config/constants.ts';
import {
	attachHmrToIntegrations,
	disposeDevResources,
	prepareRuntimePublicDir,
	startDevWarmup,
} from '../shared/runtime/runtime-server-lifecycle.ts';
import { resolveServeRuntimeOrigin } from '../shared/runtime/runtime-app-bootstrap.ts';
import { bindRuntimeServer } from '../shared/runtime/bind-runtime-server.ts';
import type { RuntimeHost } from '../shared/runtime/runtime-host.ts';
import { isNodeClientAbortError } from './http-request-bridge.ts';
import { createNodeServerDevRuntime } from './server-adapter-dependencies.ts';
import type { NodeRuntimeServeOptions } from './runtime-host.ts';
import { serveDistFile } from '../shared/http/dist-file-handler.ts';

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
	errorPageLoaders?: ErrorPageLoaders;
	errorHandler?: ErrorHandler;
	websocketHandlers?: Map<string, EcopagesWebSocketHandler<any, any>>;
	options?: {
		watch?: boolean;
	};
	/**
	 * When Processors and Integrations set up.
	 *
	 * @remarks
	 * `start` sets them up before routes are read, `export` empties `dist/` first and then does the same for a
	 * run that exports the site (`build`, `preview`), and `none` leaves them alone for a preview that only serves
	 * an earlier export. Every mode sets up before the router reads a Page, so a Page module can resolve what a
	 * Processor generates in `setup()`.
	 */
	runtimeAssetSetup?: 'start' | 'export' | 'none';
	allowPortFallback?: boolean;
	onDevelopmentRestart?: (changedFile: string) => Promise<void>;
}

export interface NodeServerAdapterResult extends ServerAdapterResult {
	completeInitialization: (server: NodeServerInstance) => Promise<void>;
	handleRequest: (request: Request) => Promise<Response>;
	dispose: () => Promise<void>;
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
 *    intercepts `ClientAbortError` to return 499 instead of 500 and sends every
 *    other escaped error through the shared `app.onError` boundary.
 * 4. `buildStatic()` — generates static pages in-process through the shared
 *    static builder (no runtime server), then optionally starts the preview server.
 *
 * @see SharedServerAdapter for routing, caching and response handler logic.
 */
export class NodeServerAdapter extends SharedServerAdapter<NodeServerAdapterParams, NodeServerAdapterResult> {
	private serverInstance: NodeServerInstance | null = null;
	private initialized = false;
	private apiHandlers: ApiHandler[];
	private staticRoutes: StaticRoute[];
	private errorPageLoaders: ErrorPageLoaders;
	private errorHandler?: ErrorHandler;
	private bridge: NodeClientBridge | null = null;
	private hmrManager: NodeHmrManager | null = null;
	private projectWatcher: ProjectWatcher | null = null;
	private readonly runtimeAssetSetup: 'start' | 'export' | 'none';
	private readonly allowPortFallback: boolean;
	private readonly onDevelopmentRestart?: (changedFile: string) => Promise<void>;
	private readonly runtimeHost: RuntimeHost<NodeHttpServer, NodeRuntimeServeOptions>;
	private previewServer: NodeHttpServer | null = null;
	private previewLifecycleTail: Promise<void> = Promise.resolve();
	private previewDisposalPromise: Promise<void> | null = null;
	private previewDisposing = false;
	/**
	 * Reference to the application-level WebSocket handlers map.
	 *
	 * @remarks
	 * This is a reference to the map owned by `AbstractApplicationAdapter`,
	 * passed in via the constructor. The Node adapter reads from it to wire
	 * WebSocket upgrades for user-registered patterns.
	 */
	protected websocketHandlers: Map<string, EcopagesWebSocketHandler<any, any>> = new Map();

	constructor(
		options: NodeServerAdapterParams & { runtimeHost: RuntimeHost<NodeHttpServer, NodeRuntimeServeOptions> },
	) {
		super(options);
		this.runtimeAssetSetup = options.runtimeAssetSetup ?? 'start';
		this.allowPortFallback = options.allowPortFallback !== false;
		this.onDevelopmentRestart = options.onDevelopmentRestart;
		this.apiHandlers = options.apiHandlers || [];
		this.staticRoutes = options.staticRoutes || [];
		this.errorPageLoaders = options.errorPageLoaders ?? {};
		this.errorHandler = options.errorHandler;
		this.runtimeHost = options.runtimeHost;
		if (options.websocketHandlers) {
			this.websocketHandlers = options.websocketHandlers;
		}
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
	 *    is in place so they can safely reference dist-relative paths. An export
	 *    (`build`, `preview`) empties `dist/` first.
	 * 4. **Router** is initialised last because it may depend on files written by
	 *    processors during their `setup()` calls, and in build mode it imports Pages.
	 */
	public async initialize(): Promise<void> {
		installBuildQueue(this.appConfig);

		prepareRuntimePublicDir(this.appConfig);
		this.staticSiteGenerator = new StaticSiteGenerator({ appConfig: this.appConfig });
		this.staticBuilder = new ServerStaticBuilder({
			appConfig: this.appConfig,
			staticSiteGenerator: this.staticSiteGenerator,
			serveOptions: this.serveOptions,
			runtimeOrigin: this.runtimeOrigin,
			needsServerBundle: this.apiHandlers.length > 0 || this.websocketHandlers.size > 0,
			hmrManager: this.hmrManager ?? undefined,
		});
		if (this.runtimeAssetSetup === 'export') {
			await this.staticBuilder.prepareExport();
		} else if (this.runtimeAssetSetup === 'start') {
			await setupAppRuntimePlugins({
				appConfig: this.appConfig,
				runtimeOrigin: this.runtimeOrigin,
			});
		}
		await this.initializeSharedRouteHandling({
			staticRoutes: this.staticRoutes,
			errorPageLoaders: this.errorPageLoaders,
			hmrManager: this.hmrManager ?? undefined,
		});
		this.initialized = true;
	}

	public getServerOptions(): NodeServeAdapterServerOptions {
		return {
			...this.serveOptions,
		};
	}

	public async buildStatic(options?: { preview?: boolean; force?: boolean }): Promise<string | undefined> {
		if (!this.initialized) {
			await this.initialize();
		}

		const baseUrl = resolveServeRuntimeOrigin(this.serveOptions);
		await this.staticBuilder.build(
			{ baseUrl, force: options?.force },
			{
				router: this.router,
				routeRendererFactory: this.routeRendererFactory,
				staticRoutes: this.staticRoutes,
				errorPageLoaders: this.errorPageLoaders,
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
		if (!this.initialized) {
			await this.initialize();
		}

		const distPath = path.join(this.appConfig.rootDir, this.appConfig.distDir);
		if (!fileSystem.exists(distPath)) {
			throw new Error(
				`Cannot serve preview without building first: dist directory "${this.appConfig.distDir}" not found in "${this.appConfig.rootDir}".`,
			);
		}

		return this.startPreviewServer();
	}

	private startPreviewServer(): Promise<string | undefined> {
		return this.runPreviewLifecycle(async () => {
			this.ensurePreviewCanStart();
			await this.stopPreviewServerNow();
			this.ensurePreviewCanStart();

			const binding = await bindRuntimeServer(this.runtimeHost, {
				startOptions: {
					serveOptions: {
						hostname: String(this.serveOptions.hostname || DEFAULT_ECOPAGES_HOSTNAME),
						port: Number(this.serveOptions.port ?? DEFAULT_ECOPAGES_PORT),
						handleRequest: (request) =>
							serveDistFile(request, {
								distDir: this.appConfig.absolutePaths.distDir,
								watchMode: false,
								resolveExportedPages: true,
							}),
					},
				},
				allowPortFallback: this.allowPortFallback,
				usePortManager: true,
			});
			this.previewServer = binding.server;
			if (this.previewDisposing) {
				await this.stopPreviewServerNow();
				this.ensurePreviewCanStart();
			}

			return binding.runtimeOrigin;
		});
	}

	/**
	 * @remarks Preview changes run in order so overlapping starts cannot orphan listeners, and disposal can prevent a queued or in-flight start.
	 */
	private runPreviewLifecycle<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.previewLifecycleTail.then(operation, operation);
		this.previewLifecycleTail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	private stopPreviewServer(): Promise<void> {
		return this.runPreviewLifecycle(() => this.stopPreviewServerNow());
	}

	private async stopPreviewServerNow(): Promise<void> {
		const activeServer = this.previewServer;
		if (!activeServer) return;

		await this.runtimeHost.stop(activeServer);
		if (this.previewServer === activeServer) this.previewServer = null;
	}

	private ensurePreviewCanStart(): void {
		if (this.previewDisposing) {
			throw new Error('Cannot start a preview after adapter disposal has begun.');
		}
	}

	public override dispose(): Promise<void> {
		if (this.previewDisposalPromise) return this.previewDisposalPromise;

		this.previewDisposing = true;
		this.previewDisposalPromise = super.dispose();
		return this.previewDisposalPromise;
	}

	public async createAdapter(): Promise<NodeServerAdapterResult> {
		await this.initialize();

		return {
			getServerOptions: this.getServerOptions.bind(this),
			buildStatic: this.buildStatic.bind(this),
			servePreviewOnly: this.servePreviewOnly.bind(this),
			completeInitialization: this.completeInitialization.bind(this),
			handleRequest: this.handleRequest.bind(this),
			applyBoundPort: this.applyBoundPort.bind(this),
			listStaticGenerationRoutes: (input) => this.router.listStaticGenerationRoutes(input),
			dispose: this.dispose.bind(this),
		};
	}

	protected override async disposeRuntimeResources(): Promise<void> {
		await disposeDevResources({
			projectWatcher: this.projectWatcher,
			appConfig: this.appConfig,
			hmrManager: this.hmrManager,
			bridge: this.bridge,
			stopPreviewServer: () => this.stopPreviewServer(),
		});

		this.projectWatcher = null;
		this.hmrManager = null;
		this.bridge = null;
	}

	/**
	 * Handles a single incoming Web `Request` and returns a Web `Response`.
	 *
	 * Delegates to `handleSharedRequest` for all routing, caching, and response
	 * handler logic. Escaped errors go through the shared `app.onError`
	 * boundary, which answers client aborts (see {@link isClientAbortError}) with 499.
	 */
	public async handleRequest(request: Request): Promise<Response> {
		if (!this.initialized) {
			throw new Error('Node server adapter is not initialized. Call createAdapter() first.');
		}

		const context = {
			apiHandlers: this.apiHandlers,
			errorHandler: this.errorHandler,
			serverInstance: this.serverInstance,
			hmrManager: this.hmrManager ?? undefined,
		};

		try {
			return await this.handleSharedRequest(request, context);
		} catch (error) {
			return await this.handleUnexpectedRequestError(error, request, context);
		}
	}

	/**
	 * @remarks
	 * The request body stream raises `NodeClientAbortError` when the socket closes
	 * early (closed tab, network drop, programmatic abort).
	 */
	protected override isClientAbortError(error: unknown): boolean {
		return isNodeClientAbortError(error);
	}

	/**
	 * Called once the HTTP server is bound and listening.
	 *
	 * When `options.watch` is `true` this method wires the full HMR pipeline:
	 * - A `WebSocketServer` is attached to the existing HTTP server via the
	 *   `upgrade` event (no separate port needed).
	 * - `NodeClientBridge` tracks active WebSocket connections and handles
	 *   broadcast + heartbeat cleanup.
	 * - `NodeHmrManager` watches the filesystem and triggers incremental
	 *   rebuilds, notifying connected clients via the bridge.
	 * - Shared watcher bootstrapping listens for route-level file changes and
	 *   refreshes the router and response handlers when pages are added or removed.
	 *
	 * WebSocket upgrade requests that do not match a known path are rejected with an
	 * immediate socket destroy to prevent unhandled upgrade leaks.
	 */
	public async completeInitialization(server: NodeServerInstance): Promise<void> {
		this.serverInstance = server;

		if (this.options?.watch) {
			const devRuntime = createNodeServerDevRuntime(this.appConfig);
			const wss = devRuntime.websocketServer;
			this.bridge = devRuntime.bridge;
			this.hmrManager = devRuntime.hmrManager;
			this.hmrManager.setEnabled(true);

			await this.hmrManager.ensureRuntimeReady();

			const hmrPreflight = (
				req: IncomingMessage,
				socket: import('node:stream').Duplex,
				head: Buffer,
			): boolean => {
				const url = new URL(req.url ?? '/', this.runtimeOrigin);
				if (url.pathname !== '/_hmr') return false;
				wss.handleUpgrade(req, socket, head, (ws) => {
					this.bridge!.subscribe(ws);
					this.hmrManager?.sendPendingBuildErrors(ws);
					ws.on('close', () => this.bridge!.unsubscribe(ws));
					ws.on('error', (err) => appLogger.error('[HMR] WebSocket error:', err));
				});
				return true;
			};

			attachNodeHttpWebSocketUpgrades(server, {
				runtimeOrigin: this.runtimeOrigin,
				websocketHandlers: this.websocketHandlers,
				preflight: hmrPreflight,
			});

			attachHmrToIntegrations(this.appConfig, this.hmrManager);
			await startDevWarmup({
				appConfig: this.appConfig,
				runtimeOrigin: this.runtimeOrigin,
			});

			this.configureSharedResponseHandlers({
				staticRoutes: this.staticRoutes,
				hmrManager: this.hmrManager,
				errorPageLoaders: this.errorPageLoaders,
			});

			const watcher = new ProjectWatcher({
				config: this.appConfig,
				refreshRouterRoutesCallback: this.createSharedWatchRefreshCallback({
					staticRoutes: this.staticRoutes,
					errorPageLoaders: this.errorPageLoaders,
					hmrManager: this.hmrManager ?? undefined,
				}),
				hmrManager: this.hmrManager ?? undefined,
				bridge: this.bridge,
				onRestartRequest: this.onDevelopmentRestart,
				entryWatcherOwnsConfig: entryWatcherOwnsConfig(),
			});

			this.projectWatcher = watcher;
			await watcher.createWatcherSubscription();
		} else {
			attachNodeHttpWebSocketUpgrades(server, {
				runtimeOrigin: this.runtimeOrigin,
				websocketHandlers: this.websocketHandlers,
			});
		}

		this.startDevStaticRoutePrewarmWhenReady();

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
export async function createNodeServerAdapter(
	params: NodeServerAdapterParams,
	runtimeHost: RuntimeHost<NodeHttpServer, NodeRuntimeServeOptions>,
): Promise<NodeServerAdapterResult> {
	const runtimeOrigin = params.runtimeOrigin ?? resolveServeRuntimeOrigin(params.serveOptions);

	const adapter = new NodeServerAdapter({
		...params,
		runtimeOrigin,
		runtimeHost,
	});

	return adapter.createAdapter();
}
