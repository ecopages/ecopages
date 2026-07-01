import path from 'node:path';
import type { CompileOptions } from '@mdx-js/mdx';
import type { JsxImportSource } from './jsx-import-source.ts';

export type { JsxImportSource, KnownJsxImportSource } from './jsx-import-source.ts';

export interface MdxCompilerOptionsInput {
	compilerOptions?: CompileOptions;
	remarkPlugins?: CompileOptions['remarkPlugins'];
	rehypePlugins?: CompileOptions['rehypePlugins'];
	recmaPlugins?: CompileOptions['recmaPlugins'];
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

	const mergedRemark = mergePluginLists(compilerOptions?.remarkPlugins, remarkPlugins);
	const mergedRehype = mergePluginLists(compilerOptions?.rehypePlugins, rehypePlugins);
	const mergedRecma = mergePluginLists(compilerOptions?.recmaPlugins, recmaPlugins);

	if (mergedRemark) resolved.remarkPlugins = mergedRemark;
	if (mergedRehype) resolved.rehypePlugins = mergedRehype;
	if (mergedRecma) resolved.recmaPlugins = mergedRecma;

	return resolved;
}
