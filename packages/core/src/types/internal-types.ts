import type { EcoBuildPlugin } from '../build/contracts/build-types.ts';
import type { AppBuildManifest } from '../build/contracts/build-manifest.ts';
import type { BuildAdapter, BuildOwnership } from '../build/build-adapter.ts';
import type { BuildRuntime } from '../build/runtime/build-runtime.ts';
import type { AnyIntegrationPlugin } from '../plugins/integration-plugin.ts';
import type { Processor } from '../plugins/processor.ts';
import type { EcoSourceTransform } from '../plugins/source-transform.ts';
import type { PageMetadataProps } from './public-types.ts';
import type { RouteRegistry } from '../router/server/route-registry.ts';
import type { CacheConfig } from '../services/cache/cache.types.ts';
import type { DevGraphService } from '../services/runtime-state/dev-graph.service.ts';
import type { AppModuleLoader } from '../services/module-loading/app-module-loader.service.ts';
import type { SourceModuleLoader } from '../services/module-loading/module-loading-types.ts';
import type { EntrypointDependencyGraph } from '../services/runtime-state/entrypoint-dependency-graph.service.ts';
import type { SessionPageBrowserGraphCache } from '../route-renderer/orchestration/page-browser-graph/page-browser-graph-session.ts';
import type { ServerInvalidationState } from '../services/runtime-state/server-invalidation-state.service.ts';
import type { ServerModuleTranspiler } from '../services/module-loading/server-module-transpiler.service.ts';
import type { RouteModuleBuildCache } from '../services/module-loading/route-module-build-cache.store.ts';

/** Integration hook for registered `dependencies.scripts` entrypoint changes in dev. */
export type RegisteredScriptEntrypointChangeHandler = (filePath: string) => void | Promise<void>;

export interface RobotsPreference {
	/**
	 * The user agent
	 * If an empty array is provided, it will enable all paths for the user agent
	 * If a path is provided, it will disallow the path for the user agent
	 */
	[key: string]: string[];
}

/**
 * Represents the complete configuration object for EcoPages.
 */
export type EcoPagesAppConfig = {
	/**
	 * The base URL of the website, localhost or the domain
	 */
	baseUrl: string;
	/**
	 * The root directory of the project
	 * @default "."
	 */
	rootDir: string;
	/**
	 * The root directory of the project
	 * @default "src"
	 */
	srcDir: string;
	/**
	 * The directory where the public files are located
	 * @default "public"
	 */
	publicDir: string;
	/**
	 * The directory where the pages are located
	 * @default "pages"
	 */
	pagesDir: string;
	/**
	 * The directory where the includes templates are located
	 * @default "includes"
	 */
	includesDir: string;
	/**
	 * The directory where the layouts are located
	 * @default "layouts"
	 */
	layoutsDir: string;
	/**
	 * The directory where the output will be located
	 * @default "dist"
	 */
	distDir: string;
	/**
	 * The directory where internal runtime and build artifacts are stored.
	 *
	 * @remarks
	 * This directory is not intended for deployment. It owns transpiled server
	 * modules, runtime manifests, and processor caches so `distDir` can remain a
	 * clean export tree.
	 *
	 * @default ".eco"
	 */
	workDir: string;
	/**
	 * The templates extensions based on the integrations
	 */
	templatesExt: string[];
	/**
	 * The directory where the components are located
	 * @default "components"
	 */
	componentsDir: string;
	/**
	 * The robots.txt configuration
	 */
	robotsTxt: {
		/**
		 * The robots preferences. The key is the user agent and the value is the disallowed paths.
		 * @default { "*": [] }
		 */
		preferences: RobotsPreference;
	};
	/** Additional paths to watch. Use this to monitor extra files. It is relative to the rootDir */
	additionalWatchPaths: string[];
	/**
	 * @default { title: 'Ecopages', description: 'Ecopages' }
	 */
	defaultMetadata: PageMetadataProps;
	/** Integrations plugins */
	integrations: AnyIntegrationPlugin[];
	/** Integrations dependencies */
	integrationsDependencies: IntegrationDependencyConfig[];
	/** Derived Paths */
	absolutePaths: {
		config: string;
		componentsDir: string;
		distDir: string;
		workDir: string;
		includesDir: string;
		layoutsDir: string;
		pagesDir: string;
		projectDir: string;
		publicDir: string;
		srcDir: string;
		htmlTemplatePath: string;
		error404TemplatePath: string;
	};
	/**
	 * The processors to be used in the app
	 */
	processors: Map<string, Processor>;
	/**
	 * Loaders to be used in the app, these are used to process the files when importing them
	 */
	loaders: Map<string, EcoBuildPlugin>;
	/**
	 * App-owned source transforms that can be adapted into Vite or other
	 * transform-first bundlers.
	 */
	sourceTransforms: Map<string, EcoSourceTransform>;
	/**
	 * Cache configuration for ISR and page caching.
	 * @default { store: 'memory', defaultStrategy: 'static', enabled: true }
	 */
	cache?: CacheConfig;
	/**
	 * Runtime-owned services attached after config construction.
	 *
	 * These values are internal implementation details used to thread per-app
	 * executors and similar runtime state through the system without relying on
	 * process-global registries.
	 */
	runtime?: {
		appModuleLoader?: AppModuleLoader;
		buildOwnership?: BuildOwnership;
		buildAdapter?: BuildAdapter;
		buildManifest?: AppBuildManifest;
		devGraphService?: DevGraphService;
		entrypointDependencyGraph?: EntrypointDependencyGraph;
		pageBrowserGraphSession?: SessionPageBrowserGraphCache;
		hostModuleLoader?: SourceModuleLoader;
		rendererModuleContext?: unknown;
		serverInvalidationState?: ServerInvalidationState;
		serverModuleTranspiler?: ServerModuleTranspiler;
		routeModuleBuildCaches?: Map<string, RouteModuleBuildCache>;
		/** Profile-based build runtime installed by {@link installBuildRuntime}. */
		buildRuntime?: BuildRuntime;
		/** Set after {@link setupAppRuntimePlugins} runs processor/integration setup once per process. */
		runtimeAssetsPrepared?: boolean;
		/** Registers integration runtime plugins when lazy activation completes. */
		onRuntimePlugin?: (plugin: import('../build/contracts/build-types.ts').EcoBuildPlugin) => void;
		/** Integration names that completed lazy runtime activation. */
		activatedIntegrations?: Set<string>;
		/** When `'host'`, the embedded dev server owns browser dev-client bootstrap. */
		devClientOwner?: 'core' | 'host';
		/** Integration hooks run when a registered `dependencies.scripts` entrypoint changes. */
		registeredScriptEntrypointChangeHandlers?: RegisteredScriptEntrypointChangeHandler[];
		/** @deprecated Prefer {@link devClientOwner}: `'host'`. */
		delegateBrowserReloadToHost?: boolean;
	};
	/**
	 * Experimental features.
	 */
	experimental?: {
		/** Escape hatch for short-lived private toggles. No validation or IntelliSense. */
		unsafe?: Record<string, unknown>;
	};
};

export type IntegrationDependencyConfig = {
	integration: string;
	kind: 'script' | 'stylesheet';
	position?: 'head' | 'body';
	srcUrl: string;
	filePath: string;
	/** @todo inline dependencies not implemented yet */
	inline?: boolean;
};

/**
 * The possible kinds of a route.
 */
export type RouteKind = 'exact' | 'catch-all' | 'dynamic';

/**
 * Represents the result of a route match.
 */
export type MatchResult = {
	requestedPathname: string;
	templateRoute: {
		filePath: string;
		kind: RouteKind;
		pathname: string;
	};
	query: Record<string, string>;
	params: Record<string, string | string[]>;
};

/**
 * Represents a route in EcoPages.
 */
export type Route = {
	kind: RouteKind;
	filePath: string;
	pathname: string;
};

/**
 * Represents the routes in EcoPages.
 */
export type Routes = Record<string, Route>;

/**
 * Represents the options for the file system server.
 */
export type FileSystemServerOptions = {
	watchMode: boolean;
	port?: number | string;
};

/**
 * Represents the file system server adapter.
 */
export interface EcoPagesFileSystemServerAdapter<ServerInstanceOptions = unknown> {
	startServer(serverOptions: ServerInstanceOptions):
		| {
				router: RouteRegistry;
				server: unknown;
		  }
		| Promise<{ router: RouteRegistry; server: unknown }>;
}

// Re-export HMR types from public-types for internal use
export type {
	ClientBridgeEvent,
	DefaultHmrContext,
	HmrFileChangeOptions,
	IHmrManager,
	IClientBridge,
} from './public-types.ts';
