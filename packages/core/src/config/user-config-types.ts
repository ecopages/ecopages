import type { BuildOwnership } from '../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../build/contracts/build-types.ts';
import type { AnyIntegrationPlugin } from '../plugins/integration-plugin.ts';
import type { AnyProcessor } from '../plugins/processor.ts';
import type { EcoSourceTransform } from '../plugins/source-transform.ts';
import type { CacheConfig } from '../services/cache/cache.types.ts';
import type { EcoPagesAppConfig, RobotsPreference } from '../types/internal-types.ts';
import type { PageMetadataProps, SitemapConfig } from '../types/public-types.ts';

/**
 * Author-owned Ecopages configuration declared in `eco.config.ts`.
 *
 * @remarks
 * Author this object using `defineConfig({ ... })` in `eco.config.ts`.
 * This type excludes resolved absolute paths, derived integration extensions, and runtime
 * services attached during {@link ConfigBuilder.build}.
 *
 * @example
 * ```typescript
 * import { defineConfig } from '@ecopages/core/config';
 * import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
 *
 * export default defineConfig({
 *   rootDir: import.meta.dirname,
 *   baseUrl: process.env.ECOPAGES_BASE_URL ?? 'http://localhost:3000',
 *   integrations: [ecopagesJsxPlugin()],
 * });
 * ```
 */
export type EcoPagesUserConfig = {
	/**
	 * Absolute or relative path to the project root directory.
	 */
	rootDir: string;

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
	 * Directory for static public assets copied directly to `distDir`, relative to `rootDir`.
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
	 * Directory containing layout components, relative to `srcDir`.
	 *
	 * @default 'layouts'
	 */
	layoutsDir?: string;

	/**
	 * Output directory for the production build, relative to `rootDir`.
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
	 * Directory containing island and client components, relative to `srcDir`.
	 *
	 * @default 'components'
	 */
	componentsDir?: string;

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
	 * URL route paths to prewarm in the background when the development server starts.
	 */
	devPrewarmPaths?: string[];

	/**
	 * URL route paths that must complete prewarming before the dev server reports ready.
	 */
	devPrewarmBeforeReadyPaths?: string[];

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
	 * Custom Rolldown/Vite build loaders and asset transforms.
	 */
	loaders?: EcoBuildPlugin[];

	/**
	 * AST transforms applied to source files before compilation (e.g. island script extraction).
	 */
	sourceTransforms?: EcoSourceTransform[];

	/**
	 * Cache policy configuration for page and asset build outputs.
	 */
	cache?: CacheConfig;

	/**
	 * Development toolbar configuration and toggle options.
	 */
	devToolbar?: EcoPagesAppConfig['devToolbar'];

	/**
	 * Experimental runtime or compiler feature flags.
	 */
	experimental?: EcoPagesAppConfig['experimental'];

	/**
	 * Build pipeline ownership mode.
	 *
	 * @default 'rolldown'
	 *
	 * @remarks
	 * Set to `'vite-host'` when running inside Vite (`@ecopages/vite-plugin`), where Vite
	 * owns client and server module transforms.
	 */
	buildOwnership?: BuildOwnership;
};

export type LoadedEcoPagesUserConfig = {
	config: EcoPagesUserConfig;
	configFilePath: string;
};

export type FinalizeEcoPagesConfigOptions = {
	buildOwnership?: BuildOwnership;
};

export type LoadEcoPagesConfigOptions = {
	configFile?: string;
	cwd?: string;
	buildOwnership?: BuildOwnership;
};
