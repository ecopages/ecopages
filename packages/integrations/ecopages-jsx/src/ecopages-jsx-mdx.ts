import { readFile } from 'node:fs/promises';
import type { CompileOptions } from '@mdx-js/mdx';
import type { EcoComponent, EcoComponentConfig, EcoFunctionComponent, EcoPageFile, GetMetadata } from '@ecopages/core';
import { ensurePageConfigLayouts } from '@ecopages/core/eco/page-layout-normalization';
import { rapidhash } from '@ecopages/core/hash';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import {
	appendMdxExtensions,
	createMdxExtensionFilter,
	createMdxLoaderPlugin as createMdxLoaderPluginCore,
	resolveMdxCompilerOptions as resolveMdxCompilerOptionsCore,
} from '@ecopages/mdx/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { VFile } from 'vfile';
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

export const createMdxLoaderPlugin = (
	compilerOptions: ResolvedMdxCompileOptions,
	extensions: string[],
): EcoBuildPlugin =>
	createMdxLoaderPluginCore({
		name: 'ecopages-jsx-mdx-loader',
		compilerOptions,
		extensions,
		includeSourceMap: false,
		loader: 'js',
	});

export const registerBunMdxPlugin = async (
	compilerOptions: ResolvedMdxCompileOptions,
	extensions: string[],
): Promise<void> => {
	if (typeof Bun === 'undefined') {
		return;
	}

	const filter = createMdxExtensionFilter(extensions);

	Bun.plugin({
		name: 'ecopages-jsx-mdx',
		setup(build) {
			build.onLoad({ filter }, async (args) => {
				const { compile } = await import('@mdx-js/mdx');
				const source = await readFile(args.path, 'utf-8');
				const compiled = await compile(new VFile({ value: source, path: args.path }), compilerOptions);

				return { contents: String(compiled.value), loader: 'js' as const };
			});
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
	const normalizedConfig: EcoComponentConfig = {
		...(module.config ?? Page.config ?? {}),
		identity: module.config?.identity ??
			Page.config?.identity ?? {
				id: String(rapidhash(file)),
				file,
				integration: ECOPAGES_JSX_PLUGIN_NAME,
			},
	};

	if (module.layout && !(normalizedConfig.layouts && normalizedConfig.layouts.length > 0)) {
		(normalizedConfig as EcoComponentConfig & { layout?: EcoComponent }).layout = module.layout;
	}

	ensurePageConfigLayouts(normalizedConfig);
	const wrappedPage: AsyncEcoComponent<Record<string, unknown>> = async (props: Record<string, unknown>) =>
		await Page(props);

	wrappedPage.config = normalizedConfig;

	if (module.getMetadata ?? Page.metadata) {
		wrappedPage.metadata = module.getMetadata ?? Page.metadata;
	}

	return {
		...module,
		default: wrappedPage,
		config: normalizedConfig,
	};
};
