import path from 'node:path';
import type { BunPlugin, BunRequest, Server, WebSocketHandler } from 'bun';
import { RESOLVED_ASSETS_DIR } from '../../constants.ts';
import { StaticContentServer } from '../../dev/sc-server.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import type { ApiHandler } from '../../public-types.ts';
import { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import { FSRouter } from '../../router/fs-router.ts';
import { FSRouterScanner } from '../../router/fs-router-scanner.ts';
import { StaticSiteGenerator } from '../../static-site-generator/static-site-generator.ts';
import { deepMerge } from '../../utils/deep-merge.ts';
import { FileUtils } from '../../utils/file-utils.module.ts';
import { ProjectWatcher } from '../../watchers/project-watcher.ts';
import {
	AbstractServerAdapter,
	type ServerAdapterOptions,
	type ServerAdapterResult,
} from '../abstract/server-adapter.ts';
import { ApiResponseBuilder } from '../shared/api-response.js';
import { FileSystemServerResponseFactory } from '../shared/fs-server-response-factory.ts';
import { FileSystemResponseMatcher } from '../shared/fs-server-response-matcher.ts';
import { HmrManager } from './hmr-manager';
import { BunRouterAdapter } from './router-adapter.ts';

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

export interface BunServerAdapterOptions extends ServerAdapterOptions {
	serveOptions: BunServeAdapterServerOptions;
	appConfig: EcoPagesAppConfig;
	apiHandlers?: ApiHandler<any, BunRequest, Server<unknown>>[];
}

export interface BunServerAdapterResult extends ServerAdapterResult {
	getServerOptions: (options?: { enableHmr?: boolean }) => BunServeOptions;
	buildStatic: (options?: { preview?: boolean }) => Promise<void>;
	completeInitialization: (server: Server<unknown>) => Promise<void>;
}

export class BunServerAdapter extends AbstractServerAdapter<BunServerAdapterOptions, BunServerAdapterResult> {
	declare appConfig: EcoPagesAppConfig;
	declare options: BunServerAdapterOptions['options'];
	declare serveOptions: BunServerAdapterOptions['serveOptions'];
	protected apiHandlers: ApiHandler<any, BunRequest>[];

	private router!: FSRouter;
	private fileSystemResponseMatcher!: FileSystemResponseMatcher;
	private routeRendererFactory!: RouteRendererFactory;
	private routes: BunServerRoutes = {};
	private staticSiteGenerator!: StaticSiteGenerator;
	public hmrManager!: HmrManager;
	private initializationPromise: Promise<void> | null = null;
	private fullyInitialized = false;
	declare serverInstance: Server<unknown> | null;

	constructor(options: BunServerAdapterOptions) {
		super(options);
		this.apiHandlers = options.apiHandlers || [];
	}

	/**
	 * Initializes the server adapter's core components.
	 * Sets up static site generator, HMR manager, loaders, and plugins.
	 */
	public async initialize(): Promise<void> {
		this.staticSiteGenerator = new StaticSiteGenerator({ appConfig: this.appConfig });
		this.hmrManager = new HmrManager(this.appConfig);
		await this.hmrManager.buildRuntime();

		this.setupLoaders();
		this.copyPublicDir();
		await this.initializePlugins();
	}

	private setupLoaders(): void {
		const loaders = this.appConfig.loaders;
		for (const loader of loaders.values()) {
			Bun.plugin(loader);
		}
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
		const refreshRouterRoutesCallback = this.refreshRouterRoutes.bind(this);
		const watcherInstance = new ProjectWatcher({
			config: this.appConfig,
			refreshRouterRoutesCallback,
			hmrManager: this.hmrManager,
		});

		await watcherInstance.createWatcherSubscription();
	}

	private copyPublicDir(): void {
		FileUtils.copyDirSync(
			path.join(this.appConfig.rootDir, this.appConfig.srcDir, this.appConfig.publicDir),
			path.join(this.appConfig.rootDir, this.appConfig.distDir, this.appConfig.publicDir),
		);
		FileUtils.ensureDirectoryExists(path.join(this.appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR));
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

	private async initializePlugins(): Promise<void> {
		try {
			const hmrEnabled = !!this.options?.watch;
			this.hmrManager.setEnabled(hmrEnabled);

			const processorBuildPlugins: BunPlugin[] = [];

			const processorPromises = Array.from(this.appConfig.processors.values()).map(async (processor) => {
				await processor.setup();
				if (processor.plugins) {
					for (const plugin of processor.plugins) {
						Bun.plugin(plugin);
					}
				}
				if (processor.buildPlugins) {
					processorBuildPlugins.push(...processor.buildPlugins);
				}
			});

			const integrationPromises = this.appConfig.integrations.map(async (integration) => {
				integration.setConfig(this.appConfig);
				integration.setRuntimeOrigin(this.runtimeOrigin);
				integration.setHmrManager(this.hmrManager);
				await integration.setup();
			});

			await Promise.all([...processorPromises, ...integrationPromises]);

			this.hmrManager.setPlugins(processorBuildPlugins);
		} catch (error) {
			appLogger.error(`Failed to initialize plugins: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
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

		this.fileSystemResponseMatcher = new FileSystemResponseMatcher({
			router: this.router,
			routeRendererFactory: this.routeRendererFactory,
			fileSystemResponseFactory,
		});
	}

	private adaptRouterRoutes(): void {
		const routerAdapter = new BunRouterAdapter(this);
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

		const mergedRoutes = deepMerge(routes || {}, this.routes);
		appLogger.debug(`[BunServerAdapter] Building server settings with ${this.apiHandlers.length} API handlers`);

		for (const routeConfig of this.apiHandlers) {
			const method = routeConfig.method || 'GET';
			const path = routeConfig.path;

			appLogger.debug(`[BunServerAdapter] Registering API route: ${method} ${path}`);

			const wrappedHandler = async (request: BunRequest<string>): Promise<Response> => {
				try {
					await waitForInit();
					return await routeConfig.handler({
						request,
						response: new ApiResponseBuilder(),
						server: this.serverInstance,
					});
				} catch (error) {
					appLogger.error(`[ecopages] Error handling API request: ${error}`);
					return new Response('Internal Server Error', { status: 500 });
				}
			};

			mergedRoutes[path] = {
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
					const response = await handleReq(request);
					return response;
				} catch (error) {
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
		const { preview = false } = options ?? {};

		if (!this.fullyInitialized) {
			await this.initRouter();
			this.configureResponseHandlers();
			this.adaptRouterRoutes();
		}

		const baseUrl = `http://${this.serveOptions.hostname || 'localhost'}:${this.serveOptions.port || 3000}`;

		await this.staticSiteGenerator.run({
			router: this.router,
			baseUrl,
			routeRendererFactory: this.routeRendererFactory,
		});

		if (!preview) {
			appLogger.info('Build completed');
			return;
		}

		const { server } = StaticContentServer.createServer({
			appConfig: this.appConfig,
		});

		appLogger.info(`Preview running at http://localhost:${(server as Server<unknown>).port}`);
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
		return this.handleResponse(request);
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

		const pathname = new URL(request.url).pathname;
		const match = !pathname.includes('.') && this.router.match(request.url);

		const response = await (match
			? this.fileSystemResponseMatcher.handleMatch(match)
			: this.handleNoMatch(request));

		/** Inject HMR client script into HTML responses in watch mode */
		if (
			this.options?.watch &&
			this.hmrManager?.isEnabled() &&
			response &&
			response.headers.get('Content-Type')?.startsWith('text/html')
		) {
			const html = await response.text();

			const hmrScript = `
<script type="module">
  import '/_hmr_runtime.js';
</script>
`;

			const updatedHtml = html.replace(/<\/html>/i, `${hmrScript}</html>`);

			const headers = new Headers(response.headers);
			headers.delete('Content-Length');

			return new Response(updatedHtml, {
				status: response.status,
				statusText: response.statusText,
				headers,
			});
		}

		return response;
	}

	/**
	 * Handles requests that do not match any routes.
	 */
	private async handleNoMatch(request: Request): Promise<Response> {
		await this.waitForInitialization();

		try {
			const pathname = new URL(request.url).pathname;
			return await this.fileSystemResponseMatcher.handleNoMatch(pathname);
		} catch (error) {
			if (error instanceof Error) {
				this.hmrManager.broadcast({ type: 'error', message: error.message });
				appLogger.error('Error handling no match:', error);
			}
			return new Response('Internal Server Error', { status: 500 });
		}
	}
}

/**
 * Factory function to create a Bun server adapter
 */
export async function createBunServerAdapter(options: BunServerAdapterOptions): Promise<BunServerAdapterResult> {
	const adapter = new BunServerAdapter(options);
	return adapter.createAdapter();
}
