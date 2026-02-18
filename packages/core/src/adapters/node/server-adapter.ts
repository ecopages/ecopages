import type { Server as NodeHttpServer } from 'node:http';
import path from 'node:path';
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
import { ApiResponseBuilder } from '../shared/api-response.js';
import { FileSystemServerResponseFactory } from '../shared/fs-server-response-factory.ts';
import { FileSystemResponseMatcher } from '../shared/fs-server-response-matcher.ts';
import { ServerRouteHandler } from '../shared/server-route-handler.ts';
import { createRenderContext } from '../shared/render-context.ts';
import { createRequire } from '../../utils/locals-utils.ts';

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
	private readonly schemaValidator = new SchemaValidationService();

	constructor(options: NodeServerAdapterParams) {
		super(options);
		this.apiHandlers = options.apiHandlers || [];
		this.staticRoutes = options.staticRoutes || [];
		this.errorHandler = options.errorHandler;
	}

	public async initialize(): Promise<void> {
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
				watchMode: false,
			},
		});

		const cacheConfig = this.appConfig.cache;
		const isCacheEnabled = cacheConfig?.enabled ?? true;
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
			watch: false,
		});
	}

	public getServerOptions(): NodeServeAdapterServerOptions {
		return {
			...this.serveOptions,
		};
	}

	public async buildStatic(options?: { preview?: boolean }): Promise<void> {
		if (options?.preview) {
			throw new Error('Node preview mode is not implemented yet');
		}

		if (!this.initialized) {
			await this.initialize();
		}

		await this.staticBuilder.build(options, {
			router: this.router,
			routeRendererFactory: this.routeRendererFactory,
			staticRoutes: this.staticRoutes,
		});
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

		const apiMatch = this.matchApiHandler(_request);
		if (apiMatch) {
			return this.handleApiRequest(_request, apiMatch.routeConfig, apiMatch.params);
		}

		return this.routeHandler.handleResponse(_request);
	}

	public async completeInitialization(_server: NodeServerInstance): Promise<void> {
		this.serverInstance = _server;
		appLogger.debug('Node server adapter initialization completed', {
			apiHandlers: this.apiHandlers.length,
			staticRoutes: this.staticRoutes.length,
			hasErrorHandler: !!this.errorHandler,
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
