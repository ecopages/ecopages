import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';
import { type CompileOptions, compile } from '@mdx-js/mdx';
import { SourceMapGenerator } from 'source-map';
import { VFile } from 'vfile';

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
					SourceMapGenerator,
				});

				const sourceMap = compiled.map
					? `\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(compiled.map)).toString('base64')}\n`
					: '';

				return {
					contents: `${String(compiled.value)}${sourceMap}`,
					loader: compilerOptions?.jsx ? 'jsx' : 'js',
					resolveDir: path.dirname(args.path),
				};
			});
		},
	};
}
