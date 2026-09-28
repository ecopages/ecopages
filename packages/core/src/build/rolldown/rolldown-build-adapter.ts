/**
 * Bundler-backed build adapter.
 *
 * @remarks
 * Implements {@link BuildAdapter} on top of Rolldown. This is the
 * default adapter installed by `ConfigBuilder` and the adapter that
 * issues real builds in production.
 *
 * Each `build()` creates a fresh `rolldown()` bundler.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { rolldown } from 'rolldown';

import type {
	BuildAdapter,
	BuildOptions,
	BuildResult,
	BuildTranspileOptions,
	BuildTranspileProfile,
} from '../build-adapter.ts';
import {
	buildResultFromRolldownOutput,
	resolveRolldownOptions,
	rewriteBrowserRuntimeImportsInOutputs,
	rewriteNodeRuntimeImportsInOutputs,
	toBuildLogs,
	transpileProfileToOptions,
} from './rolldown-adapter-helpers.ts';
import { recordRolldownBuildInvocation } from './rolldown-build-invocation-metrics.ts';

const moduleRequire = createRequire(import.meta.url);

export class RolldownBuildAdapter implements BuildAdapter {
	readonly ownership = 'rolldown' as const;

	/** Per-adapter require cache, keyed on resolved context root. */
	private readonly appRootRequireCache = new Map<string, NodeJS.Require>();

	/**
	 * Issues one build. Creates a fresh `rolldown()` bundler per call.
	 */
	async buildOrThrow(options: BuildOptions): Promise<BuildResult> {
		recordRolldownBuildInvocation('rolldown');
		const contextRoot = options.root ? path.resolve(options.root) : process.cwd();
		const outdir = path.resolve(options.outdir ?? 'dist/assets');
		const plugins = options.plugins ?? [];

		const { inputOptions, outputOptions } = resolveRolldownOptions(
			options,
			contextRoot,
			outdir,
			this.appRootRequireCache,
		);

		const bundle = await rolldown(inputOptions);
		const output = await bundle.write(outputOptions);
		await bundle.close();

		const baseResult = buildResultFromRolldownOutput(output, outdir, contextRoot);

		return rewriteNodeRuntimeImportsInOutputs(
			rewriteBrowserRuntimeImportsInOutputs(baseResult, contextRoot, plugins),
			contextRoot,
		);
	}

	async build(options: BuildOptions): Promise<BuildResult> {
		try {
			return await this.buildOrThrow(options);
		} catch (error) {
			return {
				success: false,
				logs: toBuildLogs(error),
				outputs: [],
			};
		}
	}

	resolve(importPath: string, rootDir: string): string {
		return moduleRequire.resolve(importPath, { paths: [rootDir] });
	}

	getTranspileOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
		return transpileProfileToOptions(profile);
	}
}

export function createRolldownBuildAdapter(): BuildAdapter {
	return new RolldownBuildAdapter();
}
