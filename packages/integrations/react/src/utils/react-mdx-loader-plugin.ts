import type { CompileOptions } from '@mdx-js/mdx';
import { createMdxLoaderPlugin as createMdxLoaderPluginCore } from '@ecopages/mdx-core';

export function createReactMdxLoaderPlugin(compilerOptions?: CompileOptions) {
	return createMdxLoaderPluginCore({
		name: 'react-mdx-loader',
		compilerOptions,
		defaultMdExtensions: [],
	});
}
