import type { EcoComponent, EcoComponentConfig, GetMetadata } from '@ecopages/core';
import type { EcoPagesAppConfig } from '@ecopages/core/internal-types';
import type { IntegrationPluginConfig } from '@ecopages/core/plugins/integration-plugin';
import type { AssetProcessingService, ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import type { CompileOptions } from '@mdx-js/mdx';

export type MDXPluginConfig = Partial<Omit<IntegrationPluginConfig, 'name'>> & {
	compilerOptions?: CompileOptions;
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
