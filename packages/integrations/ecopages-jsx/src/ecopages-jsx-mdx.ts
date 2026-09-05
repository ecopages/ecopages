import type { CompileOptions } from '@mdx-js/mdx';
import type { EcoComponent, EcoComponentConfig, EcoFunctionComponent, EcoPageFile, GetMetadata } from '@ecopages/core';
import { ensurePageConfigLayouts } from '@ecopages/core/eco/page-layout-normalization';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import {
	appendMdxExtensions,
	createMdxExtensionFilter,
	createMdxLoaderPlugin as createMdxLoaderPluginCore,
	resolveMdxCompilerOptions as resolveMdxCompilerOptionsCore,
} from '@ecopages/mdx/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ECOPAGES_JSX_PLUGIN_NAME } from './ecopages-jsx.constants.ts';
import type { EcopagesJsxMdxCompileOptions, EcopagesJsxMdxOptions } from './ecopages-jsx.types.ts';

export type ResolvedMdxCompileOptions = EcopagesJsxMdxCompileOptions &
	Pick<CompileOptions, 'jsxImportSource' | 'jsxRuntime'>;

export type AsyncEcoComponent<P = Record<string, unknown>, R = JsxRenderable> = EcoFunctionComponent<P, R | Promise<R>>;

export type EcopagesJsxMdxPageModule = EcoPageFile<{
	config?: EcoComponentConfig;
	layout?: EcoComponent;
	getMetadata?: GetMetadata;
}>;

export { appendMdxExtensions, createMdxExtensionFilter };

export const resolveMdxCompilerOptions = (mdxOptions: EcopagesJsxMdxOptions): ResolvedMdxCompileOptions =>
	resolveMdxCompilerOptionsCore(mdxOptions, {
		jsxImportSource: '@ecopages/jsx',
		defaults: {
			format: 'detect',
			outputFormat: 'program',
		},
	}) as ResolvedMdxCompileOptions;

export interface CreateEcopagesJsxMdxLoaderPluginOptions {
	compilerOptions: ResolvedMdxCompileOptions;
	extensions: string[];
	projectRoot: string;
}

export const createMdxLoaderPlugin = (options: CreateEcopagesJsxMdxLoaderPluginOptions): EcoBuildPlugin =>
	createMdxLoaderPluginCore({
		name: 'ecopages-jsx-mdx-loader',
		integrationName: ECOPAGES_JSX_PLUGIN_NAME,
		compilerOptions: options.compilerOptions,
		extensions: options.extensions,
		includeSourceMap: false,
		loader: 'js',
		projectRoot: options.projectRoot,
	});

export const registerBunMdxPlugin = async (options: CreateEcopagesJsxMdxLoaderPluginOptions): Promise<void> => {
	if (typeof Bun === 'undefined') {
		return;
	}

	const plugin = createMdxLoaderPlugin(options);

	Bun.plugin({
		name: plugin.name,
		setup(build) {
			return plugin.setup(build as any);
		},
	});
};

export const isMdxFile = (filePath: string, extensions: string[]): boolean => {
	return extensions.some((ext) => filePath.endsWith(ext));
};

export const normalizeMdxPageModule = (file: string, module: EcopagesJsxMdxPageModule): EcopagesJsxMdxPageModule => {
	if (typeof module.default !== 'function') {
		throw new TypeError('MDX file must export a callable default component.');
	}

	const Page = module.default;
	const attributedConfig = module.config ?? Page.config;
	if (!attributedConfig?.identity) {
		throw new Error(
			`[ecopages] MDX page "${file}" is missing component identity; the MDX loader must attribute it.`,
		);
	}

	if (module.layout && !(attributedConfig.layouts && attributedConfig.layouts.length > 0)) {
		(attributedConfig as EcoComponentConfig & { layout?: EcoComponent }).layout = module.layout;
	}

	ensurePageConfigLayouts(attributedConfig);
	const wrappedPage: AsyncEcoComponent<Record<string, unknown>> = async (props: Record<string, unknown>) =>
		await Page(props);

	wrappedPage.config = attributedConfig;

	if (module.getMetadata ?? Page.metadata) {
		wrappedPage.metadata = module.getMetadata ?? Page.metadata;
	}

	return {
		...module,
		default: wrappedPage,
		config: attributedConfig,
	};
};
