import type { AssetDefinition } from '@ecopages/core/services/asset-processing-service';
import type { CompileOptions } from '@mdx-js/mdx';
import type { ReactRouterAdapter } from '../contracts/router-adapter.ts';
import type { HmrPageMetadataCache } from '../hmr/page-metadata-cache.ts';
import type { ReactPluginRuntimeModule, ResolvedReactPluginRuntimeModule } from '../bundling/runtime-modules.ts';
import type { ClientGraphBoundaryCache } from '../client-graph/boundary-cache.ts';

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
	 * With `router`, npm packages reachable from `eco.layout()` **render graphs**
	 * under the app's configured `layouts/` and `components/` directories are
	 * discovered automatically and registered as shared vendors (alongside React
	 * and React DOM). This prevents duplicate module instances when persisted
	 * layouts stay mounted across SPA navigation.
	 *
	 * Without `router`, only explicit entries here are vendored.
	 *
	 * @remarks
	 * Discovery follows client reachability from each layout's `render` path,
	 * resolves relative and tsconfig path aliases, and collects npm package roots
	 * imported from provider/context modules in that graph (for example files named
	 * `query-provider.tsx` or modules using `QueryClientProvider` / `createContext`).
	 * It does not vendor every npm dependency reachable from shell or page UI.
	 *
	 * Layouts that mount shared runtime state should set `runtimeProvider: true` in
	 * `eco.layout({ ... })`. Flagged layouts become the only discovery roots and
	 * vendor every reachable npm package in that layout graph. When no layout opts
	 * in, discovery falls back to scanning all layouts with provider-scoped npm
	 * collection.
	 *
	 * @example
	 * ```ts
	 * export const QueryRootLayout = eco.layout({
	 *   runtimeProvider: true,
	 *   render: ({ children }) => <QueryProvider>{children}</QueryProvider>,
	 * });
	 *
	 * reactPlugin({
	 *   router: ecoRouter(),
	 * });
	 * ```
	 *
	 * @example Advanced vendor config
	 * ```ts
	 * runtimeModules: [
	 *   { specifier: '@acme/ui', outputName: 'acme-ui', externals: ['react'] },
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
	mdxCompilerOptions?: CompileOptions;
	mdxExtensions?: string[];
	hmrPageMetadataCache?: HmrPageMetadataCache;
	/** Persistent React-plugin-owned cache shared by bundles and HMR transforms. */
	clientGraphBoundaryCache?: ClientGraphBoundaryCache;
	/**
	 * When true, always emit page browser graph / hydration assets for React pages.
	 *
	 * @remarks
	 * Mapped from the public `explicitGraph` plugin option. Does not skip the
	 * client-graph AST strip of server-only `eco.page(...)` options.
	 */
	forceBrowserGraph?: boolean;
};
