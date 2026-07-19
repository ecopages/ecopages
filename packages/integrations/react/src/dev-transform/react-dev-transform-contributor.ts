import * as esbuild from 'esbuild';
import {
	createEsbuildPluginsFromEcoBuild,
	type DevTransformBundleContributor,
	type DevTransformBundleResult,
} from '@ecopages/core/dev/transform-server';
import type { BrowserRuntimeManifest } from '@ecopages/core/build/browser-runtime-manifest';
import type { CompileOptions } from '@mdx-js/mdx';
import type { ReactHmrStrategy } from '../hmr/hmr-strategy.ts';

export type ReactDevTransformContributorOptions = {
	strategy: ReactHmrStrategy;
	runtimeManifest: BrowserRuntimeManifest;
	projectRoot: string;
	mdxCompilerOptions?: CompileOptions;
};

/**
 * Bundles React-owned page entrypoints for the core dev transform server.
 */
export class ReactDevTransformContributor implements DevTransformBundleContributor {
	private readonly strategy: ReactHmrStrategy;
	private readonly runtimeManifest: BrowserRuntimeManifest;
	private readonly projectRoot: string;
	private readonly mdxCompilerOptions?: CompileOptions;

	constructor(options: ReactDevTransformContributorOptions) {
		this.strategy = options.strategy;
		this.runtimeManifest = options.runtimeManifest;
		this.projectRoot = options.projectRoot;
		this.mdxCompilerOptions = options.mdxCompilerOptions;
	}

	ownsEntrypoint(entrypointPath: string): boolean {
		return this.strategy.canEmitEntrypoint(entrypointPath);
	}

	async bundleEntrypoint(entrypointPath: string): Promise<DevTransformBundleResult> {
		const plugins = await this.strategy.createDevTransformPlugins(entrypointPath);
		const ecoPlugins = plugins;
		const result = await esbuild.build({
			absWorkingDir: this.projectRoot,
			entryPoints: [entrypointPath],
			bundle: true,
			format: 'esm',
			platform: 'browser',
			target: 'es2022',
			write: false,
			sourcemap: 'inline',
			jsx: 'automatic',
			plugins: createEsbuildPluginsFromEcoBuild(ecoPlugins),
		});

		const output = result.outputFiles[0];
		if (!output) {
			throw new Error(`[react-dev-transform] No output for ${entrypointPath}`);
		}

		return { code: output.text };
	}
}
