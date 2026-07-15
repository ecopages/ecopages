import type { BuildExecutor, BuildOptions, BuildResult } from '../build-adapter.ts';

type QueuedBuild = {
	operation: () => Promise<BuildResult>;
	resolve: (value: BuildResult) => void;
	reject: (error: unknown) => void;
};

/**
 * Concurrency-limited build executor wrapper.
 *
 * @remarks
 * Runs up to `limit` builds concurrently. Use for independent route-module
 * and HMR browser builds where FIFO serialization is unnecessary.
 */
export class ParallelBuildExecutor implements BuildExecutor {
	private readonly inner: BuildExecutor;
	private readonly limit: number;
	private activeCount = 0;
	private queue: QueuedBuild[] = [];

	constructor(inner: BuildExecutor, limit: number) {
		this.inner = inner;
		this.limit = Math.max(1, limit);
	}

	build(options: BuildOptions): Promise<BuildResult> {
		return new Promise<BuildResult>((resolve, reject) => {
			this.queue.push({
				operation: () => this.inner.build(options),
				resolve,
				reject,
			});
			this.drainQueue();
		});
	}

	private drainQueue(): void {
		while (this.activeCount < this.limit && this.queue.length > 0) {
			const next = this.queue.shift();
			if (!next) {
				return;
			}

			this.activeCount += 1;
			void next
				.operation()
				.then((result) => {
					next.resolve(result);
				})
				.catch((error) => {
					next.reject(error);
				})
				.finally(() => {
					this.activeCount -= 1;
					this.drainQueue();
				});
		}
	}

	unwrap(): BuildExecutor {
		return this.inner;
	}

	getConcurrencyLimitForTests(): number {
		return this.limit;
	}

	getActiveCountForTests(): number {
		return this.activeCount;
	}

	getQueuedCountForTests(): number {
		return this.queue.length;
	}
}
