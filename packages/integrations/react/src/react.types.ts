import type { AssetDefinition } from '@ecopages/core/services/asset-processing-service';
import type { CompileOptions } from '@mdx-js/mdx';
import type { ReactRouterAdapter } from './router-adapter.ts';
import type { ReactHmrPageMetadataCache } from './services/react-hmr-page-metadata-cache.ts';

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
	mdxCompilerOptions?: CompileOptions;
	mdxExtensions?: string[];
	hmrPageMetadataCache?: ReactHmrPageMetadataCache;
	explicitGraphEnabled?: boolean;
};
