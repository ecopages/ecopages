/**
 * Bundler-backed build adapter.
 *
 * @remarks
 * Implements {@link BuildAdapter} on top of Rolldown. This is the
 * default adapter installed by config finalization and the adapter that
 * issues real builds in production.
 *
 * Each `build()` creates a fresh `rolldown()` bundler.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { rolldown, type RolldownLog } from 'rolldown';

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
	toBuildLog,
	toBuildLogs,
	transpileProfileToOptions,
} from './rolldown-adapter-helpers.ts';
import { recordRolldownBuildInvocation } from './rolldown-build-invocation-metrics.ts';
import { createEntryModuleClosuresPlugin } from './entry-module-closures.ts';
import type { BuildDependencyGraph } from '../build-adapter.ts';

const moduleRequire = createRequire(import.meta.url);

export class RolldownBuildAdapter implements BuildAdapter {
	readonly ownership = 'rolldown' as const;

	/** Per-adapter require cache, keyed on resolved context root. */
	private readonly appRootRequireCache = new Map<string, NodeJS.Require>();

	/**
	 * Issues one build. Creates a fresh `rolldown()` bundler per call.
	 *
	 * @remarks
	 * Warnings are collected on the result and still printed by Rolldown's default handler. Rolldown
	 * reports them only once a build completes, so a failed build has none.
	 */
	async buildOrThrow(options: BuildOptions): Promise<BuildResult> {
		recordRolldownBuildInvocation('rolldown');
		const contextRoot = options.root ? path.resolve(options.root) : process.cwd();
		const outdir = path.resolve(options.outdir ?? 'dist/assets');

		const { inputOptions, outputOptions } = await resolveRolldownOptions(
			options,
			contextRoot,
			outdir,
			this.appRootRequireCache,
		);

		const dependencyGraph: BuildDependencyGraph = { entrypoints: {} };
		inputOptions.plugins = [inputOptions.plugins, createEntryModuleClosuresPlugin(dependencyGraph, contextRoot)];
		const warnings: RolldownLog[] = [];
		const bundle = await rolldown({
			...inputOptions,
			onLog: (level, log, defaultHandler) => {
				if (level === 'warn') {
					warnings.push(toBuildLog(log));
				}
				defaultHandler(level, log);
			},
		});
		const output = await bundle.write(outputOptions);
		await bundle.close();

		return {
			...buildResultFromRolldownOutput(output, outdir, contextRoot, dependencyGraph, options.entrypoints),
			warnings,
		};
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
