import { AsyncLocalStorage } from 'node:async_hooks';
import { availableParallelism } from 'node:os';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import {
	getAppBuildAdapter,
	type BuildAdapter,
	type BuildExecutor,
	type BuildOptions,
	type BuildResult,
} from '../build-adapter.ts';
import { assertBuildSucceeded } from '../build-log.ts';
import { createBuildRequestIdentity } from './build-request-identity.ts';

/**
 * Scheduling lane of a build.
 *
 * @remarks
 * `build` carries every server and browser build that is not an HMR rebuild and may use all but one of the
 * machine's cores. `hmr` carries the browser rebuilds of the development server and runs at most three at once, so
 * a burst of rebuilds leaves room for the `build` lane.
 */
export type BuildLane = 'build' | 'hmr';

type LaneState = { limit: number; active: number; waiting: Array<() => void> };

/** Concurrency each lane gets on this machine. */
export function resolveBuildLaneLimits(): Record<BuildLane, number> {
	const build = Math.max(1, availableParallelism() - 1);
	return { build, hmr: Math.min(3, build) };
}

/**
 * The one queue every build of an app goes through.
 *
 * @remarks
 * A lane runs at most its limit of builds at once and starts the rest in arrival order. A request identical to one
 * that is queued or running, by {@link createBuildRequestIdentity}, shares that build and its result whichever lane
 * it asks for. Inside {@link BuildQueue.withRequestScope}, a finished build is also shared with later identical
 * requests of the same scope, so one page request that asks for the same bundle twice builds it once. A build that
 * rejects is not kept.
 *
 * Requests must be complete {@link BuildOptions}: the queue does not add app plugins or defaults. Assemble them
 * with `createServerBuildRequest` or `createBrowserBuildRequest` first.
 */
export class BuildQueue implements BuildExecutor {
	private readonly adapter: BuildAdapter;
	private readonly lanes: Record<BuildLane, LaneState>;
	private readonly inFlight = new Map<string, Promise<BuildResult>>();
	private readonly requestScope = new AsyncLocalStorage<Map<string, Promise<BuildResult>>>();

	constructor(adapter: BuildAdapter, limits: Record<BuildLane, number> = resolveBuildLaneLimits()) {
		this.adapter = adapter;
		this.lanes = {
			build: { limit: Math.max(1, limits.build), active: 0, waiting: [] },
			hmr: { limit: Math.max(1, limits.hmr), active: 0, waiting: [] },
		};
	}

	build(options: BuildOptions, lane: BuildLane = 'build'): Promise<BuildResult> {
		const identity = createBuildRequestIdentity(options);
		const scope = this.requestScope.getStore();
		const shared = scope?.get(identity) ?? this.inFlight.get(identity);
		if (shared) {
			return shared;
		}

		const pending = this.run(lane, options);
		this.inFlight.set(identity, pending);
		scope?.set(identity, pending);
		const settle = (): void => {
			if (this.inFlight.get(identity) === pending) {
				this.inFlight.delete(identity);
			}
		};
		pending.then(settle, () => {
			settle();
			if (scope?.get(identity) === pending) {
				scope.delete(identity);
			}
		});
		return pending;
	}

	/** Shares finished builds between identical requests made while `operation` runs. */
	withRequestScope<T>(operation: () => Promise<T>): Promise<T> {
		return this.requestScope.getStore() ? operation() : this.requestScope.run(new Map(), operation);
	}

	private async run(lane: BuildLane, options: BuildOptions): Promise<BuildResult> {
		const state = this.lanes[lane];
		if (state.active < state.limit) {
			state.active += 1;
		} else {
			await new Promise<void>((resolve) => state.waiting.push(resolve));
		}
		try {
			return await this.adapter.build(options);
		} finally {
			const next = state.waiting.shift();
			if (next) {
				next();
			} else {
				state.active -= 1;
			}
		}
	}
}

export function getBuildQueue(appConfig: EcoPagesAppConfig): BuildQueue | undefined {
	return appConfig.runtime?.buildQueue;
}

/** Returns the app's build queue, installing it when missing. */
export function requireBuildQueue(appConfig: EcoPagesAppConfig): BuildQueue {
	return getBuildQueue(appConfig) ?? installBuildQueue(appConfig);
}

/**
 * Installs the build queue of one app instance on the app's runtime state.
 *
 * @remarks
 * The queue builds with the app's installed {@link BuildAdapter}.
 */
export function installBuildQueue(appConfig: EcoPagesAppConfig): BuildQueue {
	const buildQueue = new BuildQueue(getAppBuildAdapter(appConfig));
	appConfig.runtime = { ...(appConfig.runtime ?? {}), buildQueue };
	return buildQueue;
}

/**
 * Builds on the app's queue and throws, with the formatted build logs, when the build fails.
 *
 * @remarks
 * Use it where a failed build is an error; read `BuildResult` from the queue directly where a failure is handled.
 */
export async function buildOrThrow(
	appConfig: EcoPagesAppConfig,
	options: BuildOptions,
	failure: string | ((details: string) => string),
	lane: BuildLane = 'build',
): Promise<BuildResult> {
	const result = await requireBuildQueue(appConfig).build(options, lane);
	assertBuildSucceeded(result, failure);
	return result;
}
