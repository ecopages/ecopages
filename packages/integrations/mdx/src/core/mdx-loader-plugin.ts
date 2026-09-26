import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import { attributeMdxComponentIdentity } from '@ecopages/core';
import { type CompileOptions, compile } from '@mdx-js/mdx';
import { recordMdxTransform } from '@ecopages/core/diagnostics/request-pipeline-metrics';
import sourceMap from 'source-map';
import { VFile } from 'vfile';
import { createMdxExtensionFilter, resolveCompileFormat, resolveLoaderExtensions } from './mdx-utils.ts';

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

type MdxCompileCacheEntry = {
	source: string;
	contents: string;
	map?: unknown;
};

/**
 * Creates an MDX loader that compiles each file once per source revision.
 *
 * @remarks
 * The loader owns its compile cache. Its compiler options never change, so the
 * cache is keyed by file path and an entry is reused while the source is
 * unchanged. Create one loader per integration and reuse it for server builds,
 * browser bundles and HMR rebuilds so they share compiles. A new loader, for
 * example after a config reload, starts with an empty cache.
 *
 * Only the MDX compile is cached. Component identity attribution runs on every
 * load, so changes to imported components apply without a recompile.
 */
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
	const compileCache = new Map<string, MdxCompileCacheEntry>();

	return {
		name,
		setup(build) {
			build.onLoad({ filter }, async (args) => {
				const filePath = args.path.includes('?') ? args.path.split('?')[0] : args.path;
				const source = await readFile(filePath, 'utf-8');
				let cached = compileCache.get(filePath);
				if (cached?.source !== source) {
					const compiled = await compile(new VFile({ path: filePath, value: source }), {
						...compilerOptions,
						format: resolveCompileFormat(filePath, compilerOptions),
						SourceMapGenerator: sourceMap.SourceMapGenerator,
					});
					cached = { source, contents: String(compiled.value), map: compiled.map };
					compileCache.set(filePath, cached);
				}
				recordMdxTransform();

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
					loader,
					resolveDir: path.dirname(args.path),
				};
			});
		},
	};
}
