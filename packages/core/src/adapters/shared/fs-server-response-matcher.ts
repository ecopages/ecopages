import path from 'node:path';
import { appLogger } from '../../global/app-logger.ts';
import type { MatchResult } from '../../internal-types.ts';
import type { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import type { FSRouter } from '../../router/fs-router.ts';
import { getCacheControlHeader, type PageCacheService } from '../../services/cache/page-cache-service.ts';
import type { CacheStrategy } from '../../services/cache/cache.types.ts';
import { ServerUtils } from '../../utils/server-utils.module.ts';
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
		const filePath = path.join(this.router.assetPrefix, requestUrl);
		const contentType = ServerUtils.getContentType(filePath);

		if (this.fileSystemResponseFactory.isHtmlOrPlainText(contentType)) {
			return this.fileSystemResponseFactory.createCustomNotFoundResponse();
		}

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

	async handleMatch(match: MatchResult): Promise<Response> {
		const cacheKey = this.buildCacheKey(match);

		const renderFn = async (): Promise<string> => {
			const routeRenderer = this.routeRendererFactory.createRenderer(match.filePath);
			const renderedBody = await routeRenderer.createRoute({
				file: match.filePath,
				params: match.params,
				query: match.query,
			});

			if (typeof renderedBody === 'string') {
				return renderedBody;
			}
			if (Buffer.isBuffer(renderedBody)) {
				return renderedBody.toString('utf-8');
			}
			if (renderedBody instanceof ReadableStream) {
				return new Response(renderedBody).text();
			}
			if (renderedBody instanceof Uint8Array) {
				return new TextDecoder().decode(renderedBody);
			}
			return String(renderedBody);
		};

		try {
			if (!this.cacheService) {
				const html = await renderFn();
				return this.createCachedResponse(html, 'dynamic', 'disabled');
			}

			const result = await this.cacheService.getOrCreate(cacheKey, this.defaultCacheStrategy, renderFn);

			return this.createCachedResponse(result.html, this.defaultCacheStrategy, result.status);
		} catch (error) {
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
			'Cache-Control': getCacheControlHeader(strategy),
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
