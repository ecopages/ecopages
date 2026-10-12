import path from 'node:path';
import type { CompileOptions } from '@mdx-js/mdx';
import type { JsxImportSource } from './jsx-import-source.ts';

export type { JsxImportSource, KnownJsxImportSource } from './jsx-import-source.ts';

type MdxCompilerOptions = Omit<
	CompileOptions,
	'jsxImportSource' | 'jsxRuntime' | 'remarkPlugins' | 'rehypePlugins' | 'recmaPlugins'
> & {
	remarkPlugins?: never;
	rehypePlugins?: never;
	recmaPlugins?: never;
};

/** Shared options for integrations that own an MDX compilation pipeline.
 *
 * @remarks Keep remark, rehype, and recma plugin lists at this level. They are
 * excluded from `compilerOptions` so each plugin list has one accepted location.
 */
export interface MdxCompilerOptionsInput {
	compilerOptions?: MdxCompilerOptions;
	remarkPlugins?: CompileOptions['remarkPlugins'];
	rehypePlugins?: CompileOptions['rehypePlugins'];
	recmaPlugins?: CompileOptions['recmaPlugins'];
	/**
	 * Extensions owned by the calling integration's MDX pipeline.
	 *
	 * @remarks
	 * When set, these replace `compilerOptions.mdxExtensions` on the resolved
	 * options so MDX loader filters cover exactly the declared files. They are
	 * not merged: `extensions: ['.react.mdx']` must not also claim plain `.mdx`
	 * just because `compilerOptions.mdxExtensions` still lists it.
	 */
	extensions?: string[];
}

export const mergePluginLists = <T>(...lists: Array<readonly T[] | null | undefined>): T[] | undefined => {
	const merged = lists.flatMap((list) => (list ? [...list] : []));
	return merged.length > 0 ? merged : undefined;
};

export const appendMdxExtensions = (target: string[], mdxExtensions: string[]): void => {
	for (const extension of mdxExtensions) {
		if (!target.includes(extension)) {
			target.push(extension);
		}
	}
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const createMdxExtensionFilter = (extensions: string[], options?: { allowQueryString?: boolean }): RegExp => {
	const escaped = extensions.map(escapeRegex);
	const suffix = options?.allowQueryString ? '(\\?.*)?$' : '$';
	return new RegExp(`(${escaped.join('|')})${suffix}`);
};

export function resolveLoaderExtensions(
	compilerOptions?: CompileOptions,
	options?: { defaultMdExtensions?: string[] },
): string[] {
	const mdxExtensions = compilerOptions?.mdxExtensions ?? ['.mdx'];
	const mdExtensions = compilerOptions?.mdExtensions ?? options?.defaultMdExtensions ?? [];
	return [...mdxExtensions, ...mdExtensions];
}

/**
 * Resolves the MDX parser mode for a source file.
 *
 * Files with a `.md` extension must be forced into `mdx` mode when the caller
 * explicitly opts them into the MDX pipeline. Leaving the compiler in `detect`
 * mode would treat `.md` files as plain markdown, causing top-level ESM such as
 * `import` and `export` to render as text instead of being compiled.
 */
export function resolveCompileFormat(filePath: string, compilerOptions?: CompileOptions): CompileOptions['format'] {
	const configuredFormat = compilerOptions?.format;

	if (configuredFormat && configuredFormat !== 'detect') {
		return configuredFormat;
	}

	return path.extname(filePath).toLowerCase() === '.md' ? 'mdx' : configuredFormat;
}

/**
 * Resolves MDX compiler options for one integration-owned loader.
 *
 * @remarks
 * When `mdxOptions.extensions` is set, it replaces `compilerOptions.mdxExtensions`
 * on the resolved options instead of merging with it.
 */
export function resolveMdxCompilerOptions(
	mdxOptions: MdxCompilerOptionsInput,
	options: {
		jsxImportSource: JsxImportSource;
		jsxRuntime?: CompileOptions['jsxRuntime'];
		defaults?: CompileOptions;
	},
): CompileOptions {
	const { compilerOptions, remarkPlugins, rehypePlugins, recmaPlugins } = mdxOptions;
	const resolved: CompileOptions = {
		...options.defaults,
		...compilerOptions,
		jsxImportSource: options.jsxImportSource,
		jsxRuntime: options.jsxRuntime ?? 'automatic',
		development: process.env.NODE_ENV === 'development',
	};

	const resolvedRemark = mergePluginLists(remarkPlugins);
	const resolvedRehype = mergePluginLists(rehypePlugins);
	const resolvedRecma = mergePluginLists(recmaPlugins);

	if (resolvedRemark) resolved.remarkPlugins = resolvedRemark;
	if (resolvedRehype) resolved.rehypePlugins = resolvedRehype;
	if (resolvedRecma) resolved.recmaPlugins = resolvedRecma;
	if (mdxOptions.extensions) resolved.mdxExtensions = mdxOptions.extensions;

	return resolved;
}
