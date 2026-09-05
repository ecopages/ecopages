import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import type { EcoComponentConfig } from '@ecopages/core';
import type { CompileOptions } from '@mdx-js/mdx';
import { collectPageDeclaredModules, collectPageDeclaredModulesFromModule } from '../client-graph/declared-modules.ts';
import { createReactMdxLoaderPlugin } from '../mdx/mdx-loader-plugin.ts';
import type { HmrPageMetadataCache } from './page-metadata-cache.ts';

export type ReactHmrBuildTarget = {
	entrypointPath: string;
	outputUrl: string;
};

type ImportedReactPageModule = {
	default?: { config?: EcoComponentConfig };
	config?: EcoComponentConfig;
};

export type ReactHmrDevTransformPluginOptions = {
	pageMetadataCache: HmrPageMetadataCache;
	mdxCompilerOptions?: CompileOptions;
	projectRoot: string;
	getBuildPlugins: (declaredModules?: readonly string[]) => EcoBuildPlugin[];
	importNodePageModule: (entrypointPath: string) => Promise<ImportedReactPageModule>;
};

export async function resolveReactDeclaredModulesForEntrypoint(
	options: ReactHmrDevTransformPluginOptions,
	entrypointPath: string,
): Promise<readonly string[]> {
	const cached = options.pageMetadataCache.getDeclaredModules(entrypointPath);
	if (cached) {
		return cached;
	}

	const declaredModules = entrypointPath.endsWith('.mdx')
		? await collectPageDeclaredModules(entrypointPath)
		: collectPageDeclaredModulesFromModule(await options.importNodePageModule(entrypointPath));
	options.pageMetadataCache.setDeclaredModules(entrypointPath, declaredModules);
	return declaredModules;
}

export function buildReactDevTransformPlugins(
	options: ReactHmrDevTransformPluginOptions,
	declaredModules: readonly string[],
	shouldEnableMdx: boolean,
): EcoBuildPlugin[] {
	const plugins = options.getBuildPlugins(declaredModules);

	if (shouldEnableMdx && options.mdxCompilerOptions) {
		plugins.unshift(
			createReactMdxLoaderPlugin({
				compilerOptions: options.mdxCompilerOptions,
				projectRoot: options.projectRoot,
			}),
		);
	}

	return plugins;
}
