import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import { type CompileOptions, compile } from '@mdx-js/mdx';
import { recordMdxTransform } from '@ecopages/core/diagnostics/request-pipeline-metrics';
import sourceMap from 'source-map';
import { VFile } from 'vfile';
import { createMdxExtensionFilter, resolveCompileFormat, resolveLoaderExtensions } from './mdx-utils.ts';
import {
	createMdxTransformCacheKey,
	readMdxTransformCache,
	recordMdxCompileInvocation,
	writeMdxTransformCache,
} from './mdx-transform-cache.ts';

export interface CreateMdxLoaderPluginOptions {
	name: string;
	compilerOptions?: CompileOptions;
	extensions?: string[];
	defaultMdExtensions?: string[];
	includeSourceMap?: boolean;
	loader?: 'js' | 'jsx';
}

export function createMdxLoaderPlugin(options: CreateMdxLoaderPluginOptions): EcoBuildPlugin {
	const {
		name,
		compilerOptions,
		extensions = resolveLoaderExtensions(compilerOptions, {
			defaultMdExtensions: options.defaultMdExtensions,
		}),
		includeSourceMap = true,
		loader = compilerOptions?.jsx ? 'jsx' : 'js',
	} = options;

	const filter = createMdxExtensionFilter(extensions, { allowQueryString: true });

	return {
		name,
		setup(build) {
			build.onLoad({ filter }, async (args) => {
				const filePath = args.path.includes('?') ? args.path.split('?')[0] : args.path;
				const source = await readFile(filePath, 'utf-8');
				const compileOptions = {
					...compilerOptions,
					format: resolveCompileFormat(filePath, compilerOptions),
					SourceMapGenerator: sourceMap.SourceMapGenerator,
				};
				const cacheKey = createMdxTransformCacheKey(filePath, source, compileOptions);
				const cached = readMdxTransformCache(cacheKey);
				if (cached) {
					recordMdxTransform();
					return {
						...cached,
						resolveDir: path.dirname(args.path),
					};
				}

				const file = new VFile({ path: filePath, value: source });
				recordMdxCompileInvocation();
				const compiled = await compile(file, compileOptions);
				recordMdxTransform();

				const inlineSourceMap =
					includeSourceMap && compiled.map
						? `\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(compiled.map)).toString('base64')}\n`
						: '';

				const result = {
					contents: `${String(compiled.value)}${inlineSourceMap}`,
					loader,
					resolveDir: path.dirname(args.path),
				};
				writeMdxTransformCache(cacheKey, {
					contents: result.contents,
					loader: result.loader,
				});
				return result;
			});
		},
	};
}
