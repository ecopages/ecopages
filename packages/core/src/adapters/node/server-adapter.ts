import { createServer, type IncomingMessage, type Server as NodeHttpServer, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { RESOLVED_ASSETS_DIR } from '../../constants.ts';
import { defaultBuildAdapter } from '../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import { ProjectWatcher } from '../../watchers/project-watcher.ts';
import { NodeClientBridge } from './node-client-bridge.ts';
import { NodeHmrManager } from './node-hmr-manager.ts';
import type {
	ApiHandler,
	ApiHandlerContext,
	CacheInvalidator,
	ErrorHandler,
	RenderContext,
	StaticRoute,
} from '../../public-types.ts';
import { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import { FSRouter } from '../../router/fs-router.ts';
import { FSRouterScanner } from '../../router/fs-router-scanner.ts';
import { MemoryCacheStore } from '../../services/cache/memory-cache-store.ts';
import { PageCacheService } from '../../services/cache/page-cache-service.ts';
import { SchemaValidationService } from '../../services/schema-validation-service.ts';
import { StaticSiteGenerator } from '../../static-site-generator/static-site-generator.ts';
import { AbstractServerAdapter, type ServerAdapterResult } from '../abstract/server-adapter.ts';
import { HttpError } from '../../errors/http-error.ts';
import { ServerStaticBuilder } from '../shared/server-static-builder.ts';
import { ExplicitStaticRouteMatcher } from '../shared/explicit-static-route-matcher.ts';
import { ApiResponseBuilder } from '../shared/api-response.ts';
import { FileSystemServerResponseFactory } from '../shared/fs-server-response-factory.ts';
import { FileSystemResponseMatcher } from '../shared/fs-server-response-matcher.ts';
import { ServerRouteHandler } from '../shared/server-route-handler.ts';
import { createRenderContext } from '../shared/render-context.ts';
import { createRequire } from '../../utils/locals-utils.ts';
import { NodeStaticContentServer } from './static-content-server.ts';

export type NodeServerInstance = NodeHttpServer;
type NodeApiRequest = Request & { params?: Record<string, string | string[]> };

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

export class NodeServerAdapter extends AbstractServerAdapter<NodeServerAdapterParams, NodeServerAdapterResult> {
	private serverInstance: NodeServerInstance | null = null;
	private initialized = false;
	private apiHandlers: ApiHandler[];
	private staticRoutes: StaticRoute[];
	private errorHandler?: ErrorHandler;
	private router!: FSRouter;
	private fileSystemResponseMatcher!: FileSystemResponseMatcher;
	private routeRendererFactory!: RouteRendererFactory;
	private routeHandler!: ServerRouteHandler;
	private staticSiteGenerator!: StaticSiteGenerator;
	private staticBuilder!: ServerStaticBuilder;
	private previewServer: NodeStaticContentServer | null = null;
	private readonly schemaValidator = new SchemaValidationService();
	private bridge: NodeClientBridge | null = null;
	private hmrManager: NodeHmrManager | null = null;
	private processorBuildPlugins: EcoBuildPlugin[] = [];

	constructor(options: NodeServerAdapterParams) {
		super(options);
		this.apiHandlers = options.apiHandlers || [];
		this.staticRoutes = options.staticRoutes || [];
		this.errorHandler = options.errorHandler;
	}

	public async initialize(): Promise<void> {
		this.setupLoaders();
		this.copyPublicDir();
		await this.initializePlugins();
		await this.initRouter();
		this.configureResponseHandlers();
		this.staticSiteGenerator = new StaticSiteGenerator({ appConfig: this.appConfig });
		this.staticBuilder = new ServerStaticBuilder({
			appConfig: this.appConfig,
			staticSiteGenerator: this.staticSiteGenerator,
			serveOptions: this.serveOptions,
		});
		this.initialized = true;
	}

	private setupLoaders(): void {
		for (const loader of this.appConfig.loaders.values()) {
			defaultBuildAdapter.registerPlugin(loader);
		}
	}

	private copyPublicDir(): void {
		const srcPublicDir = path.join(this.appConfig.rootDir, this.appConfig.srcDir, this.appConfig.publicDir);

		if (fileSystem.exists(srcPublicDir)) {
			fileSystem.copyDir(srcPublicDir, path.join(this.appConfig.rootDir, this.appConfig.distDir));
		}

		fileSystem.ensureDir(path.join(this.appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR));
	}

	private async initializePlugins(): Promise<void> {
		const processorBuildPlugins: EcoBuildPlugin[] = [];

		for (const processor of this.appConfig.processors.values()) {
			await processor.setup();

			if (processor.plugins) {
				for (const plugin of processor.plugins) {
					defaultBuildAdapter.registerPlugin(plugin);
				}
			}
			if (processor.buildPlugins) {
				processorBuildPlugins.push(...processor.buildPlugins);
				for (const plugin of processor.buildPlugins) {
					defaultBuildAdapter.registerPlugin(plugin);
				}
			}
		}

		for (const integration of this.appConfig.integrations) {
			integration.setConfig(this.appConfig);
			integration.setRuntimeOrigin(this.runtimeOrigin);
			if (this.hmrManager) {
				integration.setHmrManager(this.hmrManager);
			}
			await integration.setup();

			for (const plugin of integration.plugins) {
				defaultBuildAdapter.registerPlugin(plugin);
			}
		}

		this.processorBuildPlugins = processorBuildPlugins;
	}

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

		this.routeHandler = new ServerRouteHandler({
			router: this.router,
			fileSystemResponseMatcher: this.fileSystemResponseMatcher,
			explicitStaticRouteMatcher,
			watch: !!this.options?.watch,
			hmrManager: this.hmrManager ?? undefined,
		});
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
			requestInit.body = req as unknown as BodyInit;
			requestInit.duplex = 'half';
		}

		return new Request(url, requestInit);
	}

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

	private normalizePath(pathname: string): string {
		if (pathname.length > 1 && pathname.endsWith('/')) {
			return pathname.slice(0, -1);
		}

		return pathname;
	}

	private matchApiPath(pattern: string, pathname: string): Record<string, string | string[]> | null {
		const normalizedPattern = this.normalizePath(pattern);
		const normalizedPathname = this.normalizePath(pathname);

		const patternSegments = normalizedPattern.split('/').filter(Boolean);
		const pathSegments = normalizedPathname.split('/').filter(Boolean);
		const params: Record<string, string | string[]> = {};

		let patternIndex = 0;
		let pathIndex = 0;

		while (patternIndex < patternSegments.length && pathIndex < pathSegments.length) {
			const patternSegment = patternSegments[patternIndex];
			const pathSegment = pathSegments[pathIndex];

			if (patternSegment === '*') {
				return params;
			}

			if (patternSegment.startsWith('[...') && patternSegment.endsWith(']')) {
				const paramName = patternSegment.slice(4, -1);
				params[paramName] = pathSegments.slice(pathIndex);
				return params;
			}

			if (patternSegment.startsWith(':')) {
				params[patternSegment.slice(1)] = pathSegment;
				patternIndex++;
				pathIndex++;
				continue;
			}

			if (patternSegment.startsWith('[') && patternSegment.endsWith(']')) {
				params[patternSegment.slice(1, -1)] = pathSegment;
				patternIndex++;
				pathIndex++;
				continue;
			}

			if (patternSegment !== pathSegment) {
				return null;
			}

			patternIndex++;
			pathIndex++;
		}

		if (patternIndex < patternSegments.length) {
			const remaining = patternSegments.slice(patternIndex);
			const catchAll = remaining[0];

			if (
				remaining.length === 1 &&
				(catchAll === '*' || (catchAll.startsWith('[...') && catchAll.endsWith(']')))
			) {
				if (catchAll.startsWith('[...')) {
					const paramName = catchAll.slice(4, -1);
					params[paramName] = [];
				}
				return params;
			}

			return null;
		}

		if (pathIndex < pathSegments.length) {
			return null;
		}

		return params;
	}

	private matchApiHandler(
		request: Request,
	): { routeConfig: ApiHandler; params: Record<string, string | string[]> } | null {
		const pathname = new URL(request.url).pathname;
		const method = request.method.toUpperCase();

		for (const routeConfig of this.apiHandlers) {
			const routeMethod = (routeConfig.method || 'GET').toUpperCase();
			if (routeMethod !== method) {
				continue;
			}

			const params = this.matchApiPath(routeConfig.path, pathname);
			if (params) {
				return { routeConfig, params };
			}
		}

		return null;
	}

	private async retrieveBodyFromRequest(request: Request): Promise<unknown> {
		const contentType = request.headers.get('Content-Type') || '';

		if (contentType.includes('application/json')) {
			return request.json();
		}

		if (contentType.includes('text/plain')) {
			return request.text();
		}

		return undefined;
	}

	private getCacheService(): CacheInvalidator | null {
		return this.fileSystemResponseMatcher?.getCacheService() ?? null;
	}

	private getRenderContext(): RenderContext {
		return createRenderContext({ integrations: this.appConfig.integrations });
	}

	private async handleApiRequest(
		request: Request,
		routeConfig: ApiHandler,
		params: Record<string, string | string[]>,
	): Promise<Response> {
		let context: ApiHandlerContext<NodeApiRequest, NodeServerInstance | null> | undefined;

		try {
			const middleware = routeConfig.middleware || [];
			const schema = routeConfig.schema;
			const locals: Record<string, unknown> = {};
			const requestWithParams = this.attachRouteParams(request, params);

			context = {
				request: requestWithParams,
				response: new ApiResponseBuilder(),
				server: this.serverInstance,
				locals,
				require: createRequire((): Record<string, unknown> => locals),
				services: {
					cache: this.getCacheService(),
				},
				...this.getRenderContext(),
			};

			if (schema) {
				const url = new URL(request.url);
				const queryParams = Object.fromEntries(url.searchParams);
				const headers = Object.fromEntries(request.headers);

				let body: unknown;
				if (schema.body) {
					try {
						body = await this.retrieveBodyFromRequest(request);
					} catch {
						return context.response.status(400).json({
							error: 'Invalid request body',
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

				const validated = validationResult.data!;
				if (validated.body !== undefined) {
					context.body = validated.body;
				}
				if (validated.query !== undefined) {
					context.query = validated.query;
				}
				if (validated.headers !== undefined) {
					context.headers = validated.headers;
				}
			}

			if (middleware.length === 0) {
				return routeConfig.handler(context);
			}

			let index = 0;
			const executeNext = async (): Promise<Response> => {
				if (index < middleware.length) {
					const currentMiddleware = middleware[index++];
					return currentMiddleware(context!, executeNext);
				}

				return routeConfig.handler(context!);
			};

			return executeNext();
		} catch (error) {
			if (error instanceof Response) {
				return error;
			}

			if (this.errorHandler) {
				try {
					if (!context) {
						const locals: Record<string, unknown> = {};
						context = {
							request: this.attachRouteParams(request, params),
							response: new ApiResponseBuilder(),
							server: this.serverInstance,
							locals,
							require: createRequire((): Record<string, unknown> => locals),
							services: { cache: this.getCacheService() },
							...this.getRenderContext(),
						};
					}

					return this.errorHandler(error, context);
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
	}

	private attachRouteParams(request: Request, params: Record<string, string | string[]>): NodeApiRequest {
		const requestWithParams = request as NodeApiRequest;
		requestWithParams.params = params;
		return requestWithParams;
	}

	public async handleRequest(_request: Request): Promise<Response> {
		if (!this.initialized) {
			throw new Error('Node server adapter is not initialized. Call createAdapter() first.');
		}

		const url = new URL(_request.url);

		if (url.pathname === '/_hmr_runtime.js' && this.hmrManager) {
			const runtimePath = this.hmrManager.getRuntimePath();
			if (fileSystem.exists(runtimePath)) {
				return new Response(fileSystem.readFileAsBuffer(runtimePath) as BodyInit, {
					headers: { 'Content-Type': 'application/javascript' },
				});
			}
		}

		const apiMatch = this.matchApiHandler(_request);
		if (apiMatch) {
			return this.handleApiRequest(_request, apiMatch.routeConfig, apiMatch.params);
		}

		return this.routeHandler.handleResponse(_request);
	}

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

			const loaderPlugins = Array.from(this.appConfig.loaders.values());
			const hmrBuildPlugins = [...loaderPlugins, ...this.processorBuildPlugins];
			this.hmrManager.setPlugins(hmrBuildPlugins);

			for (const integration of this.appConfig.integrations) {
				integration.setHmrManager(this.hmrManager);
			}

			this.configureResponseHandlers();

			const watcher = new ProjectWatcher({
				config: this.appConfig,
				refreshRouterRoutesCallback: async () => {
					await this.router.init();
					this.configureResponseHandlers();
				},
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
