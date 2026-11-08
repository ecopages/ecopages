import type { CompileOptions } from '@mdx-js/mdx';
import type { RequestPipelineMetricsState } from '@ecopages/core/build';
import type { StylesheetKinds } from '@ecopages/core/integration';
import { createMdxLoaderPlugin as createMdxLoaderPluginCore } from '@ecopages/mdx/core';

export interface CreateReactMdxLoaderPluginOptions {
	compilerOptions?: CompileOptions;
	projectRoot: string;
	requestPipelineMetrics: RequestPipelineMetricsState;
	stylesheets?: StylesheetKinds;
}

export function createReactMdxLoaderPlugin(options: CreateReactMdxLoaderPluginOptions) {
	return createMdxLoaderPluginCore({
		name: 'react-mdx-loader',
		integrationName: 'react',
		compilerOptions: options.compilerOptions,
		defaultMdExtensions: [],
		projectRoot: options.projectRoot,
		requestPipelineMetrics: options.requestPipelineMetrics,
		stylesheets: options.stylesheets,
	});
}
