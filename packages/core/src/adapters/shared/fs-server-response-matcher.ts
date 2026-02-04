import path from 'node:path';
import { appLogger } from '../../global/app-logger.ts';
import { createRequire } from '../../utils/locals-utils.ts';
import type { MatchResult } from '../../internal-types.ts';
import type { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import type { FSRouter } from '../../router/fs-router.ts';
import { getCacheControlHeader, type PageCacheService } from '../../services/cache/page-cache-service.ts';
import type { CacheStrategy, RenderResult } from '../../services/cache/cache.types.ts';
import { ServerUtils } from '../../utils/server-utils.module.ts';
import type { ApiHandlerContext, Middleware, RequestLocals } from '../../public-types.ts';
import { ApiResponseBuilder } from './api-response.js';
import { LocalsAccessError } from '../../errors/locals-access-error.ts';
import type { FileSystemServerResponseFactory } from './fs-server-response-factory.ts';

export interface FileSystemResponseMatcherOptions {
	router: FSRouter;
	routeRendererFactory: RouteRendererFactory;
	fileSystemResponseFactory: FileSystemServerResponseFactory;
	/** Optional cache service. When null, caching is disabled. */
	cacheService?: PageCacheService | null;
	/** Default cache strategy when caching is enabled. @default 'static' */
	defaultCacheStrategy?: CacheStrategy;
}

export class FileSystemResponseMatcher {
	private router: FSRouter;
	private routeRendererFactory: RouteRendererFactory;
	private fileSystemResponseFactory: FileSystemServerResponseFactory;
	private cacheService: PageCacheService | null;
	private defaultCacheStrategy: CacheStrategy;

	constructor({
		router,
		routeRendererFactory,
		fileSystemResponseFactory,
		cacheService = null,
		defaultCacheStrategy = 'static',
	}: FileSystemResponseMatcherOptions) {
		this.router = router;
		this.routeRendererFactory = routeRendererFactory;
		this.fileSystemResponseFactory = fileSystemResponseFactory;
		this.cacheService = cacheService;
		this.defaultCacheStrategy = defaultCacheStrategy;
	}

	async handleNoMatch(requestUrl: string): Promise<Response> {
		const isStaticFileRequest = ServerUtils.hasKnownExtension(requestUrl);

		if (!isStaticFileRequest) {
			return this.fileSystemResponseFactory.createCustomNotFoundResponse();
		}

		const relativeUrl = requestUrl.startsWith('/') ? requestUrl.slice(1) : requestUrl;
		const filePath = path.join(this.router.assetPrefix, relativeUrl);
		const contentType = ServerUtils.getContentType(filePath);

		return this.fileSystemResponseFactory.createFileResponse(filePath, contentType);
	}

	/**
	 * Build the full cache key from match result.
	 * Includes pathname and query string for proper cache isolation.
	 */
	private buildCacheKey(match: MatchResult): string {
		let key = match.pathname;
		if (match.query && Object.keys(match.query).length > 0) {
			const queryString = new URLSearchParams(match.query).toString();
			key += `?${queryString}`;
		}
		return key;
	}

	async handleMatch(match: MatchResult, request?: Request): Promise<Response> {
		const cacheKey = this.buildCacheKey(match);

		/**
		 * Convert body (which may be Buffer, ReadableStream, etc.) to string for caching.
		 */
		const bodyToString = async (body: unknown): Promise<string> => {
			if (typeof body === 'string') {
				return body;
			}
			if (Buffer.isBuffer(body)) {
				return body.toString('utf-8');
			}
			if (body instanceof ReadableStream) {
				return new Response(body).text();
			}
			if (body instanceof Uint8Array) {
				return new TextDecoder().decode(body);
			}
			return String(body);
		};

		try {
			const resolvedRequest =
				request ??
				new Request(new URL(cacheKey, this.router.origin).toString(), {
					method: 'GET',
				});

			const localsStore: RequestLocals = {};
			const pageModule = await import(match.filePath);
			const Page = (pageModule as any)?.default;
			const pageMiddleware = (Page?.middleware ?? []) as Middleware[];
			const pageCacheStrategy = (Page?.cache as CacheStrategy | undefined) ?? this.defaultCacheStrategy;
			const localsForRender: RequestLocals | undefined =
				pageCacheStrategy === 'dynamic' ? localsStore : undefined;

			if (pageMiddleware.length > 0 && pageCacheStrategy !== 'dynamic') {
				throw new LocalsAccessError(
					`[ecopages] Page middleware requires cache: 'dynamic'. Page: ${match.filePath}`,
				);
			}

			const routeRenderer = this.routeRendererFactory.createRenderer(match.filePath);

			const middlewareContext: ApiHandlerContext = {
				request: resolvedRequest,
				response: new ApiResponseBuilder(),
				server: null,
				services: {
					cache: this.cacheService,
				},
				locals: localsStore,
				require: createRequire(() => middlewareContext.locals as unknown as Record<string, unknown>),
				render: async () => {
					throw new Error('[ecopages] ctx.render is not available in file-route middleware');
				},
				renderPartial: async () => {
					throw new Error('[ecopages] ctx.renderPartial is not available in file-route middleware');
				},
				json: (data, options) => {
					const builder = new ApiResponseBuilder();
					if (options?.status) builder.status(options.status);
					if (options?.headers) builder.headers(options.headers);
					return builder.json(data);
				},
				html: (content, options) => {
					const builder = new ApiResponseBuilder();
					if (options?.status) builder.status(options.status);
					if (options?.headers) builder.headers(options.headers);
					return builder.html(content);
				},
			};

			const renderFn = async (): Promise<RenderResult> => {
				const result = await routeRenderer.createRoute({
					file: match.filePath,
					params: match.params,
					query: match.query,
					locals: localsForRender,
				});
				const html = await bodyToString(result.body);
				const strategy = result.cacheStrategy ?? this.defaultCacheStrategy;
				return { html, strategy };
			};

			/**
			 * Handles the rendering response with appropriate caching behavior.
			 *
			 * Pages with `cache: 'dynamic'` bypass the cache entirely to ensure:
			 * - Middleware runs on every request
			 * - Locals modifications are always reflected in the response
			 * - No stale cached responses with outdated request-specific data
			 *
			 * Pages with `cache: 'static'` use the cache service normally.
			 */
			const renderResponse = async (): Promise<Response> => {
				if (!this.cacheService || pageCacheStrategy === 'dynamic') {
					const { html, strategy } = await renderFn();
					return this.createCachedResponse(html, strategy, 'disabled');
				}

				const result = await this.cacheService.getOrCreate(cacheKey, pageCacheStrategy, renderFn);
				return this.createCachedResponse(result.html, result.strategy, result.status);
			};

			if (pageMiddleware.length === 0) {
				return await renderResponse();
			}

			let index = 0;
			const executeNext = async (): Promise<Response> => {
				if (index < pageMiddleware.length) {
					const current = pageMiddleware[index++];
					return await current(middlewareContext, executeNext);
				}
				return await renderResponse();
			};

			return await executeNext();
		} catch (error) {
			if (error instanceof Response) {
				return error;
			}
			if (error instanceof LocalsAccessError) {
				return new Response(error.message, {
					status: 500,
					headers: { 'Content-Type': 'text/plain; charset=utf-8' },
				});
			}
			if (error instanceof Error) {
				if (import.meta.env.NODE_ENV === 'development' || appLogger.isDebugEnabled()) {
					appLogger.error(`[FileSystemResponseMatcher] ${error.message} at ${match.pathname}`);
				}
			}
			return this.fileSystemResponseFactory.createCustomNotFoundResponse();
		}
	}

	/**
	 * Create a response with appropriate cache headers.
	 */
	private createCachedResponse(
		html: string,
		strategy: CacheStrategy,
		cacheStatus: 'hit' | 'miss' | 'stale' | 'expired' | 'disabled',
	): Response {
		const headers: HeadersInit = {
			'Content-Type': 'text/html',
			'Cache-Control': getCacheControlHeader(cacheStatus === 'disabled' ? 'disabled' : strategy),
			'X-Cache': cacheStatus.toUpperCase(),
		};

		return new Response(html, { headers });
	}

	/**
	 * Get the underlying cache service for external invalidation.
	 */
	getCacheService(): PageCacheService | null {
		return this.cacheService;
	}
}
