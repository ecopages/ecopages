import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';
import { type CompileOptions, compile } from '@mdx-js/mdx';
import sourceMap from 'source-map';
import { VFile } from 'vfile';

/**
 * Resolves the MDX parser mode for a source file.
 *
 * Files with a `.md` extension must be forced into `mdx` mode when the caller
 * explicitly opts them into the MDX pipeline. Leaving the compiler in `detect`
 * mode would treat `.md` files as plain markdown, causing top-level ESM such as
 * `import` and `export` to render as text instead of being compiled.
 *
 * @param filePath Absolute or relative source file path.
 * @param compilerOptions User-provided MDX compiler options.
 * @returns The compile format that should be passed to `@mdx-js/mdx`.
 */
function resolveCompileFormat(filePath: string, compilerOptions?: CompileOptions): CompileOptions['format'] {
	const configuredFormat = compilerOptions?.format;

	if (configuredFormat && configuredFormat !== 'detect') {
		return configuredFormat;
	}

	return path.extname(filePath).toLowerCase() === '.md' ? 'mdx' : configuredFormat;
}

export function createMdxLoaderPlugin(compilerOptions?: CompileOptions): EcoBuildPlugin {
	const mdxExtensions = compilerOptions?.mdxExtensions ?? ['.mdx'];
	const mdExtensions = compilerOptions?.mdExtensions ?? ['.md'];
	const allExtensions = [...mdxExtensions, ...mdExtensions];
	const escapedExts = allExtensions.map((ext) => ext.replace('.', '\\.'));
	const filter = new RegExp(`(${escapedExts.join('|')})(\\?.*)?$`);

	return {
		name: 'mdx-loader',
		setup(build) {
			build.onLoad({ filter }, async (args) => {
				const filePath = args.path.includes('?') ? args.path.split('?')[0] : args.path;
				const source = readFileSync(filePath, 'utf-8');
				const file = new VFile({ path: filePath, value: source });

				const compiled = await compile(file, {
					...compilerOptions,
					format: resolveCompileFormat(filePath, compilerOptions),
					SourceMapGenerator: sourceMap.SourceMapGenerator,
				});

				const inlineSourceMap = compiled.map
					? `\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(compiled.map)).toString('base64')}\n`
					: '';

				return {
					contents: `${String(compiled.value)}${inlineSourceMap}`,
					loader: compilerOptions?.jsx ? 'jsx' : 'js',
					resolveDir: path.dirname(args.path),
				};
			});
		},
	};
}
