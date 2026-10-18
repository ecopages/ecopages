import { createBuildAdapter, type BuildAdapter } from '../build/build-adapter.ts';
import { sealAppBuildManifest } from '../build/app-build-manifest-runtime.ts';
import { BuildInputDependencyIndex, seedProcessorWatchPaths } from '../build/cache/build-input-dependency-index.ts';
import type { PagesUnifiedGraphCacheManifest } from '../build/cache/pages-unified-graph-build.ts';
import { createAppBuildManifest, type AppBuildManifest } from '../build/contracts/build-manifest.ts';
import { BuildQueue } from '../build/runtime/build-queue.ts';
import {
	createRequestPipelineMetricsState,
	type RequestPipelineMetricsState,
} from '../diagnostics/request-pipeline-metrics.ts';
import { createHtmlPageWarningState, type HtmlPageWarningState } from '../html-pages/html-page-warning-state.ts';
import {
	createHtmlPageModuleScriptState,
	type HtmlPageModuleScriptState,
} from '../html-pages/html-page-module-scripts.ts';
import { SessionPageBrowserGraphCache } from '../route-renderer/orchestration/page-browser-graph/page-browser-graph-session.ts';
import type { CustomElementScriptPreloadScopeState } from '../route-renderer/orchestration/custom-element-scripts/custom-element-script-preload-invalidation.ts';
import type { PageCacheService } from '../page-cache/page-cache-service.ts';
import { AppModuleLoader, type AppModuleLoaderContract } from '../build/server/app-module-loader.service.ts';
import type { RouteModuleBuildCache } from '../build/server/route-module-build-cache.store.ts';
import type { DevelopmentInvalidationService } from '../dev/invalidation/development-invalidation.service.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { IHmrManager, RegisteredScriptEntrypointChangeHandler } from '../types/public-types.ts';

export type { RegisteredScriptEntrypointChangeHandler };

/**
 * The counter bumped when server modules are marked stale.
 *
 * @remarks
 * The app module loader reports this counter. Dev caches that outlive one import compare it instead of
 * keeping a counter of their own.
 */
export class ServerInvalidationState {
	private generation = 0;

	currentGeneration(): number {
		return this.generation;
	}

	advance(): void {
		this.generation += 1;
	}
}

/**
 * Per-app state assembled once for a finalized config.
 *
 * @remarks
 * `origin` starts as `baseUrl` and updates when the runtime binds its listening origin. `hmr` stays
 * `null` until a watch-mode dev session creates an HMR manager, and resets to `null` when dev resources
 * are disposed. `developmentInvalidation` stays `null` until development services need it, then the
 * watcher and HMR manager share that instance. `pageCache` stays `null` until the server adapter stores one.
 */
export interface AppRuntime {
	buildAdapter: BuildAdapter;
	buildManifest: AppBuildManifest;
	buildQueue: BuildQueue;
	buildInputIndex: BuildInputDependencyIndex;
	pagesUnifiedGraphManifest: PagesUnifiedGraphCacheManifest | null;
	pageBrowserGraphSession: SessionPageBrowserGraphCache;
	serverInvalidation: ServerInvalidationState;
	developmentInvalidation: DevelopmentInvalidationService | null;
	moduleLoader: AppModuleLoaderContract;
	routeModuleBuildCaches: Map<string, RouteModuleBuildCache>;
	pageCache: PageCacheService | null;
	integrationActivations: Map<string, Promise<void>>;
	runtimeAssetsPrepared: boolean;
	hmrAttachedToIntegrations: boolean;
	htmlPageModuleScripts: HtmlPageModuleScriptState;
	htmlPageWarnings: HtmlPageWarningState;
	customElementSsrPreloadScopes: Map<string, CustomElementScriptPreloadScopeState>;
	requestPipelineMetrics: RequestPipelineMetricsState;
	origin: string;
	hmr: IHmrManager | null;
}

const MISSING_APP_RUNTIME = 'Missing app runtime. This config was never assembled.';

/**
 * Returns the runtime {@link createAppRuntime} stored on a finalized config.
 *
 * @throws When `appConfig` skipped finalization, so no service can invent a substitute runtime.
 */
export function requireAppRuntime(appConfig: EcoPagesAppConfig): AppRuntime {
	const runtime = appConfig.appRuntime;
	if (!runtime) {
		throw new Error(MISSING_APP_RUNTIME);
	}

	return runtime;
}

/**
 * Builds the one {@link AppRuntime} for `appConfig` and stores it on the config.
 *
 * @remarks
 * Finalization calls this once. A second call returns that same object. The module loader is
 * created before the runtime is stored: it reads the server-invalidation counter when a generation
 * is requested, not while it is constructed. Startup or the HMR manager may later replace
 * `buildQueue` on the returned runtime.
 *
 * @throws When the config was not assembled by finalization.
 */
export function createAppRuntime(appConfig: EcoPagesAppConfig): AppRuntime {
	if (appConfig.appRuntime) {
		return appConfig.appRuntime;
	}

	if (!appConfig.loaders || !appConfig.processors || !appConfig.integrations) {
		throw new Error(MISSING_APP_RUNTIME);
	}

	const buildAdapter = createBuildAdapter();
	const buildQueue = new BuildQueue(buildAdapter);
	const buildInputIndex = new BuildInputDependencyIndex();
	seedProcessorWatchPaths(appConfig, buildInputIndex);

	const runtime: AppRuntime = {
		buildAdapter,
		buildManifest: createAppBuildManifest([]),
		buildQueue,
		buildInputIndex,
		pagesUnifiedGraphManifest: null,
		pageBrowserGraphSession: new SessionPageBrowserGraphCache(buildInputIndex),
		serverInvalidation: new ServerInvalidationState(),
		developmentInvalidation: null,
		moduleLoader: new AppModuleLoader(appConfig),
		routeModuleBuildCaches: new Map(),
		pageCache: null,
		integrationActivations: new Map(),
		runtimeAssetsPrepared: false,
		hmrAttachedToIntegrations: false,
		htmlPageModuleScripts: createHtmlPageModuleScriptState(),
		htmlPageWarnings: createHtmlPageWarningState(),
		customElementSsrPreloadScopes: new Map(),
		requestPipelineMetrics: createRequestPipelineMetricsState(),
		origin: appConfig.baseUrl,
		hmr: null,
	};
	appConfig.appRuntime = runtime;
	try {
		runtime.buildManifest = sealAppBuildManifest(appConfig);
	} catch (error) {
		appConfig.appRuntime = undefined;
		throw error;
	}
	return runtime;
}
