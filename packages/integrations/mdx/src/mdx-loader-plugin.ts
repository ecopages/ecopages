import type { CompileOptions } from '@mdx-js/mdx';
import { createMdxLoaderPlugin as createMdxLoaderPluginCore } from './core/mdx-loader-plugin.ts';

export function createMdxLoaderPlugin(compilerOptions?: CompileOptions) {
	return createMdxLoaderPluginCore({
		name: 'mdx-loader',
		compilerOptions,
		defaultMdExtensions: ['.md'],
	});
}
