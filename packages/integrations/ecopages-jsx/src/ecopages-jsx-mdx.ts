import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CompileOptions } from '@mdx-js/mdx';
import type { EcoComponent, EcoComponentConfig, EcoFunctionComponent, EcoPageFile, GetMetadata } from '@ecopages/core';
import { rapidhash } from '@ecopages/core/hash';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import type { JsxRenderable } from '@ecopages/jsx';
import { VFile } from 'vfile';
import { ECOPAGES_JSX_PLUGIN_NAME } from './ecopages-jsx.constants.ts';
import type { EcopagesJsxMdxCompileOptions, EcopagesJsxMdxOptions } from './ecopages-jsx.types.ts';

type MdxPluginList = NonNullable<CompileOptions['remarkPlugins']>;

export type ResolvedMdxCompileOptions = EcopagesJsxMdxCompileOptions &
	Pick<CompileOptions, 'jsxImportSource' | 'jsxRuntime'>;

export type AsyncEcoComponent<P = Record<string, unknown>, R = JsxRenderable> = EcoFunctionComponent<P, R | Promise<R>>;

export type EcopagesJsxMdxPageModule = EcoPageFile<{
	config?: EcoComponentConfig;
	layout?: EcoComponent;
	getMetadata?: GetMetadata;
}>;

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const mergePluginLists = <T>(...lists: Array<readonly T[] | null | undefined>): T[] | undefined => {
	const merged = lists.flatMap((list) => (list ? [...list] : []));
	return merged.length > 0 ? merged : undefined;
};

export const createMdxExtensionFilter = (extensions: string[], options?: { allowQueryString?: boolean }): RegExp => {
	const escaped = extensions.map(escapeRegex);
	const suffix = options?.allowQueryString ? '(\\?.*)?$' : '$';
	return new RegExp(`(${escaped.join('|')})${suffix}`);
};

export const appendMdxExtensions = (target: string[], mdxExtensions: string[]): void => {
	for (const ext of mdxExtensions) {
		if (!target.includes(ext)) {
			target.push(ext);
		}
	}
};

export const resolveMdxCompilerOptions = (mdxOptions: EcopagesJsxMdxOptions): ResolvedMdxCompileOptions => {
	const { compilerOptions, remarkPlugins, rehypePlugins, recmaPlugins } = mdxOptions;
	const resolved: ResolvedMdxCompileOptions = {
		format: 'detect',
		outputFormat: 'program',
		...compilerOptions,
		jsxImportSource: '@ecopages/jsx',
		jsxRuntime: 'automatic',
		development: process.env.NODE_ENV === 'development',
	};

	const mergedRemark = mergePluginLists<MdxPluginList[number]>(compilerOptions?.remarkPlugins, remarkPlugins);
	const mergedRehype = mergePluginLists<MdxPluginList[number]>(compilerOptions?.rehypePlugins, rehypePlugins);
	const mergedRecma = mergePluginLists<MdxPluginList[number]>(compilerOptions?.recmaPlugins, recmaPlugins);

	if (mergedRemark) resolved.remarkPlugins = mergedRemark;
	if (mergedRehype) resolved.rehypePlugins = mergedRehype;
	if (mergedRecma) resolved.recmaPlugins = mergedRecma;

	return resolved;
};

export const createMdxLoaderPlugin = (
	compilerOptions: ResolvedMdxCompileOptions,
	extensions: string[],
): EcoBuildPlugin => {
	const filter = createMdxExtensionFilter(extensions, { allowQueryString: true });

	return {
		name: 'ecopages-jsx-mdx-loader',
		setup(build) {
			build.onLoad({ filter }, async (args) => {
				const { compile } = await import('@mdx-js/mdx');
				const filePath = args.path.includes('?') ? args.path.split('?')[0] : args.path;
				const source = await readFile(filePath, 'utf-8');
				const compiled = await compile(new VFile({ value: source, path: filePath }), compilerOptions);

				return {
					contents: String(compiled.value),
					loader: 'js',
					resolveDir: path.dirname(filePath),
				};
			});
		},
	};
};

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
		...(module.layout ? { layout: module.layout } : {}),
		__eco: module.config?.__eco ??
			Page.config?.__eco ?? {
				id: String(rapidhash(file)),
				file,
				integration: ECOPAGES_JSX_PLUGIN_NAME,
			},
	};
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
