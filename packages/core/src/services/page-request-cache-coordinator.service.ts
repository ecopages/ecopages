import { getCacheControlHeader, type PageCacheService } from './cache/page-cache-service.ts';
import type { CacheStrategy, RenderResult } from './cache/cache.types.ts';

type CacheStatus = 'hit' | 'miss' | 'stale' | 'expired' | 'disabled';

/**
 * Coordinates request-time page caching concerns around one render invocation.
 *
 * This service keeps `FileSystemResponseMatcher` from owning low-level cache
 * policy mechanics such as cache key construction, `dynamic` bypass behavior,
 * body normalization for cache storage, and final cache header generation.
 */
export class PageRequestCacheCoordinator {
	private cacheService: PageCacheService | null;
	private defaultCacheStrategy: CacheStrategy;

	constructor(
		cacheService: PageCacheService | null,
		defaultCacheStrategy: CacheStrategy,
	) {
		this.cacheService = cacheService;
		this.defaultCacheStrategy = defaultCacheStrategy;
	}

	/**
	 * Builds the cache key used for page lookups.
	 *
	 * Query parameters are part of the key so two requests that hit the same
	 * pathname but differ by search params do not share the same rendered entry.
	 *
	 * @param input Pathname plus optional query record.
	 * @returns Stable cache key for the request.
	 */
	buildCacheKey(input: { pathname: string; query?: Record<string, string> }): string {
		let key = input.pathname;
		if (input.query && Object.keys(input.query).length > 0) {
			const queryString = new URLSearchParams(input.query).toString();
			key += `?${queryString}`;
		}
		return key;
	}

	/**
	 * Resolves a render request through the configured cache policy.
	 *
	 * Pages using `dynamic` rendering, or applications without a cache service,
	 * bypass cache lookup entirely and still receive the same response header
	 * contract as cached pages.
	 *
	 * @param options Cache coordination inputs for one page request.
	 * @returns HTTP response with cache headers applied.
	 */
	async render(options: {
		cacheKey: string;
		pageCacheStrategy: CacheStrategy;
		renderFn: () => Promise<RenderResult>;
	}): Promise<Response> {
		if (!this.cacheService || options.pageCacheStrategy === 'dynamic') {
			const { html, strategy } = await options.renderFn();
			return this.createCachedResponse(html, strategy, 'disabled');
		}

		const result = await this.cacheService.getOrCreate(
			options.cacheKey,
			options.pageCacheStrategy,
			options.renderFn,
		);

		return this.createCachedResponse(result.html, result.strategy, result.status);
	}

	/**
	 * Exposes the underlying cache service for invalidation and adapter plumbing.
	 *
	 * @returns Configured cache service or `null` when caching is disabled.
	 */
	getCacheService(): PageCacheService | null {
		return this.cacheService;
	}

	/**
	 * Returns the default render strategy used when a page does not declare one.
	 *
	 * @returns Application-level fallback cache strategy.
	 */
	getDefaultCacheStrategy(): CacheStrategy {
		return this.defaultCacheStrategy;
	}

	/**
	 * Normalizes various route render body shapes into a cacheable string.
	 *
	 * Page rendering may produce strings, buffers, byte arrays, or streams. The
	 * matcher needs a single representation before passing HTML through the cache
	 * layer, so this method centralizes the conversion rules.
	 *
	 * @param body Render output body in any supported form.
	 * @returns HTML string representation.
	 */
	async bodyToString(body: unknown): Promise<string> {
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
	}

	/**
	 * Creates the final HTML response with the current cache semantics encoded in
	 * response headers.
	 *
	 * @param html Rendered page HTML.
	 * @param strategy Effective cache strategy for the response.
	 * @param cacheStatus Status used for `X-Cache` and `Cache-Control` generation.
	 * @returns HTTP response ready to send to the client.
	 */
	private createCachedResponse(html: string, strategy: CacheStrategy, cacheStatus: CacheStatus): Response {
		const headers: HeadersInit = {
			'Content-Type': 'text/html',
			'Cache-Control': getCacheControlHeader(cacheStatus === 'disabled' ? 'disabled' : strategy),
			'X-Cache': cacheStatus.toUpperCase(),
		};

		return new Response(html, { headers });
	}
}
