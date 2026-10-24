import type { AssetDefinition } from '@ecopages/core/integration';
import type { EcoBuildPlugin } from '@ecopages/core/integration';
import type { MdxCompilerOptionsInput } from '@ecopages/mdx/core';
import type { ReactRouterAdapter } from '../contracts/router-adapter.ts';
import type { HmrPageMetadataCache } from '../hmr/page-metadata-cache.ts';
import type { ReactPluginRuntimeModule, ResolvedReactPluginRuntimeModule } from '../bundling/runtime-modules.ts';

export type ReactMdxOptions = MdxCompilerOptionsInput;

/**
 * Options for the React plugin.
 */
export type ReactPluginOptions = {
	extensions?: string[];
	dependencies?: AssetDefinition[];
	/**
	 * When true, always emit the page browser graph / hydration assets for React
	 * page entries, even when the page does not declare `dependencies.modules`
	 * and no router adapter is configured.
	 *
	 * @remarks
	 * This does not skip the client-graph AST boundary. Server-only
	 * `eco.page(...)` options such as `middleware` and `requires` are still
	 * stripped from browser bundles.
	 *
	 * With a router adapter, page hydration is already always enabled, so this
	 * option is redundant for SPA apps.
	 *
	 * @default false
	 */
	explicitGraph?: boolean;
	/**
	 * Router adapter for SPA navigation.
	 * When provided, pages with layouts will be wrapped in the router for client-side navigation.
	 * @example
	 * ```ts
	 * import { ecoRouter } from '@ecopages/react-router';
	 * reactPlugin({ router: ecoRouter() })
	 * ```
	 */
	router?: ReactRouterAdapter;
	/**
	 * Optional shared browser runtime vendors.
	 *
	 * @remarks
	 * Packages listed here use one vendor URL across page browser graphs. Add
	 * singleton packages such as TanStack Query or MobX when pages and layouts
	 * need to share the same module instance; layouts do not infer these entries.
	 *
	 * @example
	 * ```ts
	 * reactPlugin({
	 *   router: ecoRouter(),
	 *   runtimeModules: ['@tanstack/react-query'],
	 * });
	 * ```
	 *
	 * Register the exact specifier imported by the page or layout. Package
	 * subpaths are separate module contracts and need separate entries.
	 *
	 * @example Advanced vendor config
	 * ```ts
	 * runtimeModules: [
	 *   { specifier: '@acme/ui', outputName: 'acme-ui' },
	 * ]
	 * ```
	 */
	runtimeModules?: ReactPluginRuntimeModule[];
	/**
	 * MDX configuration for handling .mdx files within the React plugin.
	 * When configured, MDX files are treated as React pages with full router support.
	 * @example
	 * ```ts
	 * reactPlugin({
	 *   router: ecoRouter(),
	 *   mdx: {
	 *     extensions: ['.mdx', '.md'],
	 *     remarkPlugins: [remarkGfm],
	 *     rehypePlugins: [[rehypePrettyCode, { theme: '...' }]],
	 *   }
	 * })
	 * ```
	 */
	mdx?: ReactMdxOptions;
	/**
	 * How long server rendering waits for Suspense before serving unfinished
	 * boundaries as their fallback.
	 *
	 * @remarks
	 * React's documented prerender abort delay is 10 seconds. One limit covers
	 * every React tree of a Page render. A `React.lazy()` import or suspending
	 * promise that never settles then leaves that boundary in its fallback for
	 * the browser to retry; the rest of the Page is served. A tree still waiting
	 * outside every boundary fails the render. Must be a whole number from 1 to
	 * 2147483647, the longest Node timer delay.
	 *
	 * @default 10000
	 */
	renderTimeoutMs?: number;
};

export type ReactRendererConfig = {
	routerAdapter?: ReactRouterAdapter;
	runtimeModules?: ResolvedReactPluginRuntimeModule[];
	/**
	 * Returns the plugin-owned MDX loader, creating it on first call. Set only
	 * when MDX is enabled.
	 *
	 * @remarks
	 * Server builds, browser bundles and HMR rebuilds all use this one loader, so
	 * they share its compile cache.
	 */
	getMdxLoaderPlugin?: () => EcoBuildPlugin;
	mdxExtensions?: string[];
	hmrPageMetadataCache?: HmrPageMetadataCache;
	/**
	 * When true, always emit page browser graph / hydration assets for React pages.
	 *
	 * @remarks
	 * Mapped from the public `explicitGraph` plugin option. Does not skip the
	 * client-graph AST strip of server-only `eco.page(...)` options.
	 */
	forceBrowserGraph?: boolean;
	/**
	 * How long server rendering waits for Suspense, in milliseconds.
	 *
	 * @remarks
	 * Mapped from the public `renderTimeoutMs` plugin option. Unfinished
	 * boundaries are served as their fallback when the limit fires.
	 */
	renderTimeoutMs?: number;
};
