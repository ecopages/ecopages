import { createBuildAdapter, type BuildAdapter } from '../build/build-adapter.ts';
import { sealAppBuildManifest } from '../build/app-build-manifest-runtime.ts';
import { BuildInputDependencyIndex, seedProcessorWatchPaths } from '../build/cache/build-input-dependency-index.ts';
import type { PagesUnifiedGraphCacheManifest } from '../build/cache/pages-unified-graph-build.ts';
import { createAppBuildManifest, type AppBuildManifest } from '../build/contracts/build-manifest.ts';
import { BuildQueue } from '../build/runtime/build-queue.ts';
import {
	createHtmlPageModuleScriptState,
	type HtmlPageModuleScriptState,
} from '../html-pages/html-page-module-scripts.ts';
import { SessionPageBrowserGraphCache } from '../route-renderer/orchestration/page-browser-graph/page-browser-graph-session.ts';
import type { PageCacheService } from '../services/cache/page-cache-service.ts';
import { createAppModuleLoader } from '../services/module-loading/app-server-module-transpiler.service.ts';
import type { AppModuleLoader } from '../services/module-loading/app-module-loader.service.ts';
import type { CollectionServerBuildArtifact } from '../services/module-loading/collection-server-module-build.service.ts';
import type { RouteModuleBuildCache } from '../services/module-loading/route-module-build-cache.store.ts';
import {
	NoopEntrypointDependencyGraph,
	type EntrypointDependencyGraph,
} from '../services/runtime-state/entrypoint-dependency-graph.service.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { IHmrManager } from '../types/public-types.ts';

/** Integration hook for registered `dependencies.scripts` entrypoint changes in dev. */
export type RegisteredScriptEntrypointChangeHandler = (filePath: string) => void | boolean | Promise<void | boolean>;

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
 * `hmr` stays `null`. Watch mode still keeps its manager on the server adapter. `origin` starts as `baseUrl`
 * and follows the listening origin the route renderer and static builder bind. `pageCache` stays `null`
 * until the server adapter stores one.
 */
export interface AppRuntime {
	buildAdapter: BuildAdapter;
	buildManifest: AppBuildManifest;
	buildQueue: BuildQueue;
	buildInputIndex: BuildInputDependencyIndex;
	pagesUnifiedGraphManifest: PagesUnifiedGraphCacheManifest | null;
	pageBrowserGraphSession: SessionPageBrowserGraphCache;
	serverInvalidation: ServerInvalidationState;
	entrypointDependencyGraph: EntrypointDependencyGraph;
	moduleLoader: AppModuleLoader;
	routeModuleBuildCaches: Map<string, RouteModuleBuildCache>;
	collectionArtifacts: Map<string, CollectionServerBuildArtifact>;
	pageCache: PageCacheService | null;
	integrationActivations: Map<string, Promise<void>>;
	runtimeAssetsPrepared: boolean;
	hmrAttachedToIntegrations: boolean;
	registeredScriptEntrypointChangeHandlers: RegisteredScriptEntrypointChangeHandler[];
	htmlPageModuleScripts: HtmlPageModuleScriptState;
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
 * `buildQueue` or `entrypointDependencyGraph` on the returned runtime.
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
		entrypointDependencyGraph: new NoopEntrypointDependencyGraph(),
		moduleLoader: createAppModuleLoader(appConfig),
		routeModuleBuildCaches: new Map(),
		collectionArtifacts: new Map(),
		pageCache: null,
		integrationActivations: new Map(),
		runtimeAssetsPrepared: false,
		hmrAttachedToIntegrations: false,
		registeredScriptEntrypointChangeHandlers: [],
		htmlPageModuleScripts: createHtmlPageModuleScriptState(),
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
