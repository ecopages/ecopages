import type { EcoBuildPlugin } from '../build/contracts/build-types.ts';
import type { AnyIntegrationPlugin } from '../plugins/integration-plugin.ts';
import type { AnyProcessor } from '../plugins/processor.ts';
import type { CacheConfig } from '../page-cache/cache.types.ts';
import type { EcoPagesAppConfig, RobotsPreference } from '../config/internal-types.ts';
import type { PageMetadataProps, SitemapConfig } from '../types/contracts.ts';
import type { GlobalScriptResolution } from './assembly/app-runtime.ts';

/**
 * Extra response headers for the requests a `source` pattern matches.
 *
 * @remarks
 * `source` is a URL pathname pattern that starts with `/`: `*` matches any characters except `/`, `**` matches
 * any characters including `/`, and everything else is literal. `/**` matches every path, `/assets/*` the files
 * directly in `/assets/`, and `/**\/*.wasm` every `.wasm` file.
 */
export type ResponseHeaderRule = {
	source: string;
	headers: Record<string, string>;
};

/**
 * Author-owned Ecopages configuration declared in `eco.config.ts`.
 *
 * @remarks
 * Author this object using `defineConfig({ ... })` in `eco.config.ts`.
 * This type excludes resolved absolute paths, derived integration extensions, and runtime
 * services attached when `createApp()` finalizes the config.
 *
 * @example
 * ```typescript
 * import { defineConfig } from '@ecopages/core/config';
 * import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
 *
 * export default defineConfig({
 *   integrations: [ecopagesJsxPlugin()],
 * });
 * ```
 */
export type EcoPagesUserConfig = {
	/**
	 * Absolute or relative path to the project root directory.
	 *
	 * @default process.cwd()
	 */
	rootDir?: string;

	/**
	 * Canonical base URL for production deployment (e.g. `https://example.com`).
	 *
	 * @default 'http://localhost:3000'
	 */
	baseUrl?: string;

	/**
	 * Directory containing application source code, relative to `rootDir`.
	 *
	 * @default 'src'
	 */
	srcDir?: string;

	/**
	 * Directory for static public assets copied into `<distDir>/client`, relative to `rootDir`.
	 *
	 * @default 'public'
	 */
	publicDir?: string;

	/**
	 * Directory containing page route files and semantic HTML error pages (`400.ts` through `500.ts`), relative to `srcDir`.
	 *
	 * @default 'pages'
	 */
	pagesDir?: string;

	/**
	 * Directory containing reusable includes or the semantic `html.*` document shell, relative to `srcDir`.
	 *
	 * @default 'includes'
	 */
	includesDir?: string;

	/**
	 * Output root for the production build, relative to `rootDir`. Public files are written to `client/` and private server output to `server/` beneath it.
	 *
	 * @default 'dist'
	 */
	distDir?: string;

	/**
	 * Internal scratch and cache directory for build artifacts and virtual modules, relative to `rootDir`.
	 *
	 * @default '.eco'
	 */
	workDir?: string;

	/**
	 * Configuration for automatic `robots.txt` generation.
	 */
	robotsTxt?: {
		preferences: RobotsPreference;
	};

	/**
	 * Configuration for automatic `sitemap.xml` generation.
	 */
	sitemap?: SitemapConfig;

	/**
	 * Additional file or directory paths to watch during development.
	 */
	additionalWatchPaths?: string[];

	/**
	 * Globs, relative to `rootDir`, of files copied into `dist/server/` by
	 * basename so production code can read them next to `import.meta`. Two
	 * matches that share a basename fail the build. Prefer `public/` for static
	 * files the browser should fetch.
	 */
	serverFiles?: string[];

	/**
	 * URL route paths to prewarm in the background when the development server starts.
	 */
	devPrewarmPaths?: string[];

	/**
	 * Headers added to every response the server sends: rendered pages, explicit routes and endpoints, and files
	 * from `public/` and `dist/client`, under `ecopages dev`, `start` and `preview`.
	 *
	 * @remarks
	 * Rules apply in order. A header here replaces one of the same name set by the framework or a handler.
	 * A static export carries no headers; configure them on the host.
	 *
	 * @example
	 * ```ts
	 * headers: [
	 *   { source: '/**', headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } },
	 * ]
	 * ```
	 */
	headers?: ResponseHeaderRule[];

	/**
	 * Default fallback HTML `<head>` metadata (title, description, OpenGraph tags) applied across all pages.
	 */
	defaultMetadata?: PageMetadataProps;

	/**
	 * Integration plugins enabling template rendering (e.g. JSX, MDX, Lit, React).
	 */
	integrations?: AnyIntegrationPlugin[];

	/**
	 * PostCSS, Tailwind, or custom asset processors applied to imported styles and assets.
	 */
	processors?: AnyProcessor[];

	/**
	 * Build plugins, in the `EcoBuildPlugin` contract, that load or transform modules in every build.
	 */
	loaders?: EcoBuildPlugin[];

	/**
	 * Cache policy configuration for page and asset build outputs.
	 */
	cache?: CacheConfig;

	/**
	 * Development toolbar configuration and toggle options.
	 */
	devToolbar?: EcoPagesAppConfig['devToolbar'];
};

/** Produces fresh plugin instances when one config module creates multiple apps in a process. */
export type EcoPagesUserConfigFactory = () => EcoPagesUserConfig;

export type LoadedEcoPagesUserConfig = {
	config: EcoPagesUserConfig;
	configFilePath: string;
};

export type FinalizeEcoPagesConfigOptions = {
	/**
	 * Path of the config module, stored as `absolutePaths.config`.
	 *
	 * @default `<rootDir>/eco.config.ts`
	 */
	configFilePath?: string;
	/**
	 * Working directory used when `rootDir` is omitted.
	 *
	 * @default process.cwd()
	 */
	cwd?: string;
	/**
	 * When the runtime's activations resolve Integration global scripts.
	 *
	 * @remarks
	 * The default follows the process command, `'browser-build'` for a production export. A process that runs a
	 * production export without that command, such as a test or the Lit static-render worker, passes
	 * `'browser-build'`.
	 *
	 * @defaultValue `'browser-build'` for a production export command, otherwise `'activation'`.
	 */
	globalScriptResolution?: GlobalScriptResolution;
};

export type LoadEcoPagesConfigOptions = {
	configFile?: string;
	cwd?: string;
	/** See {@link FinalizeEcoPagesConfigOptions.globalScriptResolution}. */
	globalScriptResolution?: GlobalScriptResolution;
	/**
	 * Output and work directories that replace the config's `distDir` and `workDir`.
	 *
	 * @remarks
	 * A worker that renders for a build in progress, such as the Lit static-render worker, passes the directories
	 * of that build, which may differ from the configured ones.
	 */
	directories?: { distDir: string; workDir: string };
};
