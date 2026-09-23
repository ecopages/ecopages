import path from 'node:path';
import { appLogger } from '../../../global/app-logger.ts';
import type { EcoPagesAppConfig, MatchResult } from '../../../types/internal-types.ts';
import type { StaticGenerationRendererResolver } from '../../../route-renderer/route-renderer.ts';
import type { RouteRegistry } from '../../../router/server/route-registry.ts';
import type { PageCacheService } from '../../../services/cache/page-cache-service.ts';
import type { CacheStrategy, RenderResult } from '../../../services/cache/cache.types.ts';
import type { EcoPageComponent } from '../../../eco/eco.types.ts';
import type { EcoPageFile } from '../../../types/public-types.ts';
import { PageRequestCacheCoordinator } from '../../../services/cache/page-request-cache-coordinator.service.ts';
import { getBrowserRuntimeAssetGeneration } from '../../../services/assets/browser-runtime-asset-generation.ts';
import { ServerUtils } from '../../../utils/server-utils.module.ts';
import type { FileRouteMiddleware, RequestLocals } from '../../../types/public-types.ts';
import { FileRouteMiddlewarePipeline } from './file-route-middleware-pipeline.ts';
import { classifyPageFailure, type PageFailureClassification } from '../../../errors/http-error-page-contract.ts';
import { isDevelopmentRuntime } from '../../../utils/runtime.ts';
import type { FileSystemServerResponseFactory } from './fs-server-response-factory.ts';
import type { ErrorPageLoaders } from '../../../types/public-types.ts';
import { ErrorPageRenderer, logErrorPageFailure } from '../../../services/error-pages/error-page-renderer.ts';

type FileRouteExecutionPlan = {
	cacheKey: string;
	request: Request;
	pageFilePath: string;
	pageModule: EcoPageFile;
	pageMiddleware: FileRouteMiddleware[];
	pageCacheStrategy: CacheStrategy;
	localsStore: RequestLocals;
	localsForRender: RequestLocals | undefined;
};

export interface FileSystemResponseMatcherOptions {
	appConfig: EcoPagesAppConfig;
	assetPrefix: string;
	router: RouteRegistry;
	routeRendererFactory: StaticGenerationRendererResolver;
	errorPageLoaders?: ErrorPageLoaders;
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
	private routeRendererFactory: StaticGenerationRendererResolver;
	private errorPageRenderer: ErrorPageRenderer;
	private fileSystemResponseFactory: FileSystemServerResponseFactory;
	private pageRequestCacheCoordinator: PageRequestCacheCoordinator;
	private fileRouteMiddlewarePipeline: FileRouteMiddlewarePipeline;

	constructor({
		appConfig,
		assetPrefix,
		router,
		routeRendererFactory,
		errorPageLoaders = {},
		fileSystemResponseFactory,
		cacheService = null,
		defaultCacheStrategy = 'static',
	}: FileSystemResponseMatcherOptions) {
		this.appConfig = appConfig;
		this.assetPrefix = assetPrefix;
		this.router = router;
		this.routeRendererFactory = routeRendererFactory;
		this.errorPageRenderer = new ErrorPageRenderer({
			appConfig,
			routeRendererFactory,
			errorPageLoaders,
		});
		this.fileSystemResponseFactory = fileSystemResponseFactory;
		this.pageRequestCacheCoordinator = new PageRequestCacheCoordinator(cacheService, defaultCacheStrategy, () =>
			getBrowserRuntimeAssetGeneration(this.appConfig),
		);
		this.fileRouteMiddlewarePipeline = new FileRouteMiddlewarePipeline(cacheService);
	}

	/**
	 * Resolves unmatched paths either as static asset requests or as the custom
	 * not-found page.
	 * @param requestUrl Incoming pathname.
	 * @returns Static file response or rendered 404 response.
	 */
	async handleNoMatch(requestUrl: string): Promise<Response> {
		const isStaticFileRequest = ServerUtils.hasKnownStaticExtension(requestUrl);

		if (!isStaticFileRequest) {
			return this.renderClientErrorResponseOrServerError(
				requestUrl,
				{ status: 404, kind: 'notFound', logAsServerError: false },
				undefined,
			);
		}

		const relativeUrl = requestUrl.startsWith('/') ? requestUrl.slice(1) : requestUrl;
		const filePath = path.join(this.assetPrefix, relativeUrl);
		const contentType = ServerUtils.getContentType(filePath);

		const response = await this.fileSystemResponseFactory.createFileResponse(filePath, contentType);
		return (
			response ??
			this.renderClientErrorResponseOrServerError(
				requestUrl,
				{ status: 404, kind: 'notFound', logAsServerError: false },
				undefined,
			)
		);
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
					pageModule: executionPlan.pageModule,
					params: match.params,
					query: match.query,
					locals: executionPlan.localsForRender,
				});
				const html = await this.pageRequestCacheCoordinator.bodyToString(result.body);
				const strategy = result.cacheStrategy ?? this.pageRequestCacheCoordinator.getDefaultCacheStrategy();
				return {
					html,
					strategy,
					sourceDependencyPaths: result.sourceDependencyPaths,
				};
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
			return await this.renderPageFailure(match.requestedPathname, error);
		}
	}

	/**
	 * Translates a page-pipeline failure into an HTML response whose status matches
	 * the thrown `HttpError`, or 500 for generic failures.
	 *
	 * @remarks
	 * Explicit static routes and filesystem pages share this so client `HttpError`
	 * statuses cannot be collapsed into a server error.
	 */
	async renderServerError(pathname: string, error: unknown): Promise<Response> {
		return this.renderPageFailure(pathname, error);
	}

	private async renderPageFailure(pathname: string, error: unknown): Promise<Response> {
		if (error instanceof Response) {
			return error;
		}
		const classification = classifyPageFailure(error);
		if (classification.status >= 500) {
			return await this.createServerErrorResponse(pathname, classification, error);
		}
		return await this.renderClientErrorResponseOrServerError(pathname, classification, error);
	}

	private async renderClientErrorResponseOrServerError(
		pathname: string,
		classification: PageFailureClassification,
		error: unknown,
	): Promise<Response> {
		try {
			return await this.renderErrorResponse(classification, error);
		} catch (pageError) {
			if (pageError instanceof Response) {
				return pageError;
			}
			return await this.createServerErrorResponse(
				pathname,
				{ status: 500, kind: 'serverError', logAsServerError: true },
				pageError,
			);
		}
	}

	private async renderErrorResponse(classification: PageFailureClassification, error?: unknown): Promise<Response> {
		const result = await this.errorPageRenderer.render({
			kind: classification.kind,
			status: classification.status,
			error,
		});
		return await this.fileSystemResponseFactory.createHtmlErrorResponse(classification.status, result.body);
	}

	/**
	 * Logs a server failure, then renders the server-error page with the classified status.
	 *
	 * @remarks
	 * Non-factory 5xx statuses reuse the server-error page without being rewritten to 500.
	 * A failure while rendering that page falls back to the built-in document at the same
	 * status and never re-enters the custom page path. In development the thrown error's
	 * `message` and `stack` are passed into the page props.
	 */
	private async createServerErrorResponse(
		pathname: string,
		classification: PageFailureClassification,
		error: unknown,
	): Promise<Response> {
		const message = error instanceof Error ? error.message : 'Internal Server Error';
		if (isDevelopmentRuntime() || appLogger.isDebugEnabled()) {
			appLogger.error(`[FileSystemResponseMatcher] ${message} at ${pathname}`, error);
		} else {
			appLogger.error(`[FileSystemResponseMatcher] Render error at ${pathname}`, error);
		}

		try {
			return await this.renderErrorResponse(classification, error);
		} catch (serverErrorPageError) {
			if (serverErrorPageError instanceof Response) {
				return serverErrorPageError;
			}
			logErrorPageFailure(classification.kind ?? 'serverError', serverErrorPageError);
			const result = this.errorPageRenderer.renderBuiltIn({
				kind: classification.kind ?? 'serverError',
				status: classification.status,
				error,
			});
			return this.fileSystemResponseFactory.createHtmlErrorResponse(classification.status, result.body);
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
		const pageComponent = pageModule.default as EcoPageComponent<unknown>;
		const pageMiddleware = pageComponent.middleware ?? [];
		const pageCacheStrategy =
			pageModule.cache ?? pageComponent.cache ?? this.pageRequestCacheCoordinator.getDefaultCacheStrategy();

		return {
			cacheKey,
			request: resolvedRequest,
			pageFilePath,
			pageModule,
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
	private async importPageModule(filePath: string): Promise<EcoPageFile> {
		const routeRenderer = this.routeRendererFactory.getPageRenderer(filePath);
		return routeRenderer.loadPageModule(filePath);
	}

	/**
	 * Get the underlying cache service for external invalidation.
	 */
	getCacheService(): PageCacheService | null {
		return this.pageRequestCacheCoordinator.getCacheService();
	}
}
