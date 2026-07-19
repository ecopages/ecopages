import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { getAppSourceTransforms } from '../../plugins/source-transform.ts';
import { applySourceTransforms } from '../../plugins/source-transform.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { createEsbuildPluginsFromEcoBuild } from './eco-build-esbuild-bridge.ts';
import type { DevTransformBundleContributor, DevTransformBundleResult } from './types.ts';

export type DevTransformBundlerOptions = {
	appConfig: EcoPagesAppConfig;
	contributors: readonly DevTransformBundleContributor[];
};

/**
 * Bundles one dev client entrypoint with esbuild (in-memory, no disk write).
 */
export class DevTransformBundler {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly contributors: DevTransformBundleContributor[] = [];

	constructor(options: DevTransformBundlerOptions) {
		this.appConfig = options.appConfig;
		this.contributors.push(...options.contributors);
	}

	addContributor(contributor: DevTransformBundleContributor): void {
		this.contributors.push(contributor);
	}

	private selectContributor(entrypointPath: string): DevTransformBundleContributor | undefined {
		return this.contributors.find((contributor) => contributor.ownsEntrypoint(entrypointPath));
	}

	async bundleEntrypoint(entrypointPath: string): Promise<DevTransformBundleResult> {
		const normalized = path.resolve(entrypointPath);
		const contributor = this.selectContributor(normalized);
		if (contributor) {
			return contributor.bundleEntrypoint(normalized);
		}

		const sourceTransforms = getAppSourceTransforms(this.appConfig);
		const plugins = createEsbuildPluginsFromEcoBuild([]);

		const result = await esbuild.build({
			absWorkingDir: this.appConfig.rootDir,
			entryPoints: [normalized],
			bundle: true,
			format: 'esm',
			platform: 'browser',
			target: 'es2022',
			write: false,
			sourcemap: 'inline',
			jsx: 'automatic',
			plugins: [
				...plugins,
				{
					name: 'ecopages-dev-source-transforms',
					setup(build) {
						build.onLoad({ filter: /\.(tsx?|jsx?|mdx)$/ }, async (args) => {
							if (!fileSystem.exists(args.path)) {
								return undefined;
							}
							const source = fileSystem.readFileSync(args.path);
							const transformed = applySourceTransforms(sourceTransforms, source, args.path);
							const ext = path.extname(args.path);
							const loader = ext === '.tsx' || ext === '.jsx' ? 'tsx' : ext === '.ts' ? 'ts' : 'js';
							return { contents: transformed, loader };
						});
					},
				},
			],
		});

		const output = result.outputFiles[0];
		if (!output) {
			throw new Error(`[dev-transform] No output for ${normalized}`);
		}

		return { code: output.text };
	}
}
