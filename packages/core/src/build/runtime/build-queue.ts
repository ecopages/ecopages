import { AsyncLocalStorage } from 'node:async_hooks';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import type { BuildAdapter, BuildExecutor, BuildOptions, BuildResult, BuildSuccess } from '../build-adapter.ts';
import { resolveBuildParallelism } from '../build-parallelism.ts';
import { assertBuildSucceeded } from '../build-log.ts';
import { createBuildRequestIdentity } from './build-request-identity.ts';

/**
 * Scheduling lane of a build.
 *
 * @remarks
 * `build` carries every server and browser build that is not an HMR rebuild and may use all but one of the
 * machine's cores. `hmr` carries the browser rebuilds of the development server and runs at most three at once, so
 * a burst of rebuilds leaves room for the `build` lane.
 *
 * `nested` is for a build that a running build waits for, such as the collection bundle a content plugin's
 * `onResolve` hook triggers. A running build holds its lane's slot until it ends, so a build it waits for in the
 * same lane could wait for a slot that its own parent holds, and with every slot taken that way none would ever free.
 * A `nested` build never waits on another `nested` build, so its lane cannot lock up.
 */
export type BuildLane = 'build' | 'hmr' | 'nested';

type LaneState = { limit: number; active: number; waiting: Array<() => void> };

/** Concurrency each lane gets on this machine. */
export function resolveBuildLaneLimits(): Record<BuildLane, number> {
	const build = resolveBuildParallelism();
	return { build, hmr: Math.min(3, build), nested: build };
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
			nested: { limit: Math.max(1, limits.nested), active: 0, waiting: [] },
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

/**
 * Returns the app's build queue from its assembled {@link AppRuntime}.
 *
 * @throws When `appConfig` skipped finalization.
 */
export function requireBuildQueue(appConfig: EcoPagesAppConfig): BuildQueue {
	return requireAppRuntime(appConfig).buildQueue;
}

/**
 * Installs a fresh build queue on the app's {@link AppRuntime}.
 *
 * @remarks
 * The queue builds with the app's installed {@link BuildAdapter}. Startup installs a queue again after
 * finalization, so an assembled {@link AppRuntime} takes that later queue instead of keeping the first one.
 */
export function installBuildQueue(appConfig: EcoPagesAppConfig): BuildQueue {
	const runtime = requireAppRuntime(appConfig);
	const buildQueue = new BuildQueue(runtime.buildAdapter);
	runtime.buildQueue = buildQueue;
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
): Promise<BuildSuccess> {
	const result = await requireBuildQueue(appConfig).build(options, lane);
	assertBuildSucceeded(result, failure);
	return result;
}
