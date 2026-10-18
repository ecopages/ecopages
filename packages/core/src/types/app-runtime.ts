import type { BuildAdapter } from '../build/build-adapter.ts';
import type { BuildInputDependencyIndex } from '../build/cache/build-input-dependency-index.ts';
import type { PagesUnifiedGraphCacheManifest } from '../build/cache/pages-unified-graph-build.ts';
import type { AppBuildManifest } from '../build/contracts/build-manifest.ts';
import type { BuildQueue } from '../build/runtime/build-queue.ts';
import type { AppModuleLoaderContract } from '../build/server/app-module-loader.service.ts';
import type { RouteModuleBuildCache } from '../build/server/route-module-build-cache.store.ts';
import type { RequestPipelineMetricsState } from '../diagnostics/request-pipeline-metrics.ts';
import type { HtmlPageWarningState } from '../html-pages/html-page-warning-state.ts';
import type { HtmlPageModuleScriptState } from '../html-pages/html-page-module-scripts.ts';
import type { SessionPageBrowserGraphCache } from '../route-renderer/orchestration/page-browser-graph/page-browser-graph-session.ts';
import type { CustomElementScriptPreloadScopeState } from '../route-renderer/orchestration/custom-element-scripts/custom-element-script-preload-invalidation.ts';
import type { DevelopmentInvalidationService } from '../dev/invalidation/development-invalidation.service.ts';
import type { PageCacheService } from '../page-cache/page-cache-service.ts';
import type { IHmrManager } from './public-types.ts';
import type { EcoPagesAppConfig } from './internal-types.ts';

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
 * Returns the runtime created during config finalization.
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
