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
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { ServerInvalidationState, type AppRuntime } from '../../types/app-runtime.ts';

export { requireAppRuntime, ServerInvalidationState } from '../../types/app-runtime.ts';
export type { AppRuntime } from '../../types/app-runtime.ts';
export type { RegisteredScriptEntrypointChangeHandler } from '../../types/public-types.ts';

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
		throw new Error('Missing app runtime. This config was never assembled.');
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
