import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import type { CompileOptions } from '@mdx-js/mdx';
import { createMdxLoaderPlugin as createMdxLoaderPluginCore } from './core/mdx-loader-plugin.ts';

export type MdxLoaderPluginOptions = {
	compilerOptions?: CompileOptions;
	projectRoot: string;
	defaultMdExtensions?: string[];
	extensions?: string[];
	includeSourceMap?: boolean;
	loader?: 'js' | 'jsx';
};

export function createMdxLoaderPlugin(options: MdxLoaderPluginOptions): EcoBuildPlugin {
	return createMdxLoaderPluginCore({
		name: 'mdx-loader',
		integrationName: 'MDX',
		compilerOptions: options.compilerOptions,
		defaultMdExtensions: options.defaultMdExtensions ?? ['.md'],
		projectRoot: options.projectRoot,
		extensions: options.extensions,
		includeSourceMap: options.includeSourceMap,
		loader: options.loader,
	});
}
