import type { BuildExecutor, BuildOptions, BuildResult } from './build-adapter.ts';
import { createBuildRequestIdentity } from './build-request-identity.ts';

export { createBuildRequestIdentity, createBuildOptionsDedupeKey } from './build-request-identity.ts';

/**
 * In-flight build coalescing wrapper.
 *
 * @remarks
 * `ParallelBuildExecutor` allows concurrent builds but does not dedupe identical
 * options. Multiple callers (route import, browser bundles, HMR) can hit the
 * same Rolldown request before disk or import caches warm. This wrapper shares
 * one inner `build()` promise per dedupe key until it settles.
 *
 * Wrap route-module and browser-hmr profiles only; server-entry stays serialized.
 */
export class DedupingBuildExecutor implements BuildExecutor {
	private readonly inner: BuildExecutor;
	private readonly inFlight = new Map<string, Promise<BuildResult>>();

	constructor(inner: BuildExecutor) {
		this.inner = inner;
	}

	build(options: BuildOptions): Promise<BuildResult> {
		const key = createBuildRequestIdentity(options);
		const existing = this.inFlight.get(key);
		if (existing) {
			return existing;
		}

		const buildPromise = this.inner.build(options).finally(() => {
			if (this.inFlight.get(key) === buildPromise) {
				this.inFlight.delete(key);
			}
		});

		this.inFlight.set(key, buildPromise);
		return buildPromise;
	}

	unwrap(): BuildExecutor {
		return this.inner;
	}

	getInFlightCountForTests(): number {
		return this.inFlight.size;
	}
}
