/**
 * DevEngine-backed build adapter for cached incremental rebuilds.
 *
 * @remarks
 * Wraps Rolldown's experimental `DevEngine` to provide cached incremental
 * rebuilds. Unlike the standard `RolldownBuildAdapter` which creates a new
 * bundler for every build, this adapter keeps a `DevEngine` instance alive
 * and reuses the internal module graph, resolver cache, and transform cache
 * across builds.
 *
 * The adapter is designed for the HMR rebuild path where the same entrypoints
 * are rebuilt repeatedly with small changes. For one-off production builds,
 * use `RolldownBuildAdapter` instead.
 *
 * The first build creates the engine and runs it. Subsequent builds with the
 * same plugin/target/format triple reuse the cached engine and call
 * `triggerFullBuild()`. The cache key incorporates the context root, plugin
 * names, target, and format; when any of those change, the cached engine is
 * closed and a new one is created.
 *
 * Call `close()` to release the cached engine and free resources.
 *
 * @module
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { dev } from 'rolldown/experimental';
import type { RolldownOutput } from 'rolldown';
import type { EcoBuildPlugin } from './build-types.ts';

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
	toBuildLogs,
	transpileProfileToOptions,
} from './rolldown-adapter-helpers.ts';

const moduleRequire = createRequire(import.meta.url);

interface CachedDevEngine {
	engine: Awaited<ReturnType<typeof dev>>;
	engineStarted: boolean;
	contextRoot: string;
	bundlePlugins: EcoBuildPlugin[];
}

type PendingBuild = {
	resolve: (output: RolldownOutput) => void;
	reject: (error: Error) => void;
};

/**
 * Build adapter backed by Rolldown's DevEngine for cached incremental rebuilds.
 */
export class RolldownDevBuildAdapter implements BuildAdapter {
	/**
	 * `'rolldown-dev'` (not `'rolldown'`) so {@link getBuildAdapterOwnership}
	 * round-trips correctly and `createBuildAdapter({ ownership })` can
	 * re-select this class.
	 */
	readonly ownership = 'rolldown-dev' as const;

	private cachedEngine: CachedDevEngine | undefined;
	private engineInstanceCount = 0;
	private readonly pendingBuilds: PendingBuild[] = [];
	private readonly appRootRequireCache = new Map<string, NodeJS.Require>();

	/**
	 * Stable key over the inputs that affect the engine configuration.
	 * Plugin order is intentionally not part of the key: two plugin
	 * sets with the same names are interchangeable for caching.
	 */
	private getCacheKey(
		plugins: EcoBuildPlugin[],
		contextRoot: string,
		target: string | undefined,
		format: string | undefined,
	): string {
		const pluginNames = plugins.map((p) => p.name).join(':');
		return `${contextRoot}::${pluginNames}::${target ?? 'default'}::${format ?? 'esm'}`;
	}

	/**
	 * Returns the cached engine, creating a new one when the cache
	 * key changes. On a cache miss the prior engine is closed and
	 * {@link engineInstanceCount} is incremented.
	 */
	private async getOrCreateEngine(options: BuildOptions, contextRoot: string): Promise<CachedDevEngine> {
		const bundlePlugins = options.plugins ?? [];
		const cacheKey = this.getCacheKey(bundlePlugins, contextRoot, options.target, options.format);

		if (this.cachedEngine) {
			const existingKey = this.getCacheKey(
				this.cachedEngine.bundlePlugins,
				this.cachedEngine.contextRoot,
				options.target,
				options.format,
			);
			if (existingKey === cacheKey) {
				return this.cachedEngine;
			}
			await this.cachedEngine.engine.close();
			this.cachedEngine = undefined;
		}

		const outdir = path.resolve(options.outdir ?? 'dist/assets');
		const { inputOptions, outputOptions } = resolveRolldownOptions(
			options,
			contextRoot,
			outdir,
			this.appRootRequireCache,
		);

		const engine = await dev(inputOptions, outputOptions, {
			rebuildStrategy: 'never',
			onOutput: (result) => {
				if (result instanceof Error) {
					return;
				}
				const next = this.pendingBuilds.shift();
				if (next) {
					next.resolve(result);
				}
			},
		});

		this.cachedEngine = {
			engine,
			engineStarted: false,
			contextRoot,
			bundlePlugins,
		};
		this.engineInstanceCount += 1;

		return this.cachedEngine;
	}

	/**
	 * Triggers a build on the cached engine and returns the next
	 * `RolldownOutput` delivered to `onOutput`.
	 *
	 * First call after engine creation invokes `engine.run`; subsequent
	 * calls invoke `engine.triggerFullBuild` and reuse the cached
	 * module graph, resolver, and transform caches.
	 *
	 * If the trigger itself throws, the queued build is removed so
	 * the next `build()` does not consume a stale slot.
	 */
	private async runBuild(cached: CachedDevEngine): Promise<RolldownOutput> {
		const outputPromise = new Promise<RolldownOutput>((resolve, reject) => {
			this.pendingBuilds.push({ resolve, reject });
		});

		try {
			if (!cached.engineStarted) {
				cached.engineStarted = true;
				await cached.engine.run();
			} else {
				cached.engine.triggerFullBuild();
			}
		} catch (error) {
			this.pendingBuilds.shift();
			throw error;
		}

		return outputPromise;
	}

	/** Throws on error; see {@link build} for the no-throw variant. */
	async buildOrThrow(options: BuildOptions): Promise<BuildResult> {
		const contextRoot = options.root ? path.resolve(options.root) : process.cwd();
		const outdir = path.resolve(options.outdir ?? 'dist/assets');
		const plugins = options.plugins ?? [];

		const cached = await this.getOrCreateEngine(options, contextRoot);
		const output = await this.runBuild(cached);

		const baseResult = buildResultFromRolldownOutput(output, outdir, contextRoot);

		return rewriteBrowserRuntimeImportsInOutputs(baseResult, contextRoot, plugins);
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

	/**
	 * Closes the cached DevEngine and rejects any in-flight builds
	 * with `'DevBuildAdapter closed'`.
	 *
	 * @remarks
	 * Not on the {@link BuildAdapter} interface, so it is only
	 * reachable through the concrete class. The adapter is meant to
	 * live for the process lifetime; this is for explicit teardown.
	 */
	async close(): Promise<void> {
		if (this.cachedEngine) {
			await this.cachedEngine.engine.close();
			this.cachedEngine = undefined;
		}
		while (this.pendingBuilds.length > 0) {
			const pending = this.pendingBuilds.shift();
			pending?.reject(new Error('DevBuildAdapter closed'));
		}
	}

	/** Test-only: number of engines created over the adapter's lifetime. */
	getEngineInstanceCountForTests(): number {
		return this.engineInstanceCount;
	}
}

export function createRolldownDevBuildAdapter(): RolldownDevBuildAdapter {
	return new RolldownDevBuildAdapter();
}
