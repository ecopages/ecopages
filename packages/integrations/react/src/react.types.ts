import type { AssetDefinition } from '@ecopages/core/services/asset-processing-service';
import type { CompileOptions } from '@mdx-js/mdx';
import type { ReactRouterAdapter } from './router-adapter.ts';
import type { ReactHmrPageMetadataCache } from './services/react-hmr-page-metadata-cache.ts';
import type {
	ReactPluginRuntimeModule,
	ResolvedReactPluginRuntimeModule,
} from './utils/react-plugin-runtime-modules.ts';

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
	 * Enables explicit client graph mode for React page entries.
	 *
	 * When enabled, React page-entry bundling relies on explicit dependency declarations
	 * and skips AST-based `middleware`/`requires` stripping in the React path.
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
	 * `eco.layout({ ... })`. When any layout opts in, only flagged layouts are used
	 * as discovery roots.
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
	hmrPageMetadataCache?: ReactHmrPageMetadataCache;
	explicitGraphEnabled?: boolean;
};
