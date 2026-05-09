import path from 'node:path';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig, MatchResult } from '../../types/internal-types.ts';
import type { PageRendererResolver } from '../../route-renderer/route-renderer.ts';
import type { RouteRegistry } from '../../router/server/route-registry.ts';
import type { PageCacheService } from '../../services/cache/page-cache-service.ts';
import type { CacheStrategy, RenderResult } from '../../services/cache/cache.types.ts';
import { PageRequestCacheCoordinator } from '../../services/cache/page-request-cache-coordinator.service.ts';
import { ServerUtils } from '../../utils/server-utils.module.ts';
import type { FileRouteMiddleware, RequestLocals } from '../../types/public-types.ts';
import { FileRouteMiddlewarePipeline } from './file-route-middleware-pipeline.ts';
import { LocalsAccessError } from '../../errors/locals-access-error.ts';
import { isDevelopmentRuntime } from '../../utils/runtime.ts';
import type { FileSystemServerResponseFactory } from './fs-server-response-factory.ts';

type FileRouteExecutionPlan = {
	cacheKey: string;
	request: Request;
	pageFilePath: string;
	pageMiddleware: FileRouteMiddleware[];
	pageCacheStrategy: CacheStrategy;
	localsStore: RequestLocals;
	localsForRender: RequestLocals | undefined;
};

export interface FileSystemResponseMatcherOptions {
	appConfig: EcoPagesAppConfig;
	assetPrefix: string;
	router: RouteRegistry;
	routeRendererFactory: PageRendererResolver;
	fileSystemResponseFactory: FileSystemServerResponseFactory;
	/** Optional cache service. When null, caching is disabled. */
	cacheService?: PageCacheService | null;
	/** Default cache strategy when caching is enabled. @default 'static' */
	defaultCacheStrategy?: CacheStrategy;
}

/**
 * Matches file-system routes to rendered HTML responses.
 *
 * This render pipeline coordinates page module inspection, request-local policy,
 * renderer invocation, middleware execution, cache integration, and fallback
 * error translation.
 */
export class FileSystemResponseMatcher {
	private appConfig: EcoPagesAppConfig;
	private assetPrefix: string;
	private router: RouteRegistry;
	private routeRendererFactory: PageRendererResolver;
	private fileSystemResponseFactory: FileSystemServerResponseFactory;
	private pageRequestCacheCoordinator: PageRequestCacheCoordinator;
	private fileRouteMiddlewarePipeline: FileRouteMiddlewarePipeline;

	constructor({
		appConfig,
		assetPrefix,
		router,
		routeRendererFactory,
		fileSystemResponseFactory,
		cacheService = null,
		defaultCacheStrategy = 'static',
	}: FileSystemResponseMatcherOptions) {
		this.appConfig = appConfig;
		this.assetPrefix = assetPrefix;
		this.router = router;
		this.routeRendererFactory = routeRendererFactory;
		this.fileSystemResponseFactory = fileSystemResponseFactory;
		this.pageRequestCacheCoordinator = new PageRequestCacheCoordinator(cacheService, defaultCacheStrategy);
		this.fileRouteMiddlewarePipeline = new FileRouteMiddlewarePipeline(cacheService);
	}

	/**
	 * Resolves unmatched paths either as static asset requests or as the custom
	 * not-found page.
	 * @param requestUrl Incoming pathname.
	 * @returns Static file response or rendered 404 response.
	 */
	async handleNoMatch(requestUrl: string): Promise<Response> {
		const isStaticFileRequest = ServerUtils.hasKnownExtension(requestUrl);

		if (!isStaticFileRequest) {
			return this.renderCustomNotFoundResponse();
		}

		const relativeUrl = requestUrl.startsWith('/') ? requestUrl.slice(1) : requestUrl;
		const filePath = path.join(this.assetPrefix, relativeUrl);
		const contentType = ServerUtils.getContentType(filePath);

		const response = await this.fileSystemResponseFactory.createFileResponse(filePath, contentType);
		return response ?? this.renderCustomNotFoundResponse();
	}

	/**
	 * Handles a matched file-system page route.
	 *
	 * The method inspects page metadata needed for request-time execution,
	 * prepares the renderer invocation, validates middleware/cache constraints,
	 * and delegates caching plus middleware execution to dedicated collaborators.
	 *
	 * @param match Router match result.
	 * @param request Optional incoming request. A synthetic GET request is created when omitted.
	 * @returns Final response for the matched route.
	 */
	async handleMatch(match: MatchResult, request?: Request): Promise<Response> {
		try {
			const executionPlan = await this.createExecutionPlan(match, request);

			this.fileRouteMiddlewarePipeline.assertValidConfiguration({
				middleware: executionPlan.pageMiddleware,
				pageCacheStrategy: executionPlan.pageCacheStrategy,
				filePath: executionPlan.pageFilePath,
			});

			const routeRenderer = this.routeRendererFactory.getPageRenderer(executionPlan.pageFilePath);
			const middlewareContext = this.fileRouteMiddlewarePipeline.createContext({
				request: executionPlan.request,
				params: match.params as Record<string, string>,
				locals: executionPlan.localsStore,
			});

			const renderFn = async (): Promise<RenderResult> => {
				const result = await routeRenderer.execute({
					file: executionPlan.pageFilePath,
					params: match.params,
					query: match.query,
					locals: executionPlan.localsForRender,
				});
				const html = await this.pageRequestCacheCoordinator.bodyToString(result.body);
				const strategy = result.cacheStrategy ?? this.pageRequestCacheCoordinator.getDefaultCacheStrategy();
				return { html, strategy };
			};
			const renderResponse = async (): Promise<Response> => {
				return this.pageRequestCacheCoordinator.render({
					cacheKey: executionPlan.cacheKey,
					pageCacheStrategy: executionPlan.pageCacheStrategy,
					renderFn,
				});
			};

			return await this.fileRouteMiddlewarePipeline.run({
				middleware: executionPlan.pageMiddleware,
				context: middlewareContext,
				renderResponse,
			});
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
				if (isDevelopmentRuntime() || appLogger.isDebugEnabled()) {
					appLogger.error(`[FileSystemResponseMatcher] ${error.message} at ${match.requestedPathname}`);
				}
			}
			return this.renderCustomNotFoundResponse();
		}
	}

	/**
	 * Renders the app-owned custom 404 page, falling back to the default text 404
	 * when the page template cannot be resolved.
	 */
	private async renderCustomNotFoundResponse(): Promise<Response> {
		const error404TemplatePath = this.appConfig.absolutePaths.error404TemplatePath;

		try {
			const routeRenderer = this.routeRendererFactory.getPageRenderer(error404TemplatePath);
			const result = await routeRenderer.execute({
				file: error404TemplatePath,
			});

			return this.fileSystemResponseFactory.createHtmlNotFoundResponse(result.body);
		} catch {
			appLogger.debug(
				'Custom 404 template not found, falling back to default 404 response',
				error404TemplatePath,
			);
			return this.fileSystemResponseFactory.createDefaultNotFoundResponse();
		}
	}

	private async createExecutionPlan(match: MatchResult, request?: Request): Promise<FileRouteExecutionPlan> {
		const cacheKey = this.pageRequestCacheCoordinator.buildCacheKey({
			pathname: match.requestedPathname,
			query: match.query,
		});
		const resolvedRequest =
			request ??
			new Request(new URL(cacheKey, this.router.origin).toString(), {
				method: 'GET',
			});
		const localsStore: RequestLocals = {};
		const pageFilePath = match.templateRoute.filePath;
		const pageModule = await this.importPageModule(pageFilePath);
		const Page = (pageModule as any)?.default;
		const pageMiddleware = (Page?.middleware ?? []) as FileRouteMiddleware[];
		const pageCacheStrategy =
			(Page?.cache as CacheStrategy | undefined) ?? this.pageRequestCacheCoordinator.getDefaultCacheStrategy();

		return {
			cacheKey,
			request: resolvedRequest,
			pageFilePath,
			pageMiddleware,
			pageCacheStrategy,
			localsStore,
			localsForRender: pageCacheStrategy === 'dynamic' ? localsStore : undefined,
		};
	}

	/**
	 * Loads the matched page module for request-time inspection.
	 *
	 * The matcher needs access to page-level metadata such as `cache` and
	 * `middleware` before full rendering starts, so it asks the owning route
	 * renderer to load the page module. That preserves integration-specific page
	 * import setup for request-time inspection as well as for full rendering.
	 *
	 * @param filePath Absolute page module path.
	 * @returns Imported page module.
	 */
	private async importPageModule(filePath: string): Promise<unknown> {
		const routeRenderer = this.routeRendererFactory.getPageRenderer(filePath);
		return routeRenderer.loadPageModule(filePath, {
			cacheScope: 'request-metadata',
		});
	}

	/**
	 * Get the underlying cache service for external invalidation.
	 */
	getCacheService(): PageCacheService | null {
		return this.pageRequestCacheCoordinator.getCacheService();
	}
}
