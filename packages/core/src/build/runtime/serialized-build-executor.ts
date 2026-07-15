import type { BuildExecutor, BuildOptions, BuildResult } from '../build-adapter.ts';

/**
 * FIFO-serialized build executor wrapper.
 *
 * @remarks
 * Wraps any `BuildExecutor` and ensures that no two builds run
 * concurrently. The next build waits for the previous one to finish
 * (success or failure) before starting.
 *
 * This is a bundler-agnostic primitive. It is unaware of bundler
 * lifecycle events and exists purely to enforce one build at a time.
 * Use it from the dev watch pipeline, the static preview path, or any
 * caller that issues builds concurrently.
 */

/**
 * FIFO-serialized wrapper around a {@link BuildExecutor}.
 *
 * Every `build()` call enqueues onto the wrapper's internal queue. A
 * build only starts after the previous build's promise has settled.
 */
export class SerializedBuildExecutor implements BuildExecutor {
	private readonly inner: BuildExecutor;
	private tail: Promise<unknown> = Promise.resolve();

	constructor(inner: BuildExecutor) {
		this.inner = inner;
	}

	/**
	 * Run a build through the serialized queue. The returned promise
	 * resolves with the inner executor's `BuildResult`. A rejected
	 * inner build does not block the queue — the next caller can
	 * proceed.
	 */
	build(options: BuildOptions): Promise<BuildResult> {
		return this.run(() => this.inner.build(options));
	}

	/**
	 * Run an arbitrary async operation through the serialized queue.
	 *
	 * Use this when the work is not a `build()` call against a wrapped
	 * executor (e.g. when composing with a coordinator that needs to
	 * inject recovery around the inner call). The returned promise
	 * resolves with the operation's result. A rejected operation does
	 * not block the queue.
	 */
	run<T>(operation: () => Promise<T>): Promise<T> {
		const next = this.tail.catch(() => undefined).then(() => operation());

		this.tail = next.catch(() => undefined);
		return next;
	}

	/**
	 * Returns the wrapped executor. Tests use this to assert the
	 * delegation chain.
	 */
	unwrap(): BuildExecutor {
		return this.inner;
	}

	/**
	 * Reset the queue to an empty state. Tests use this to recover
	 * from a poisoned tail.
	 */
	resetForTests(): void {
		this.tail = Promise.resolve();
	}

	/**
	 * Overrides the internal queue tail for fault-recovery tests. The
	 * supplied promise is awaited before the next enqueued operation
	 * starts.
	 */
	setBuildQueueForTests(queue: Promise<unknown>): void {
		this.tail = queue;
	}

	/**
	 * Returns the current internal queue tail for fault-recovery
	 * tests. Tests await this to assert that recovery has cleared a
	 * wedged queue.
	 */
	getBuildQueueForTests(): Promise<unknown> {
		return this.tail;
	}
}
