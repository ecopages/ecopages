import type { EcoBuildPlugin } from '../build/contracts/build-types.ts';
import type { AppRuntime } from './assembly/app-runtime.ts';
import type { AnyIntegrationPlugin } from '../plugins/integration-plugin.ts';
import type { Processor } from '../plugins/processor.ts';
import type {
	CacheConfig,
	ComponentRenderInput,
	EcoComponent,
	PageMetadataProps,
	SitemapConfig,
} from '../types/contracts.ts';

/** Internal render input carrying route-resolved dependency roots. */
export type InternalComponentRenderInput = ComponentRenderInput & {
	foreignChildRoots?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>;
};

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
	/**
	 * Automatic sitemap.xml generation during static export.
	 *
	 * @default { enabled: false, fileName: 'sitemap.xml', extraUrls: [], exclude: [] }
	 */
	sitemap: SitemapConfig;
	/** Additional paths to watch. Use this to monitor extra files. It is relative to the rootDir */
	additionalWatchPaths: string[];
	/**
	 * Globs, relative to `rootDir`, of files copied into `dist/.server/` at build
	 * so production modules can read them next to `import.meta`.
	 */
	serverFiles?: string[];
	/**
	 * Static paths to SSR-prewarm in the background during development.
	 *
	 * @remarks
	 * Starts as the user's `devPrewarmPaths`. A Processor appends the paths it owns from `setup()`, which runs
	 * before the server reports that it is listening; core reads the list once, after that.
	 */
	devPrewarmPaths?: string[];
	/**
	 * @default { title: 'Ecopages', description: 'Ecopages' }
	 */
	defaultMetadata: PageMetadataProps;
	/** Integrations plugins */
	integrations: AnyIntegrationPlugin[];
	/** Derived Paths */
	absolutePaths: {
		config: string;
		/**
		 * The config module and the project files it imports. Only the config module when the config is
		 * in memory, is the emitted production config, or could not be scanned.
		 *
		 * @remarks
		 * Build-input fingerprints hash these files, so an edit to a plugin options module the
		 * config imports invalidates caches like an edit to the config itself. Development
		 * restarts on the same set.
		 */
		configModuleFiles: string[];
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
		errorPageTemplatePaths?: Record<400 | 401 | 403 | 404 | 409 | 500, string>;
		error404TemplatePath: string;
		error500TemplatePath: string;
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
	 * Cache configuration for ISR and page caching.
	 * @default { store: 'memory', defaultStrategy: 'static', enabled: true }
	 */
	cache?: CacheConfig;
	/**
	 * The one runtime assembled by config finalization.
	 *
	 * @remarks
	 * Absent on a config that skipped finalization. Read it with `requireAppRuntime`, which throws
	 * rather than inventing a build adapter, manifest, or graph.
	 */
	appRuntime?: AppRuntime;
	/**
	 * Development-only in-browser toolbar configuration.
	 */
	devToolbar?: {
		/**
		 * Whether the dev toolbar is enabled during watch mode.
		 *
		 * @default true when `package` is configured
		 */
		enabled?: boolean;
		/**
		 * Client package resolved from the application project and bundled to
		 * `/_dev_toolbar.js` during watch mode.
		 *
		 * @example '@ecopages/dev-toolbar'
		 */
		package?: string;
	};
};

// Re-export HMR types from public-types for internal use
export type {
	ClientBridgeEvent,
	DefaultHmrContext,
	HmrFileChangeOptions,
	IHmrManager,
	IClientBridge,
} from '../types/contracts.ts';
