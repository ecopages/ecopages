/**
 * Bundler-backed build adapter.
 *
 * @remarks
 * Implements {@link BuildAdapter} on top of the bundler. This is the
 * default adapter installed by `ConfigBuilder` and the only adapter
 * that issues real builds in production.
 *
 * Responsibilities:
 *
 * - Map {@link BuildOptions} to the bundler's native options and
 *   return a {@link BuildResult} (outputs + dependency graph).
 * - Translate the runtime-agnostic `EcoBuildPlugin[]` via the bundled
 *   plugin bridge, preserving plugin-priority order by giving each
 *   plugin its own slot.
 * - Run the browser-runtime-import rewriter against the emitted
 *   JavaScript outputs when the manifest declares a rewrite map.
 *
 * Module graph extraction: the bundler groups modules per chunk, so
 * the per-chunk module list is read directly. The
 * `BuildDependencyGraph.entrypoints` shape is preserved so HMR
 * invalidation and the build manifest keep working without changes.
 *
 * For HMR/watch mode with cached incremental rebuilds, see
 * {@link RolldownDevBuildAdapter}.
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
} from './build-adapter.ts';
import {
	buildResultFromRolldownOutput,
	resolveRolldownOptions,
	rewriteBrowserRuntimeImportsInOutputs,
	rewriteNodeRuntimeImportsInOutputs,
	toBuildLogs,
	transpileProfileToOptions,
} from './rolldown-adapter-helpers.ts';

const moduleRequire = createRequire(import.meta.url);

export class RolldownBuildAdapter implements BuildAdapter {
	readonly ownership = 'rolldown' as const;
	private readonly appRootRequireCache = new Map<string, NodeJS.Require>();

	async buildOrThrow(options: BuildOptions): Promise<BuildResult> {
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
