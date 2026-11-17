import type { FileRouteMiddlewareContext } from '../../../types/contracts.ts';
import type { PageCacheService } from '../../../page-cache/page-cache-service.ts';
import { ApiResponseBuilder } from './api-response.ts';
import { runMiddlewareChain, type MiddlewareHandler } from './run-middleware-chain.ts';
import { LocalsAccessError } from '../../../errors/locals-access-error.ts';

export const FILE_ROUTE_MIDDLEWARE_PIPELINE_ERRORS = {
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
	private cacheService: PageCacheService | null;

	constructor(cacheService: PageCacheService | null) {
		this.cacheService = cacheService;
	}

	/**
	 * Enforces the current middleware contract for file-routed pages.
	 *
	 * Middleware depends on request-scoped locals and therefore must not run when
	 * the page is treated as statically cacheable. The Page itself must declare
	 * `cache: 'dynamic'`: an app default of `'dynamic'` does not give its `props`
	 * hook or layout factories the request.
	 *
	 * @throws LocalsAccessError When middleware is configured for a Page that is not a Dynamic Page.
	 */
	assertValidConfiguration(input: {
		middleware: readonly MiddlewareHandler<FileRouteMiddlewareContext>[];
		isDynamicPage: boolean;
		filePath: string;
	}): void {
		if (input.middleware.length > 0 && !input.isDynamicPage) {
			throw new LocalsAccessError(
				FILE_ROUTE_MIDDLEWARE_PIPELINE_ERRORS.middlewareRequiresDynamic(input.filePath),
			);
		}
	}

	/**
	 * Creates the request-scoped middleware context used by page middleware.
	 *
	 * The context intentionally omits `render()` and `renderPartial()` because
	 * rendering is owned by the page route pipeline, not by middleware stages.
	 *
	 * @param input Request details and the mutable locals store.
	 * @returns Middleware execution context.
	 */
	createContext(input: {
		request: Request;
		params: Record<string, string>;
		locals: Record<string, unknown>;
	}): FileRouteMiddlewareContext {
		const context: FileRouteMiddlewareContext = {
			request: input.request,
			params: input.params,
			response: new ApiResponseBuilder(),
			server: null,
			services: {
				cache: this.cacheService,
			},
			locals: input.locals,
			json: (data, options) => {
				if (options?.status) context.response.status(options.status);
				if (options?.headers) context.response.headers(options.headers);
				return context.response.json(data);
			},
			html: (content, options) => {
				if (options?.status) context.response.status(options.status);
				if (options?.headers) context.response.headers(options.headers);
				return context.response.html(content);
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
		middleware: readonly MiddlewareHandler<FileRouteMiddlewareContext>[];
		context: FileRouteMiddlewareContext;
		renderResponse: () => Promise<Response>;
	}): Promise<Response> {
		return runMiddlewareChain(input.middleware, input.context, input.renderResponse);
	}
}
