import type { AssetDefinition } from '@ecopages/core/services/asset-processing-service';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import type { CompileOptions } from '@mdx-js/mdx';
import type { ReactRouterAdapter } from '../contracts/router-adapter.ts';
import type { HmrPageMetadataCache } from '../hmr/page-metadata-cache.ts';
import type { ReactPluginRuntimeModule, ResolvedReactPluginRuntimeModule } from '../bundling/runtime-modules.ts';

/**
 * MDX configuration options for the React plugin.
 */
export type ReactMdxOptions = {
	/**
	 * Whether to enable MDX support.
	 * @default false
	 */
	enabled: boolean;
	/**
	 * Compiler options for MDX.
	 * @default undefined
	 */
	compilerOptions?: Omit<CompileOptions, 'jsxImportSource' | 'jsxRuntime'>;
	/**
	 * Remark plugins.
	 * @default undefined
	 */
	remarkPlugins?: CompileOptions['remarkPlugins'];
	/**
	 * Rehype plugins.
	 * @default undefined
	 */
	rehypePlugins?: CompileOptions['rehypePlugins'];
	/**
	 * Recma plugins.
	 * @default undefined
	 */
	recmaPlugins?: CompileOptions['recmaPlugins'];
	/**
	 * Custom extensions to be treated as MDX files.
	 * @default ['.mdx']
	 */
	extensions?: string[];
};

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
	 * When enabled, MDX files are treated as React pages with full router support.
	 * @example
	 * ```ts
	 * reactPlugin({
	 *   router: ecoRouter(),
	 *   mdx: {
	 *     enabled: true,
	 *     extensions: ['.mdx', '.md'],
	 *     remarkPlugins: [remarkGfm],
	 *     rehypePlugins: [[rehypePrettyCode, { theme: '...' }]],
	 *   }
	 * })
	 * ```
	 */
	mdx?: ReactMdxOptions;
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
};
