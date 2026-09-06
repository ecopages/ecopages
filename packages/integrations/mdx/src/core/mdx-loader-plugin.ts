import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import { attributeMdxComponentIdentity } from '@ecopages/core';
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
	projectRoot: string;
	integrationName?: string;
	compilerOptions?: CompileOptions;
	extensions?: string[];
	defaultMdExtensions?: string[];
	includeSourceMap?: boolean;
	loader?: 'js' | 'jsx';
}

export function createMdxLoaderPlugin(options: CreateMdxLoaderPluginOptions): EcoBuildPlugin {
	const {
		name,
		projectRoot,
		integrationName = 'MDX',
		compilerOptions,
		extensions = resolveLoaderExtensions(compilerOptions, {
			defaultMdExtensions: options.defaultMdExtensions,
		}),
		includeSourceMap = true,
		loader = compilerOptions?.jsx ? 'jsx' : 'js',
	} = options;

	if (!projectRoot) {
		throw new Error(`[ecopages] Cannot create MDX loader plugin "${name}": projectRoot is required.`);
	}

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
				let cached = readMdxTransformCache(cacheKey);
				if (cached) {
					recordMdxTransform();
				} else {
					const file = new VFile({ path: filePath, value: source });
					recordMdxCompileInvocation();
					const compiled = await compile(file, compileOptions);
					recordMdxTransform();
					cached = {
						contents: String(compiled.value),
						loader,
						map: compiled.map,
					};
					writeMdxTransformCache(cacheKey, cached);
				}

				const transformed = attributeMdxComponentIdentity(
					cached.contents,
					filePath,
					integrationName,
					projectRoot,
				);

				const inlineSourceMap =
					includeSourceMap && cached.map
						? `\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(cached.map)).toString('base64')}\n`
						: '';

				return {
					contents: `${transformed}${inlineSourceMap}`,
					loader: cached.loader ?? loader,
					resolveDir: path.dirname(args.path),
				};
			});
		},
	};
}
