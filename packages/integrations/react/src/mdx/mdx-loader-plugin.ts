import type { CompileOptions } from '@mdx-js/mdx';
import { createMdxLoaderPlugin as createMdxLoaderPluginCore } from '@ecopages/mdx/core';

export interface CreateReactMdxLoaderPluginOptions {
	compilerOptions?: CompileOptions;
	projectRoot: string;
}

export function createReactMdxLoaderPlugin(options: CreateReactMdxLoaderPluginOptions) {
	return createMdxLoaderPluginCore({
		name: 'react-mdx-loader',
		integrationName: 'react',
		compilerOptions: options.compilerOptions,
		defaultMdExtensions: [],
		projectRoot: options.projectRoot,
	});
}
