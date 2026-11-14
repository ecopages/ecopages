import { ProcessedAssetLedger } from '../../assets/asset-processing-service/processed-asset-ledger.ts';
import { ProcessedStylesheetCache } from '../../assets/asset-processing-service/processors/stylesheet/processed-stylesheet-cache.ts';
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
import type { AppBuildManifest } from '../../build/contracts/build-manifest.ts';
import type { AppModuleLoaderContract } from '../../build/server/app-module-loader.service.ts';
import type { ProductionServerModulesManifest } from '../../build/server/server-modules-manifest.ts';
import type { RouteModuleBuildCache } from '../../build/server/route-module-build-cache.store.ts';
import type { RequestPipelineMetricsState } from '../../diagnostics/request-pipeline-metrics.ts';
import type { HtmlPageWarningState } from '../../html-pages/html-page-warning-state.ts';
import type { HtmlPageModuleScriptState } from '../../html-pages/html-page-module-scripts.ts';
import type { CustomElementScriptPreloadScopeState } from '../../route-renderer/orchestration/custom-element-scripts/custom-element-script-preload-invalidation.ts';
import type { DevelopmentInvalidationService } from '../../dev/invalidation/development-invalidation.service.ts';
import type { DevelopmentStylesheetService } from '../../dev/stylesheets/development-stylesheet.service.ts';
import type { PageCacheService } from '../../page-cache/page-cache-service.ts';
import type { RouteRegistry } from '../../router/server/route-registry.ts';
import type { IHmrManager } from '../../types/contracts.ts';
import { getRuntimeArgv } from '../../utils/runtime.ts';
import { MISSING_APP_RUNTIME } from '../../utils/app-runtime.ts';
import { isProductionExport, resolveEntryCommand } from '../../utils/parse-cli-args.ts';

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
 * When an activation resolves each Integration's global scripts (`integrationDependencies`).
 *
 * @remarks
 * - `activation`: right after a successful `setup()`, in dev, `ecopages start` and request-only `app.fetch()`.
 * - `browser-build`: never at activation. A production export (`ecopages build`, `ecopages preview`) and the Lit
 *   static-render worker resolve them through `resolveIntegrationDependencies()` once their app-wide browser build is
 *   known, so no global script is bundled on its own into `dist/client`.
 */
export type GlobalScriptResolution = 'activation' | 'browser-build';

/** Options fixed when the {@link AppRuntime} is created. */
export interface AppRuntimeOptions {
	/**
	 * @defaultValue `'browser-build'` when the process runs `ecopages build` or `ecopages preview` without
	 * `--serve-only`, otherwise `'activation'`.
	 */
	globalScriptResolution?: GlobalScriptResolution;
}

/**
 * Per-app state assembled once for a finalized config.
 *
 * @remarks
 * `origin` starts as `baseUrl` and updates when the runtime binds its listening origin. `hmr` stays
 * `null` until a watch-mode dev session creates an HMR manager, and resets to `null` when dev resources
 * are disposed. `developmentInvalidation` stays `null` until development services need it, then the
 * watcher and HMR manager share that instance. `developmentStylesheets` stays `null` until the watcher or the dev
 * transform server needs it. `pageCache` stays `null` until the server adapter stores one.
 */
export interface AppRuntime {
	buildAdapter: BuildAdapter;
	buildManifest: AppBuildManifest;
	buildQueue: BuildQueue;
	buildInputIndex: BuildInputDependencyIndex;
	productionServerModules: ProductionServerModulesManifest | null;
	pageBrowserGraphSession: SessionPageBrowserGraphCache;
	serverInvalidation: ServerInvalidationState;
	developmentInvalidation: DevelopmentInvalidationService | null;
	developmentStylesheets: DevelopmentStylesheetService | null;
	moduleLoader: AppModuleLoaderContract;
	routeModuleBuildCaches: Map<string, RouteModuleBuildCache>;
	pageCache: PageCacheService | null;
	integrationActivations: Map<string, Promise<void>>;
	/**
	 * Fixed for the runtime's lifetime, so the first activation, whichever caller starts it, follows the strategy of
	 * the whole run.
	 */
	readonly globalScriptResolution: GlobalScriptResolution;
	runtimeAssetsPrepared: boolean;
	hmrAttachedToIntegrations: boolean;
	/**
	 * Id shared by every production manifest written during one `ecopages build`.
	 *
	 * @remarks
	 * Null until a production export creates one. `ecopages start` reads the id
	 * from the files in `dist/` instead of this field.
	 */
	productionBuildId: string | null;
	htmlPageModuleScripts: HtmlPageModuleScriptState;
	htmlPageWarnings: HtmlPageWarningState;
	customElementSsrPreloadScopes: Map<string, CustomElementScriptPreloadScopeState>;
	requestPipelineMetrics: RequestPipelineMetricsState;
	origin: string;
	hmr: IHmrManager | null;
	/**
	 * The Route Registry of the running server, `null` until the server creates it.
	 */
	router: RouteRegistry | null;
	/**
	 * Absolute source paths of the modules a rendered Page references as a Layout.
	 *
	 * @remarks
	 * Filled during route preparation, so it only grows within a session and holds the Layouts that were
	 * rendered. A Layout is whatever a Page passes as `eco.page({ layout })`, never a folder.
	 */
	layoutFiles: Set<string>;
	/**
	 * Processed and bundled dependencies of the production build, by dependency key, shared by every
	 * asset-processing service.
	 *
	 * @remarks
	 * The app-wide browser build records each script it bundles here, and asset processing each dependency it
	 * processes. `ecopages build` writes it to `dist/server/processed-assets.json`; `ecopages start` restores and
	 * seals it, so rendering serves every dependency from `dist/` and never compiles or writes.
	 */
	processedAssets: ProcessedAssetLedger;
	/** The stylesheets the app's Processor produced, shared by every path that processes one. */
	processedStylesheets: ProcessedStylesheetCache;
	/**
	 * True while static generation (`ecopages build`) runs. An asset that cannot be processed then
	 * fails the build.
	 */
	staticGenerationActive: boolean;
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
export function createAppRuntime(appConfig: EcoPagesAppConfig, options: AppRuntimeOptions = {}): AppRuntime {
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
		productionServerModules: null,
		pageBrowserGraphSession: new SessionPageBrowserGraphCache(buildInputIndex),
		serverInvalidation: new ServerInvalidationState(),
		developmentInvalidation: null,
		developmentStylesheets: null,
		moduleLoader: new AppModuleLoader(appConfig),
		routeModuleBuildCaches: new Map(),
		pageCache: null,
		integrationActivations: new Map(),
		globalScriptResolution:
			options.globalScriptResolution ??
			(isProductionExport(resolveEntryCommand(getRuntimeArgv())) ? 'browser-build' : 'activation'),
		runtimeAssetsPrepared: false,
		hmrAttachedToIntegrations: false,
		productionBuildId: null,
		htmlPageModuleScripts: createHtmlPageModuleScriptState(),
		htmlPageWarnings: createHtmlPageWarningState(),
		customElementSsrPreloadScopes: new Map(),
		requestPipelineMetrics: createRequestPipelineMetricsState(),
		origin: appConfig.baseUrl,
		hmr: null,
		router: null,
		layoutFiles: new Set(),
		processedAssets: new ProcessedAssetLedger(appConfig.rootDir),
		processedStylesheets: new ProcessedStylesheetCache(),
		staticGenerationActive: false,
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
