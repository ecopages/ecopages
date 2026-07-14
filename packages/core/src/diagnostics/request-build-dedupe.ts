import { AsyncLocalStorage } from 'node:async_hooks';
import type { BuildResult } from '../build/build-adapter.ts';

/**
 * Per-request browser build dedupe cache.
 *
 * @remarks
 * `DedupingBuildExecutor` only coalesces concurrent identical builds. Asset
 * processing can call the same logical bundle several times in one request
 * (page graph, HMR, content scripts) after the first build settles. This cache
 * reuses the settled result until the request scope ends.
 */
class RequestBuildDedupe {
	private readonly storage = new AsyncLocalStorage<Map<string, Promise<BuildResult>>>();

	run<T>(fn: () => Promise<T>): Promise<T> {
		if (this.storage.getStore()) {
			return fn();
		}

		return this.storage.run(new Map(), fn);
	}

	dedupeBuild(key: string, build: () => Promise<BuildResult>): Promise<BuildResult> {
		const store = this.storage.getStore();
		if (!store) {
			return build();
		}

		const existing = store.get(key);
		if (existing) {
			return existing;
		}

		const buildPromise = build().catch((error) => {
			store.delete(key);
			throw error;
		});
		store.set(key, buildPromise);
		return buildPromise;
	}

	getCachedCountForTests(): number {
		return this.storage.getStore()?.size ?? 0;
	}
}

export const requestBuildDedupe = new RequestBuildDedupe();
