import path from 'node:path';
import { getAppBuildExecutor } from '../../build/build-adapter.ts';
import { createNodeBootstrapPlugin } from '../node/bootstrap-dependency-resolver.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig, MatchResult } from '../../internal-types.ts';
import type { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import type { FSRouter } from '../../router/fs-router.ts';
import type { PageCacheService } from '../../services/cache/page-cache-service.ts';
import type { CacheStrategy, RenderResult } from '../../services/cache/cache.types.ts';
import { PageRequestCacheCoordinator } from '../../services/page-request-cache-coordinator.service.ts';
import { DevelopmentInvalidationService } from '../../services/development-invalidation.service.ts';
import { ServerModuleTranspiler } from '../../services/server-module-transpiler.service.ts';
import { resolveInternalExecutionDir } from '../../utils/resolve-work-dir.ts';
import { ServerUtils } from '../../utils/server-utils.module.ts';
import type { Middleware, RequestLocals } from '../../public-types.ts';
import { FileRouteMiddlewarePipeline } from './file-route-middleware-pipeline.ts';
import { LocalsAccessError } from '../../errors/locals-access-error.ts';
import { isDevelopmentRuntime } from '../../utils/runtime.ts';
import type { FileSystemServerResponseFactory } from './fs-server-response-factory.ts';

export const FILE_SYSTEM_RESPONSE_MATCHER_ERRORS = {
	transpilePageModuleFailed: (details: string) => `Error transpiling page module: ${details}`,
	noTranspiledOutputForPageModule: (filePath: string) =>
		`No transpiled output generated for page module: ${filePath}`,
} as const;

export interface FileSystemResponseMatcherOptions {
	appConfig: EcoPagesAppConfig;
	router: FSRouter;
	routeRendererFactory: RouteRendererFactory;
	fileSystemResponseFactory: FileSystemServerResponseFactory;
	/** Optional cache service. When null, caching is disabled. */
	cacheService?: PageCacheService | null;
	/** Default cache strategy when caching is enabled. @default 'static' */
	defaultCacheStrategy?: CacheStrategy;
}

/**
 * Matches file-system routes to rendered HTML responses.
 *
 * This class sits at the request-time boundary between router matches and the
 * render pipeline. It coordinates page module inspection, request-local policy,
 * renderer invocation, middleware execution, cache integration, and fallback
 * error translation.
 */
export class FileSystemResponseMatcher {
	private appConfig: EcoPagesAppConfig;
	private router: FSRouter;
	private routeRendererFactory: RouteRendererFactory;
	private fileSystemResponseFactory: FileSystemServerResponseFactory;
	private serverModuleTranspiler: ServerModuleTranspiler;
	private pageRequestCacheCoordinator: PageRequestCacheCoordinator;
	private fileRouteMiddlewarePipeline: FileRouteMiddlewarePipeline;

	constructor({
		appConfig,
		router,
		routeRendererFactory,
		fileSystemResponseFactory,
		cacheService = null,
		defaultCacheStrategy = 'static',
	}: FileSystemResponseMatcherOptions) {
		this.appConfig = appConfig;
		this.router = router;
		this.routeRendererFactory = routeRendererFactory;
		this.fileSystemResponseFactory = fileSystemResponseFactory;
		const invalidationService = new DevelopmentInvalidationService(appConfig);
		this.serverModuleTranspiler = new ServerModuleTranspiler({
			rootDir: appConfig.rootDir,
			buildExecutor: getAppBuildExecutor(appConfig),
			getInvalidationVersion: () => invalidationService.getServerModuleInvalidationVersion(),
			invalidateModules: (changedFiles) => invalidationService.invalidateServerModules(changedFiles),
		});
		this.pageRequestCacheCoordinator = new PageRequestCacheCoordinator(cacheService, defaultCacheStrategy);
		this.fileRouteMiddlewarePipeline = new FileRouteMiddlewarePipeline(cacheService);
	}

	/**
	 * Resolves unmatched paths either as static asset requests or as the custom
	 * not-found page.
	 *
	 * @param requestUrl Incoming pathname.
	 * @returns Static file response or rendered 404 response.
	 */
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
		const cacheKey = this.pageRequestCacheCoordinator.buildCacheKey(match);

		try {
			const resolvedRequest =
				request ??
				new Request(new URL(cacheKey, this.router.origin).toString(), {
					method: 'GET',
				});

			const localsStore: RequestLocals = {};
			const pageModule = await this.importPageModule(match.filePath);
			const Page = (pageModule as any)?.default;
			const pageMiddleware = (Page?.middleware ?? []) as Middleware[];
			const pageCacheStrategy =
				(Page?.cache as CacheStrategy | undefined) ??
				this.pageRequestCacheCoordinator.getDefaultCacheStrategy();
			const localsForRender: RequestLocals | undefined =
				pageCacheStrategy === 'dynamic' ? localsStore : undefined;

			this.fileRouteMiddlewarePipeline.assertValidConfiguration({
				middleware: pageMiddleware,
				pageCacheStrategy,
				filePath: match.filePath,
			});

			const routeRenderer = this.routeRendererFactory.createRenderer(match.filePath);
			const middlewareContext = this.fileRouteMiddlewarePipeline.createContext({
				request: resolvedRequest,
				params: match.params as Record<string, string>,
				locals: localsStore,
			});

			const renderFn = async (): Promise<RenderResult> => {
				const result = await routeRenderer.createRoute({
					file: match.filePath,
					params: match.params,
					query: match.query,
					locals: localsForRender,
				});
				const html = await this.pageRequestCacheCoordinator.bodyToString(result.body);
				const strategy = result.cacheStrategy ?? this.pageRequestCacheCoordinator.getDefaultCacheStrategy();
				return { html, strategy };
			};
			const renderResponse = async (): Promise<Response> => {
				return this.pageRequestCacheCoordinator.render({
					cacheKey,
					pageCacheStrategy,
					renderFn,
				});
			};

			return await this.fileRouteMiddlewarePipeline.run({
				middleware: pageMiddleware,
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
					appLogger.error(`[FileSystemResponseMatcher] ${error.message} at ${match.pathname}`);
				}
			}
			return this.fileSystemResponseFactory.createCustomNotFoundResponse();
		}
	}

	/**
	 * Loads the matched page module for request-time inspection.
	 *
	 * The matcher needs access to page-level metadata such as `cache` and
	 * `middleware` before full rendering starts, so it uses the shared module
	 * import service directly rather than going through route rendering. The
	 * app config is injected explicitly so build ownership stays at the adapter
	 * boundary instead of leaking through nested router collaborators.
	 *
	 * @param filePath Absolute page module path.
	 * @returns Imported page module.
	 */
	private async importPageModule(filePath: string): Promise<unknown> {
		return this.serverModuleTranspiler.importModule({
			filePath,
			outdir: path.join(resolveInternalExecutionDir(this.appConfig), '.server-modules-meta'),
			plugins:
				typeof Bun === 'undefined'
					? [
							createNodeBootstrapPlugin({
								projectDir: this.appConfig.rootDir,
								runtimeNodeModulesDir: path.join(
									resolveInternalExecutionDir(this.appConfig),
									'node_modules',
								),
							}),
						]
					: undefined,
			transpileErrorMessage: FILE_SYSTEM_RESPONSE_MATCHER_ERRORS.transpilePageModuleFailed,
			noOutputMessage: FILE_SYSTEM_RESPONSE_MATCHER_ERRORS.noTranspiledOutputForPageModule,
		});
	}

	/**
	 * Get the underlying cache service for external invalidation.
	 */
	getCacheService(): PageCacheService | null {
		return this.pageRequestCacheCoordinator.getCacheService();
	}
}
