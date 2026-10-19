import type { EcoComponent, EcoComponentConfig, GetMetadata } from '@ecopages/core';
import type { IntegrationPluginConfig } from '@ecopages/core/integration';
import type { CompileOptions } from '@mdx-js/mdx';
import type { ThirdPartyJsxImportSource } from './core/jsx-import-source.ts';

export type { JsxImportSource, KnownJsxImportSource, ThirdPartyJsxImportSource } from './core/jsx-import-source.ts';

/**
 * MDX compiler options for standalone `mdxPlugin()`.
 *
 * `jsxImportSource` must name a third-party JSX runtime. Ecopages-owned runtimes
 * (`react`, `@ecopages/jsx`) are configured through their owning integration plugins.
 *
 * @remarks
 * `remarkPlugins`, `rehypePlugins` and `recmaPlugins` belong in this object. Unlike the React and Ecopages JSX
 * MDX options, the standalone plugin has no top-level plugin lists.
 */
export type StandaloneMdxCompilerOptions = Omit<CompileOptions, 'jsxImportSource' | 'jsxRuntime'> & {
	jsxImportSource: ThirdPartyJsxImportSource;
	jsxRuntime?: CompileOptions['jsxRuntime'];
};

export type MDXPluginConfig = Partial<Omit<IntegrationPluginConfig, 'name' | 'compilerOptions'>> & {
	compilerOptions: StandaloneMdxCompilerOptions;
};

/**
 * A structure representing an MDX file.
 */
export type MDXFile = {
	default: EcoComponent;
	config?: EcoComponentConfig;
	getMetadata: GetMetadata;
};
