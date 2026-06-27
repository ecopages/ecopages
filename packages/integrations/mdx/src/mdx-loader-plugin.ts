import type { CompileOptions } from '@mdx-js/mdx';
import { createMdxLoaderPlugin as createMdxLoaderPluginCore } from '@ecopages/mdx-core';

export function createMdxLoaderPlugin(compilerOptions?: CompileOptions) {
	return createMdxLoaderPluginCore({
		name: 'mdx-loader',
		compilerOptions,
		defaultMdExtensions: ['.md'],
	});
}
