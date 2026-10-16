import { type Server as NodeHttpServer } from 'node:http';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { setupAppRuntimePlugins } from '../../build/build-adapter.ts';
import { installBuildQueue } from '../../build/runtime/build-queue.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type {
	ApiHandler,
	ErrorHandler,
	StaticRoute,
	ErrorPageLoaders,
	EcopagesWebSocketHandler,
} from '../../types/public-types.ts';
import { attachNodeHttpWebSocketUpgrades } from '../shared/ws/node-http-websocket-upgrades.ts';

import { StaticSiteGenerator } from '../../static-site-generator/static-site-generator.ts';
import { ServerRequestPipeline, type ServerRequestContext } from '../shared/runtime/server-request-pipeline.ts';
import { ServerStaticBuilder } from '../shared/runtime/server-static-builder.ts';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../../config/constants.ts';
import { disposeDevResources, prepareRuntimePublicDir } from '../shared/runtime/runtime-server-lifecycle.ts';
import { resolveServeRuntimeOrigin } from '../shared/runtime/runtime-app-bootstrap.ts';
import { bindRuntimeServer } from '../shared/runtime/bind-runtime-server.ts';
import type { RuntimeHost } from '../shared/runtime/runtime-host.ts';
import { isNodeClientAbortError } from './http-request-bridge.ts';
import type { NodeRuntimeServeOptions } from './runtime-host.ts';
import { serveDistFile } from '../shared/http/dist-file-handler.ts';
import type { AppRuntime } from '../../config/app-runtime.ts';
import { DevSession } from './dev-session.ts';

export type NodeServerInstance = NodeHttpServer;
export type NodeServeAdapterServerOptions = {
	port?: number;
	hostname?: string;
};

export interface NodeServerAdapterParams {
	appConfig: EcoPagesAppConfig;
	runtime: AppRuntime;
	serveOptions: NodeServeAdapterServerOptions;
	apiHandlers?: ApiHandler[];
	staticRoutes?: StaticRoute[];
	errorPageLoaders?: ErrorPageLoaders;
	errorHandler?: ErrorHandler;
	websocketHandlers?: Map<string, EcopagesWebSocketHandler<unknown, Record<string, string>>>;
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

type ServerAdapterPhase = 'idle' | 'starting' | 'ready' | 'stopping' | 'stopped';

/**
 * Node.js HTTP server adapter for the Ecopages runtime.
 *
 * It owns Node's HTTP listener, WebSocket upgrades, and development resources.
 * Request routing and rendering run through one composed `ServerRequestPipeline`.
 *
 * Lifecycle:
 * 1. `initialize()` — prepares runtime assets and route handling.
 * 2. `completeInitialization(server)` — called once the HTTP server is listening.
 *    Conditionally wires HMR, WebSocket upgrades, and the file watcher when
 *    `options.watch` is `true`.
 * 3. `handleRequest(request)` — delegates to `handleSharedRequest` for routing;
 *    intercepts `ClientAbortError` to return 499 instead of 500 and sends every
 *    other escaped error through the shared `app.onError` boundary.
 * 4. `buildStatic()` — generates static pages in-process through the shared
 *    static builder (no runtime server), then optionally starts the preview server.
 */

export class NodeServerAdapter {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly runtime: AppRuntime;
	private readonly options: { watch?: boolean };
	private serveOptions: NodeServeAdapterServerOptions;
	private readonly requestPipeline: ServerRequestPipeline;
	private serverInstance: NodeServerInstance | undefined;
	private phase: ServerAdapterPhase = 'idle';
	private ready: Promise<void> | undefined;
	private apiHandlers: ApiHandler[];
	private staticRoutes: StaticRoute[];
	private errorPageLoaders: ErrorPageLoaders;
	private errorHandler?: ErrorHandler;
	private staticSiteGenerator!: StaticSiteGenerator;
	private staticBuilder!: ServerStaticBuilder;
	private devSession: DevSession | undefined;
	private readonly runtimeAssetSetup: 'start' | 'export' | 'none';
	private readonly allowPortFallback: boolean;
	private readonly onDevelopmentRestart?: (changedFile: string) => Promise<void>;
	private readonly runtimeHost: RuntimeHost<NodeHttpServer, NodeRuntimeServeOptions>;
	private previewServer: NodeHttpServer | undefined;
	private previewLifecycleTail: Promise<void> = Promise.resolve();
	private disposal: Promise<void> | undefined;
	/**
	 * Reference to the application-level WebSocket handlers map.
	 *
	 * @remarks
	 * This is a reference to the map owned by `EcopagesApp`,
	 * passed in via the constructor. The Node adapter reads from it to wire
	 * WebSocket upgrades for user-registered patterns.
	 */
	protected websocketHandlers: Map<string, EcopagesWebSocketHandler<unknown, Record<string, string>>> = new Map();

	constructor(
		options: NodeServerAdapterParams & { runtimeHost: RuntimeHost<NodeHttpServer, NodeRuntimeServeOptions> },
	) {
		this.appConfig = options.appConfig;
		this.runtime = options.runtime;
		this.options = options.options ?? {};
		this.serveOptions = options.serveOptions ?? {};
		this.requestPipeline = new ServerRequestPipeline({
			appConfig: this.appConfig,
			runtime: this.runtime,
			watch: this.options.watch,
			isClientAbortError: isNodeClientAbortError,
		});
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
	public initialize(): Promise<void> {
		if (this.phase === 'stopping' || this.phase === 'stopped') {
			return Promise.reject(new Error(`Cannot initialize a server adapter while it is ${this.phase}.`));
		}
		if (this.ready) return this.ready;
		if (this.phase !== 'idle') {
			return Promise.reject(new Error(`Cannot initialize a server adapter while it is ${this.phase}.`));
		}

		this.phase = 'starting';
		this.ready = this.initializeResources()
			.then(() => {
				if (this.phase === 'starting') this.phase = 'ready';
			})
			.catch((error: unknown) => {
				this.ready = undefined;
				if (this.phase === 'starting') this.phase = 'idle';
				throw error;
			});
		return this.ready;
	}

	private async initializeResources(): Promise<void> {
		installBuildQueue(this.appConfig);

		prepareRuntimePublicDir(this.appConfig);
		this.staticSiteGenerator = new StaticSiteGenerator({ appConfig: this.appConfig });
		this.staticBuilder = new ServerStaticBuilder({
			appConfig: this.appConfig,
			runtime: this.runtime,
			staticSiteGenerator: this.staticSiteGenerator,
			serveOptions: this.serveOptions,
			needsServerBundle: this.apiHandlers.length > 0 || this.websocketHandlers.size > 0,
		});
		if (this.runtimeAssetSetup === 'export') {
			await this.staticBuilder.prepareExport();
		} else if (this.runtimeAssetSetup === 'start') {
			await setupAppRuntimePlugins({
				appConfig: this.appConfig,
			});
		}
		await this.initializeSharedRouteHandling({
			staticRoutes: this.staticRoutes,
			errorPageLoaders: this.errorPageLoaders,
		});
	}

	public getServerOptions(): NodeServeAdapterServerOptions {
		return {
			...this.serveOptions,
		};
	}

	public applyBoundPort(input: { port: number; runtimeOrigin: string }): void {
		this.runtime.origin = input.runtimeOrigin;
		this.serveOptions = { ...this.serveOptions, port: input.port };
		this.staticBuilder?.setRuntimeBinding(input);
	}

	public async listStaticGenerationRoutes(input: { runtimeOrigin: string }) {
		return await this.requestPipeline.listStaticGenerationRoutes(input);
	}

	public async buildStatic(options?: { preview?: boolean; force?: boolean }): Promise<string | undefined> {
		await this.initialize();

		const baseUrl = resolveServeRuntimeOrigin(this.serveOptions);
		const { router, routeRendererFactory } = this.requestPipeline.getStaticBuildContext();
		await this.staticBuilder.build(
			{ baseUrl, force: options?.force },
			{
				router,
				routeRendererFactory,
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
		await this.initialize();

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
			if (this.phase === 'stopping' || this.phase === 'stopped') {
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
		if (this.previewServer === activeServer) this.previewServer = undefined;
	}

	private ensurePreviewCanStart(): void {
		if (this.phase === 'stopping' || this.phase === 'stopped') {
			throw new Error('Cannot start a preview after adapter disposal has begun.');
		}
	}

	public dispose(): Promise<void> {
		if (this.disposal) return this.disposal;
		if (this.phase === 'stopped') return Promise.resolve();

		this.phase = 'stopping';
		const ready = this.ready;
		this.disposal = Promise.resolve()
			.then(async () => {
				await ready?.catch(() => {});
				await this.disposeResources();
			})
			.finally(() => {
				this.phase = 'stopped';
			});
		return this.disposal;
	}

	private async disposeResources(): Promise<void> {
		await this.disposeRuntimeResources();
	}

	private async disposeRuntimeResources(): Promise<void> {
		const session = this.devSession;
		this.devSession = undefined;
		const errors: unknown[] = [];
		try {
			if (session) {
				await session.dispose();
			} else {
				await disposeDevResources({
					projectWatcher: undefined,
					appConfig: this.appConfig,
					bridge: undefined,
					stopPreviewServer: async () => {},
				});
			}
		} catch (error) {
			errors.push(error);
		}
		try {
			await this.stopPreviewServer();
		} catch (error) {
			errors.push(error);
		}
		this.serverInstance = undefined;
		if (errors.length === 1) throw errors[0];
		if (errors.length > 1) throw new AggregateError(errors, 'Failed to release server adapter resources');
	}

	protected configureSharedResponseHandlers(options: {
		staticRoutes: StaticRoute[];
		errorPageLoaders?: ErrorPageLoaders;
	}): void {
		this.requestPipeline.configureResponseHandlers(options);
	}

	protected initializeSharedRouteHandling(options: {
		staticRoutes: StaticRoute[];
		errorPageLoaders?: ErrorPageLoaders;
	}): Promise<void> {
		return this.requestPipeline.initializeRouteHandling(options);
	}

	protected createSharedWatchRefreshCallback(options: {
		staticRoutes: StaticRoute[];
		errorPageLoaders?: ErrorPageLoaders;
		onRoutesReady?: () => Promise<void> | void;
		onError?: (error: Error) => Promise<void> | void;
	}): () => Promise<void> {
		return this.requestPipeline.createWatchRefreshCallback(options);
	}

	public async handleSharedRequest(request: Request, context: ServerRequestContext): Promise<Response> {
		return await this.requestPipeline.handleSharedRequest(request, context);
	}

	/**
	 * Handles a single incoming Web `Request` and returns a Web `Response`.
	 *
	 * Delegates to `handleSharedRequest` for all routing, caching, and response
	 * handler logic. Escaped errors go through the shared `app.onError`
	 * boundary, which answers client aborts (see {@link isClientAbortError}) with 499.
	 */
	public async handleRequest(request: Request): Promise<Response> {
		await this.initialize();

		const context = {
			apiHandlers: this.apiHandlers,
			errorHandler: this.errorHandler,
			serverInstance: this.serverInstance,
		};

		try {
			return await this.handleSharedRequest(request, context);
		} catch (error) {
			return await this.requestPipeline.handleUnexpectedRequestError(error, request, context);
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
	 * - The watch-only `DevSession` owns HMR, watches the filesystem and triggers incremental
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
			this.devSession = new DevSession({
				appConfig: this.appConfig,
				runtime: this.runtime,
				server,
				requestPipeline: this.requestPipeline,
				websocketHandlers: this.websocketHandlers,
				onDevelopmentRestart: this.onDevelopmentRestart,
				configureResponseHandlers: () =>
					this.configureSharedResponseHandlers({
						staticRoutes: this.staticRoutes,
						errorPageLoaders: this.errorPageLoaders,
					}),
				createWatchRefreshCallback: () =>
					this.createSharedWatchRefreshCallback({
						staticRoutes: this.staticRoutes,
						errorPageLoaders: this.errorPageLoaders,
					}),
			});
			await this.devSession.start();
		} else {
			attachNodeHttpWebSocketUpgrades(server, {
				runtimeOrigin: this.runtime.origin,
				websocketHandlers: this.websocketHandlers,
			});
		}

		appLogger.debug('Node server adapter initialization completed', {
			apiHandlers: this.apiHandlers.length,
			staticRoutes: this.staticRoutes.length,
			hasErrorHandler: !!this.errorHandler,
			hmrEnabled: this.devSession !== undefined && this.runtime.hmr?.isEnabled() === true,
		});
	}
}

/** Creates the concrete Node server owned by `EcopagesApp`. */
export function createNodeServerAdapter(
	params: NodeServerAdapterParams,
	runtimeHost: RuntimeHost<NodeHttpServer, NodeRuntimeServeOptions>,
): NodeServerAdapter {
	return new NodeServerAdapter({
		...params,
		runtimeHost,
	});
}
