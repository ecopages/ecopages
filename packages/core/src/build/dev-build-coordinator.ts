import { appLogger } from '../global/app-logger.ts';
import {
	defaultBuildAdapter,
	type BuildAdapter,
	type BuildExecutor,
	type BuildOptions,
	type BuildResult,
	EsbuildBuildAdapter,
} from './build-adapter.ts';
import { mergeEcoBuildPlugins } from './build-manifest.ts';
import type { EcoBuildPlugin } from './build-types.ts';

function mergeBuildPlugins(options: BuildOptions, appPlugins: EcoBuildPlugin[]): BuildOptions {
	if (appPlugins.length === 0) {
		return options;
	}

	return {
		...options,
		plugins: mergeEcoBuildPlugins(options.plugins, appPlugins),
	};
}

class BuildExecutorWithPlugins implements BuildExecutor {
	private readonly executor: BuildExecutor;
	private readonly getPlugins: () => EcoBuildPlugin[];

	constructor(executor: BuildExecutor, getPlugins: () => EcoBuildPlugin[]) {
		this.executor = executor;
		this.getPlugins = getPlugins;
	}

	async build(options: BuildOptions): Promise<BuildResult> {
		return await this.executor.build(mergeBuildPlugins(options, this.getPlugins()));
	}
}

function unwrapBuildExecutor(executor: BuildExecutor): BuildExecutor {
	if (executor instanceof BuildExecutorWithPlugins) {
		return unwrapBuildExecutor(executor.executor);
	}

	return executor;
}

export function withBuildExecutorPlugins(executor: BuildExecutor, getPlugins: () => EcoBuildPlugin[]): BuildExecutor {
	return new BuildExecutorWithPlugins(executor, getPlugins);
}

/**
 * Serialized development build coordinator for the shared esbuild adapter.
 *
 * The underlying adapter remains responsible for plain build execution. This
 * coordinator owns the policy that must be shared across callers in dev mode:
 *
 * - serialized access to the shared esbuild service
 * - warm-service recycling for Node-target builds
 * - recovery from known esbuild worker protocol faults
 *
 * Unlike the previous design, the coordinator does not monkey-patch the adapter
 * or install process-level fault handlers. The owning app/runtime passes this
 * executor explicitly to build consumers that need coordinated development
 * builds.
 */
export class DevBuildCoordinator implements BuildExecutor {
	private buildQueue: Promise<void> = Promise.resolve();
	private esbuildSessionWarm = false;
	private esbuildModuleGeneration = 0;
	private readonly adapter: EsbuildBuildAdapter;

	constructor(adapter: EsbuildBuildAdapter) {
		this.adapter = adapter;
	}

	/**
	 * Executes a build through the serialized development queue.
	 *
	 * Node-target builds recycle the warmed esbuild service between requests to
	 * avoid stale worker state accumulating across long-lived dev sessions.
	 *
	 * If an esbuild protocol fault is detected, the coordinator resets the queue,
	 * stops the corrupted service, increments the module generation, and retries
	 * the build once.
	 */
	async build(options: BuildOptions): Promise<BuildResult> {
		return this.runSerialized(async () => {
			try {
				if (this.shouldRecycleEsbuildService(options)) {
					await this.adapter.stopEsbuildService(this.esbuildModuleGeneration);
					this.esbuildSessionWarm = false;
				}

				const result = await this.adapter.buildOrThrow(options, this.esbuildModuleGeneration);
				this.esbuildSessionWarm = true;
				return result;
			} catch (error) {
				if (await this.recoverFromProtocolFault(error)) {
					appLogger.warn('Recovered from esbuild protocol fault. Retrying build.');
					try {
						const retry = await this.adapter.buildOrThrow(options, this.esbuildModuleGeneration);
						this.esbuildSessionWarm = true;
						return retry;
					} catch (retryError) {
						return this.adapter.createFailureResult(retryError);
					}
				}
				return this.adapter.createFailureResult(error);
			}
		});
	}

	/**
	 * Attempts recovery from a known esbuild worker protocol fault.
	 *
	 * Returns `true` only when the error matches the protocol-fault signature and
	 * the coordinator successfully reset its shared state.
	 */
	async recoverFromProtocolFault(error: unknown): Promise<boolean> {
		if (!this.adapter.isEsbuildProtocolError(error)) {
			return false;
		}
		this.buildQueue = Promise.resolve();
		this.esbuildSessionWarm = false;
		await this.adapter.stopEsbuildService(this.esbuildModuleGeneration);
		this.esbuildModuleGeneration += 1;
		return true;
	}

	/**
	 * Clears internal coordinator state for isolated tests.
	 */
	resetForTests(): void {
		this.buildQueue = Promise.resolve();
		this.esbuildSessionWarm = false;
		this.esbuildModuleGeneration = 0;
	}

	/**
	 * Overrides the internal queue promise for fault-recovery tests.
	 */
	setBuildQueueForTests(queue: Promise<void>): void {
		this.buildQueue = queue;
	}

	/**
	 * Returns the current internal queue promise for fault-recovery tests.
	 */
	getBuildQueueForTests(): Promise<void> {
		return this.buildQueue;
	}

	private shouldRecycleEsbuildService(options: BuildOptions): boolean {
		return process.env.NODE_ENV === 'development' && options.target !== 'browser' && this.esbuildSessionWarm;
	}

	private async runSerialized<T>(operation: () => Promise<T>): Promise<T> {
		let releaseBuild: (() => void) | undefined;
		const currentBuild = new Promise<void>((resolve) => {
			releaseBuild = resolve;
		});
		const previousBuild = this.buildQueue;

		this.buildQueue = previousBuild.catch(() => undefined).then(async () => await currentBuild);
		await previousBuild.catch(() => undefined);

		try {
			return await operation();
		} finally {
			releaseBuild?.();
		}
	}
}

/**
 * Creates the appropriate build executor for one app/runtime instance.
 *
 * Development runtimes get a dedicated coordinator around the shared esbuild
 * adapter. Non-development runtimes use the adapter directly.
 */
export function createAppBuildExecutor(options: {
	development: boolean;
	adapter?: BuildAdapter;
	getPlugins?: () => EcoBuildPlugin[];
}): BuildExecutor {
	const adapter = options.adapter ?? defaultBuildAdapter;
	const baseExecutor =
		!options.development || !(adapter instanceof EsbuildBuildAdapter) ? adapter : new DevBuildCoordinator(adapter);

	if (!options.getPlugins) {
		return baseExecutor;
	}

	return new BuildExecutorWithPlugins(baseExecutor, options.getPlugins);
}

export function createOrReuseAppBuildExecutor(options: {
	development: boolean;
	adapter?: BuildAdapter;
	currentExecutor?: BuildExecutor;
	getPlugins?: () => EcoBuildPlugin[];
}): BuildExecutor {
	const adapter = options.adapter ?? defaultBuildAdapter;
	const currentBaseExecutor = options.currentExecutor ? unwrapBuildExecutor(options.currentExecutor) : undefined;
	const baseExecutor =
		options.development && currentBaseExecutor instanceof DevBuildCoordinator
			? currentBaseExecutor
			: createAppBuildExecutor({
					development: options.development,
					adapter,
				});

	if (!options.getPlugins) {
		return baseExecutor;
	}

	return withBuildExecutorPlugins(baseExecutor, options.getPlugins);
}
