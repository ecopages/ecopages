import type { CompileOptions } from '@mdx-js/mdx';
import type { RequestPipelineMetricsState } from '@ecopages/core/diagnostics/request-pipeline-metrics';
import { createMdxLoaderPlugin as createMdxLoaderPluginCore } from '@ecopages/mdx/core';

export interface CreateReactMdxLoaderPluginOptions {
	compilerOptions?: CompileOptions;
	projectRoot: string;
	requestPipelineMetrics: RequestPipelineMetricsState;
}

export function createReactMdxLoaderPlugin(options: CreateReactMdxLoaderPluginOptions) {
	return createMdxLoaderPluginCore({
		name: 'react-mdx-loader',
		integrationName: 'react',
		compilerOptions: options.compilerOptions,
		defaultMdExtensions: [],
		projectRoot: options.projectRoot,
		requestPipelineMetrics: options.requestPipelineMetrics,
	});
}
