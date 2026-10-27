import { createBuildAdapter } from '../../build/build-adapter.ts';
import { sealAppBuildManifest } from '../../build/app-build-manifest-runtime.ts';
import { BuildInputDependencyIndex, seedProcessorWatchPaths } from '../../build/cache/build-input-dependency-index.ts';
import { createAppBuildManifest } from '../../build/contracts/build-manifest.ts';
import { BuildQueue } from '../../build/runtime/build-queue.ts';
import { createRequestPipelineMetricsState } from '../../diagnostics/request-pipeline-metrics.ts';
import { createHtmlPageWarningState } from '../../html-pages/html-page-warning-state.ts';
import { createHtmlPageModuleScriptState } from '../../html-pages/html-page-module-scripts.ts';
import { SessionPageBrowserGraphCache } from '../../route-renderer/orchestration/page-browser-graph/page-browser-graph-session.ts';
import { AppModuleLoader } from '../../build/server/app-module-loader.service.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { BuildAdapter } from '../../build/build-adapter.ts';
import type { PagesUnifiedGraphCacheManifest } from '../../build/cache/pages-unified-graph-build.ts';
import type { AppBuildManifest } from '../../build/contracts/build-manifest.ts';
import type { AppModuleLoaderContract } from '../../build/server/app-module-loader.service.ts';
import type { RouteModuleBuildCache } from '../../build/server/route-module-build-cache.store.ts';
import type { RequestPipelineMetricsState } from '../../diagnostics/request-pipeline-metrics.ts';
import type { HtmlPageWarningState } from '../../html-pages/html-page-warning-state.ts';
import type { HtmlPageModuleScriptState } from '../../html-pages/html-page-module-scripts.ts';
import type { CustomElementScriptPreloadScopeState } from '../../route-renderer/orchestration/custom-element-scripts/custom-element-script-preload-invalidation.ts';
import type { DevelopmentInvalidationService } from '../../dev/invalidation/development-invalidation.service.ts';
import type { PageCacheService } from '../../page-cache/page-cache-service.ts';
import type { IHmrManager } from '../../types/contracts.ts';
import { MISSING_APP_RUNTIME } from '../../utils/app-runtime.ts';

export { requireAppRuntime } from '../../utils/app-runtime.ts';

export type { RegisteredScriptEntrypointChangeHandler } from '../../types/contracts.ts';

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
	/**
	 * When true, a production request whose Page Browser Graph is not in the browser client
	 * manifest is an error. `ecopages start` sets this after it restores the manifest.
	 */
	productionBrowserGraphsSealed: boolean;
}

/**
 * Builds the one {@link AppRuntime} for `appConfig` and stores it on the config.
 *
 * @remarks
 * Finalization calls this once. A second call returns that same object. The module loader is
 * created before the runtime is stored: it reads the server-invalidation counter when a generation
 * is requested, not while it is constructed. The runtime keeps its one `buildQueue` for its lifetime,
 * so identical builds share one in-flight result from config setup onwards.
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
		productionBrowserGraphsSealed: false,
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
