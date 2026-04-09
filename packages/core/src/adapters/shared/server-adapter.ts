import path from 'node:path';
import { AbstractServerAdapter } from '../abstract/server-adapter.ts';
import type { ServerAdapterOptions, ServerAdapterResult } from '../abstract/server-adapter.ts';
import { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import { FSRouter } from '../../router/server/fs-router.ts';
import { FSRouterScanner } from '../../router/server/fs-router-scanner.ts';
import { MemoryCacheStore } from '../../services/cache/memory-cache-store.ts';
import { PageCacheService } from '../../services/cache/page-cache-service.ts';
import { SchemaValidationService } from '../../services/validation/schema-validation-service.ts';
import { StaticSiteGenerator } from '../../static-site-generator/static-site-generator.ts';
import { ServerStaticBuilder } from './server-static-builder.ts';
import { ExplicitStaticRouteMatcher } from './explicit-static-route-matcher.ts';
import { FileSystemServerResponseFactory } from './fs-server-response-factory.ts';
import { FileSystemResponseMatcher } from './fs-server-response-matcher.ts';
import { ServerRouteHandler } from './server-route-handler.ts';
import { createRenderContext } from './render-context.ts';
import { createRequire } from '../../utils/locals-utils.ts';
import { HttpError } from '../../errors/http-error.ts';
import { ApiResponseBuilder } from './api-response.ts';
import { appLogger } from '../../global/app-logger.ts';
import { fileSystem } from '@ecopages/file-system';
import type {
	ApiHandler,
	ApiHandlerContext,
	CacheInvalidator,
	ErrorHandler,
	RenderContext,
	StaticRoute,
} from '../../types/public-types.ts';

export abstract class SharedServerAdapter<
	TOptions extends ServerAdapterOptions,
	TResult extends ServerAdapterResult,
> extends AbstractServerAdapter<TOptions, TResult> {
	protected router!: FSRouter;
	protected fileSystemResponseMatcher!: FileSystemResponseMatcher;
	protected routeRendererFactory!: RouteRendererFactory;
	protected routeHandler!: ServerRouteHandler;
	protected staticSiteGenerator!: StaticSiteGenerator;
	protected staticBuilder!: ServerStaticBuilder;
	protected readonly schemaValidator = new SchemaValidationService();

	protected async initializeSharedRouteHandling(options: {
		staticRoutes: StaticRoute[];
		hmrManager?: any;
	}): Promise<void> {
		await this.initSharedRouter();
		this.configureSharedResponseHandlers(options.staticRoutes, options.hmrManager);
	}

	protected createSharedWatchRefreshCallback(options: {
		staticRoutes: StaticRoute[];
		hmrManager?: any;
		onRoutesReady?: () => Promise<void> | void;
		onError?: (error: Error) => Promise<void> | void;
	}): () => Promise<void> {
		return async () => {
			try {
				await this.initializeSharedRouteHandling({
					staticRoutes: options.staticRoutes,
					hmrManager: options.hmrManager,
				});

				if (options.onRoutesReady) {
					await options.onRoutesReady();
				}
			} catch (error) {
				if (options.onError) {
					await options.onError(error instanceof Error ? error : new Error(String(error)));
					return;
				}

				throw error;
			}
		};
	}

	/**
	 * Scans the filesystem and dynamically constructs the universal router map.
	 *
	 * This process runs identically across both Bun and Node wrappers. It analyzes the configured pages
	 * directory, building a map of all available UI routes and API endpoints.
	 * The resulting `FSRouter` instance becomes the central nervous system for mapping WinterCG incoming
	 * Web Requests (`Request`) to their corresponding internal execution paths.
	 */
	protected async initSharedRouter(): Promise<void> {
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

	/**
	 * Sets up the unified rendering pipeline and response matching chain.
	 *
	 * It bridges several sub-systems together so that when an incoming request is received, the adapter knows:
	 * 1. How to render React/Lit pages via `RouteRendererFactory`
	 * 2. How to match logical routes to physical filesystem artifacts via `FileSystemResponseMatcher`
	 * 3. Whether to serve the response from the embedded `PageCacheService` or generate it fresh on the fly.
	 *
	 * Because `HmrManager` implementations rely heavily on runtime-specific WebSocket APIs (e.g. Bun.serve Websockets vs Node WS),
	 * we leave it untyped (`any`) here at the common denominator core.
	 *
	 * @param staticRoutes - A map of explicitly served static assets.
	 * @param hmrManager - The runtime-specific Hot Module Replacement orchestrator (if watching).
	 */
	protected configureSharedResponseHandlers(staticRoutes: StaticRoute[], hmrManager?: any): void {
		this.routeRendererFactory = new RouteRendererFactory({
			appConfig: this.appConfig,
			rendererModules: this.appConfig.runtime?.rendererModuleContext,
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
			appConfig: this.appConfig,
			router: this.router,
			routeRendererFactory: this.routeRendererFactory,
			fileSystemResponseFactory,
			cacheService,
			defaultCacheStrategy: cacheConfig?.defaultStrategy ?? 'static',
		});

		const explicitStaticRouteMatcher =
			staticRoutes.length > 0
				? new ExplicitStaticRouteMatcher({
						appConfig: this.appConfig,
						routeRendererFactory: this.routeRendererFactory,
						staticRoutes,
					})
				: undefined;

		this.routeHandler = new ServerRouteHandler({
			router: this.router,
			fileSystemResponseMatcher: this.fileSystemResponseMatcher,
			explicitStaticRouteMatcher,
			watch: !!this.options?.watch,
			hmrManager,
		});
	}

	protected getCacheService(): CacheInvalidator | null {
		return this.fileSystemResponseMatcher?.getCacheService() ?? null;
	}

	protected getRenderContext(): RenderContext {
		return createRenderContext({
			integrations: this.appConfig.integrations,
			rendererModules: this.appConfig.runtime?.rendererModuleContext,
		});
	}

	/**
	 * Executes an Application Programming Interface (API) handler in an environment-agnostic manner.
	 *
	 * API routes in Ecopages are universally written using standard WinterCG `Request` and `Response` objects.
	 * This execution pipeline takes the raw `Request`, extracts its dynamic segments, runs our high-speed JSON schema
	 * validator against the body/query/headers, and triggers the developer's middleware chain sequentially.
	 *
	 * If the execution throws an error, it is gracefully caught, logged, and mutated into a standardized Http error payload,
	 * ensuring the consuming client receives a parsable response even upon internal catastrophic failure.
	 *
	 * @param request - The incoming Web standard `Request`.
	 * @param params - The extracted dynamic URL parameters (e.g., `{ id: '123' }`).
	 * @param routeConfig - The user-defined API handler object containing their business logic (`handler`) and `middleware`.
	 * @param serverInstance - Untyped reference to the underlying native server instance (BunServer/NodeServer) for potential escape hatches.
	 * @param errorHandler - Optional global error trap defined in project configuration.
	 * @returns The resulting Web standard `Response` constructed by the user's handler.
	 */
	protected async executeApiHandler(
		request: Request,
		params: Record<string, string | string[]>,
		routeConfig: ApiHandler,
		serverInstance: any,
		errorHandler?: ErrorHandler,
	): Promise<Response> {
		let context: ApiHandlerContext<Request, any> | undefined;

		try {
			const middleware = routeConfig.middleware || [];
			const schema = routeConfig.schema;
			const locals: Record<string, unknown> = {};

			const normalizedParams = Object.fromEntries(
				Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value.join('/') : value]),
			);

			context = {
				request,
				params: normalizedParams,
				response: new ApiResponseBuilder(),
				server: serverInstance,
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
						const contentType = request.headers.get('Content-Type') || '';
						if (contentType.includes('application/json')) body = await request.clone().json();
						else if (contentType.includes('text/plain')) body = await request.clone().text();
					} catch {
						return context.response.status(400).json({ error: 'Invalid request body' });
					}
				}

				const validationResult = await this.schemaValidator.validateRequest(
					{ body, query: queryParams, headers, params: normalizedParams },
					schema,
				);

				if (!validationResult.success) {
					return context.response.status(400).json({
						error: 'Validation failed',
						issues: validationResult.errors,
					});
				}

				const validated = validationResult.data!;
				if (validated.body !== undefined) context.body = validated.body;
				if (validated.query !== undefined) context.query = validated.query;
				if (validated.headers !== undefined) context.headers = validated.headers;
				if (validated.params !== undefined) context.params = validated.params as Record<string, string>;
			}

			if (middleware.length === 0) {
				return await routeConfig.handler(context);
			}

			let index = 0;
			const executeNext = async (): Promise<Response> => {
				if (index < middleware.length) {
					const currentMiddleware = middleware[index++];
					return await currentMiddleware(context!, executeNext);
				}
				return await routeConfig.handler(context!);
			};

			return await executeNext();
		} catch (error) {
			if (error instanceof Response) return error;

			if (errorHandler) {
				try {
					if (!context) {
						const locals: Record<string, unknown> = {};
						context = {
							request,
							params: Object.fromEntries(
								Object.entries(params).map(([key, value]) => [
									key,
									Array.isArray(value) ? value.join('/') : value,
								]),
							),
							response: new ApiResponseBuilder(),
							server: serverInstance,
							locals,
							require: createRequire((): Record<string, unknown> => locals),
							services: { cache: this.getCacheService() },
							...this.getRenderContext(),
						};
					}
					return await errorHandler(error, context);
				} catch (handlerError) {
					appLogger.error(`[ecopages] Error in custom error handler: ${handlerError}`);
				}
			}

			if (error instanceof HttpError) return error.toResponse();
			appLogger.error(`[ecopages] Error handling API request: ${error}`);
			return new Response('Internal Server Error', { status: 500 });
		}
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

	private getApiPathScore(pattern: string): number {
		const segments = this.normalizePath(pattern).split('/').filter(Boolean);
		let score = 0;
		for (const segment of segments) {
			if (segment === '*' || (segment.startsWith('[...') && segment.endsWith(']'))) {
				score += 10;
			} else if (segment.startsWith(':') || (segment.startsWith('[') && segment.endsWith(']'))) {
				score += 50;
			} else {
				score += 100;
			}
		}
		return score;
	}

	protected matchApiHandler(
		request: Request,
		apiHandlers: ApiHandler[],
	): { routeConfig: ApiHandler; params: Record<string, string | string[]> } | null {
		const pathname = new URL(request.url).pathname;
		const method = request.method.toUpperCase();

		const sortedHandlers = [...apiHandlers].sort((a, b) => {
			return this.getApiPathScore(b.path) - this.getApiPathScore(a.path);
		});

		for (const routeConfig of sortedHandlers) {
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

	/**
	 * Universally processes an incoming WinterCG Web standard Request.
	 *
	 * 1. Resolves static Hot Module Replacement runtime blobs if development.
	 * 2. Checks if the incoming request matches any parsed API route schemas.
	 *   - Routes through `executeApiHandler` which performs strict validation.
	 * 3. Falls through to standard `ServerRouteHandler` for React/Lit filesystem pages.
	 *
	 * Both Bun and Node bindings fall back to this exact function once they have mapped their
	 * native HTTP objects into Web Standard Requests.
	 */
	public async handleSharedRequest(
		request: Request,
		context: {
			apiHandlers: ApiHandler[];
			errorHandler?: ErrorHandler;
			serverInstance?: any;
			hmrManager?: any;
		},
	): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/_hmr_runtime.js' && context.hmrManager) {
			const runtimePath = context.hmrManager.getRuntimePath();
			if (fileSystem.exists(runtimePath)) {
				return new Response(fileSystem.readFileAsBuffer(runtimePath) as BodyInit, {
					headers: { 'Content-Type': 'application/javascript' },
				});
			}
		}

		if (url.pathname.startsWith('/assets/_hmr/') && context.hmrManager) {
			const relativePath = url.pathname.slice('/assets/_hmr/'.length);
			const assetPath = path.join(context.hmrManager.getDistDir(), relativePath);

			if (fileSystem.exists(assetPath)) {
				return new Response(fileSystem.readFileAsBuffer(assetPath) as BodyInit, {
					headers: { 'Content-Type': 'application/javascript' },
				});
			}
		}

		const apiMatch = this.matchApiHandler(request, context.apiHandlers);
		if (apiMatch) {
			return this.executeApiHandler(
				request,
				apiMatch.params,
				apiMatch.routeConfig,
				context.serverInstance,
				context.errorHandler,
			);
		}

		return this.routeHandler.handleResponse(request);
	}
}
