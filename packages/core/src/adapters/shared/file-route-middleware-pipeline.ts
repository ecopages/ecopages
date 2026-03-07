import { createRequire } from '../../utils/locals-utils.ts';
import type { Middleware, ApiHandlerContext, RequestLocals } from '../../public-types.ts';
import type { PageCacheService } from '../../services/cache/page-cache-service.ts';
import { ApiResponseBuilder } from './api-response.js';
import { LocalsAccessError } from '../../errors/locals-access-error.ts';

export const FILE_ROUTE_MIDDLEWARE_PIPELINE_ERRORS = {
	CTX_RENDER_UNAVAILABLE: '[ecopages] ctx.render is not available in file-route middleware',
	CTX_RENDER_PARTIAL_UNAVAILABLE: '[ecopages] ctx.renderPartial is not available in file-route middleware',
	middlewareRequiresDynamic: (filePath: string) =>
		`[ecopages] Page middleware requires cache: 'dynamic'. Page: ${filePath}`,
} as const;

/**
 * Executes middleware for file-based page routes.
 *
 * This pipeline owns the middleware-specific rules that are distinct from route
 * matching and rendering, including request-local storage, the middleware
 * execution context, and the invariant that page middleware only runs for
 * request-time dynamic rendering.
 */
export class FileRouteMiddlewarePipeline {
	constructor(private cacheService: PageCacheService | null) {}

	/**
	 * Enforces the current middleware contract for file-routed pages.
	 *
	 * Middleware depends on request-scoped locals and therefore must not run when
	 * the page is treated as statically cacheable.
	 *
	 * @param input Middleware list, effective cache strategy, and page path.
	 * @throws LocalsAccessError When middleware is configured for a non-dynamic page.
	 */
	assertValidConfiguration(input: {
		middleware: Middleware[];
		pageCacheStrategy: 'static' | 'dynamic' | { revalidate: number; tags?: string[] };
		filePath: string;
	}): void {
		if (input.middleware.length > 0 && input.pageCacheStrategy !== 'dynamic') {
			throw new LocalsAccessError(
				FILE_ROUTE_MIDDLEWARE_PIPELINE_ERRORS.middlewareRequiresDynamic(input.filePath),
			);
		}
	}

	/**
	 * Creates the request-scoped middleware context used by page middleware.
	 *
	 * The context intentionally disables `render()` and `renderPartial()` inside
	 * file-route middleware because rendering is owned by the page route pipeline,
	 * not by middleware stages.
	 *
	 * @param input Request details and the mutable locals store.
	 * @returns Middleware execution context.
	 */
	createContext(input: {
		request: Request;
		params: Record<string, string>;
		locals: RequestLocals;
	}): ApiHandlerContext {
		const context: ApiHandlerContext = {
			request: input.request,
			params: input.params,
			response: new ApiResponseBuilder(),
			server: null,
			services: {
				cache: this.cacheService,
			},
			locals: input.locals,
			require: createRequire(() => context.locals as unknown as Record<string, unknown>),
			render: async () => {
				throw new Error(FILE_ROUTE_MIDDLEWARE_PIPELINE_ERRORS.CTX_RENDER_UNAVAILABLE);
			},
			renderPartial: async () => {
				throw new Error(FILE_ROUTE_MIDDLEWARE_PIPELINE_ERRORS.CTX_RENDER_PARTIAL_UNAVAILABLE);
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

		return context;
	}

	/**
	 * Runs the middleware chain and eventually delegates to the render callback.
	 *
	 * Middleware may short-circuit by returning a response directly. If the chain
	 * completes, the supplied `renderResponse` callback is executed exactly once.
	 *
	 * @param input Middleware context, chain, and terminal render callback.
	 * @returns Response from middleware or final render stage.
	 */
	async run(input: {
		middleware: Middleware[];
		context: ApiHandlerContext;
		renderResponse: () => Promise<Response>;
	}): Promise<Response> {
		if (input.middleware.length === 0) {
			return input.renderResponse();
		}

		let index = 0;
		const executeNext = async (): Promise<Response> => {
			if (index < input.middleware.length) {
				const current = input.middleware[index++];
				return current(input.context, executeNext);
			}
			return input.renderResponse();
		};

		return executeNext();
	}
}
