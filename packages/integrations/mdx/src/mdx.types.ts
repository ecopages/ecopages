import type { EcoComponent, EcoComponentConfig, EcoPagesAppConfig, GetMetadata } from '@ecopages/core';
import type { IntegrationPluginConfig } from '@ecopages/core/plugins/integration-plugin';
import type { AssetProcessingService, ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import type { CompileOptions } from '@mdx-js/mdx';
import type { ThirdPartyJsxImportSource } from './core/jsx-import-source.ts';

export type { JsxImportSource, KnownJsxImportSource, ThirdPartyJsxImportSource } from './core/jsx-import-source.ts';

/**
 * MDX compiler options for standalone `mdxPlugin()`.
 *
 * `jsxImportSource` must name a third-party JSX runtime. Ecopages-owned runtimes
 * (`react`, `@ecopages/jsx`) are configured through their owning integration plugins.
 */
export type StandaloneMdxCompilerOptions = Omit<CompileOptions, 'jsxImportSource' | 'jsxRuntime'> & {
	jsxImportSource: ThirdPartyJsxImportSource;
	jsxRuntime?: CompileOptions['jsxRuntime'];
};

export type MDXPluginConfig = Partial<Omit<IntegrationPluginConfig, 'name' | 'compilerOptions'>> & {
	compilerOptions: StandaloneMdxCompilerOptions;
};

export type MDXRendererConfig = {
	compilerOptions?: CompileOptions;
};

export type MDXRendererOptions = {
	appConfig: EcoPagesAppConfig;
	assetProcessingService: AssetProcessingService;
	resolvedIntegrationDependencies: ProcessedAsset[];
	rendererModules?: unknown;
	runtimeOrigin: string;
	mdxConfig?: MDXRendererConfig;
};

/**
 * A structure representing an MDX file.
 */
export type MDXFile = {
	default: EcoComponent;
	config?: EcoComponentConfig;
	getMetadata: GetMetadata;
};
