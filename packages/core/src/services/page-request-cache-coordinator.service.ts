import { getCacheControlHeader, type PageCacheService } from './cache/page-cache-service.ts';
import type { CacheStrategy, RenderResult } from './cache/cache.types.ts';

type CacheStatus = 'hit' | 'miss' | 'stale' | 'expired' | 'disabled';

export class PageRequestCacheCoordinator {
	constructor(
		private cacheService: PageCacheService | null,
		private defaultCacheStrategy: CacheStrategy,
	) {}

	buildCacheKey(input: { pathname: string; query?: Record<string, string> }): string {
		let key = input.pathname;
		if (input.query && Object.keys(input.query).length > 0) {
			const queryString = new URLSearchParams(input.query).toString();
			key += `?${queryString}`;
		}
		return key;
	}

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

	getCacheService(): PageCacheService | null {
		return this.cacheService;
	}

	getDefaultCacheStrategy(): CacheStrategy {
		return this.defaultCacheStrategy;
	}

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

	private createCachedResponse(html: string, strategy: CacheStrategy, cacheStatus: CacheStatus): Response {
		const headers: HeadersInit = {
			'Content-Type': 'text/html',
			'Cache-Control': getCacheControlHeader(cacheStatus === 'disabled' ? 'disabled' : strategy),
			'X-Cache': cacheStatus.toUpperCase(),
		};

		return new Response(html, { headers });
	}
}