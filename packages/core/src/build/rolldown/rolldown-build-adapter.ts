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
import { rolldown } from 'rolldown';

import type { BuildAdapter, BuildLog, BuildOptions, BuildResult, BuildSuccess } from '../build-adapter.ts';
import {
	buildResultFromRolldownOutput,
	resolveRolldownOptions,
	toBuildLog,
	toBuildLogs,
} from './rolldown-adapter-helpers.ts';
import { recordRolldownBuildInvocation } from './rolldown-build-invocation-metrics.ts';
import { createEntryModuleClosuresPlugin } from './entry-module-closures.ts';
import type { BuildDependencyGraph } from '../build-adapter.ts';
import { createBuildInputRecorder, getBuildInputRecordingContext } from '../cache/build-input-dependency-index.ts';

const moduleRequire = createRequire(import.meta.url);

export class RolldownBuildAdapter implements BuildAdapter {
	/** Per-adapter require cache, keyed on resolved context root. */
	private readonly appRootRequireCache = new Map<string, NodeJS.Require>();

	/**
	 * Issues one build. Creates a fresh `rolldown()` bundler per call.
	 *
	 * @remarks
	 * Warnings are collected on the result and still printed by Rolldown's default handler. Rolldown
	 * reports them only once a build completes, so a failed build has none.
	 */
	async buildOrThrow(options: BuildOptions): Promise<BuildSuccess> {
		if (options.environment !== 'server' && options.environment !== 'browser') {
			throw new Error('Build requests require environment: "server" or "browser".');
		}
		recordRolldownBuildInvocation();
		const contextRoot = options.root ? path.resolve(options.root) : process.cwd();
		const outdir = path.resolve(options.outdir ?? 'dist/client/assets');
		const recordingContext = getBuildInputRecordingContext();
		const loadedInputs = new Set<string>();
		const loadedInputsByModule = new Map<string, Set<string>>();
		const recordBuildInput = createBuildInputRecorder(recordingContext, loadedInputs, loadedInputsByModule);

		const { inputOptions, outputOptions } = await resolveRolldownOptions(
			options,
			contextRoot,
			outdir,
			this.appRootRequireCache,
			recordBuildInput,
		);

		const dependencyGraph: BuildDependencyGraph = { entrypoints: {} };
		inputOptions.plugins = [inputOptions.plugins, createEntryModuleClosuresPlugin(dependencyGraph, contextRoot)];
		const warnings: BuildLog[] = [];
		const bundle = await rolldown({
			...inputOptions,
			onLog: (level, log, defaultHandler) => {
				if (level === 'warn') {
					warnings.push(toBuildLog(log));
				}
				defaultHandler(level, log);
			},
		});
		try {
			const output =
				options.writeToDisk === false
					? await bundle.generate(outputOptions)
					: await bundle.write(outputOptions);

			return {
				...buildResultFromRolldownOutput(
					output,
					outdir,
					contextRoot,
					dependencyGraph,
					options.entrypoints,
					options.naming,
					options.writeToDisk === false,
				),
				loadedInputs: [...loadedInputs],
				loadedInputsByModule: Object.fromEntries(
					[...loadedInputsByModule].map(([moduleId, paths]) => [moduleId, [...paths]]),
				),
				warnings,
			};
		} finally {
			await bundle.close();
		}
	}

	async build(options: BuildOptions): Promise<BuildResult> {
		try {
			return await this.buildOrThrow(options);
		} catch (error) {
			return {
				success: false,
				logs: toBuildLogs(error),
			};
		}
	}

	resolve(importPath: string, rootDir: string): string {
		return moduleRequire.resolve(importPath, { paths: [rootDir] });
	}
}

export function createRolldownBuildAdapter(): BuildAdapter {
	return new RolldownBuildAdapter();
}
