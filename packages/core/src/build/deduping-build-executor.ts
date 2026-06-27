import path from 'node:path';
import type { BuildExecutor, BuildOptions, BuildResult } from './build-adapter.ts';
import {
	createJsxCacheKey,
	createPluginCacheKey,
} from '../services/module-loading/route-module-build-manifest.ts';

/** Stable cache key for coalescing concurrent identical build requests. */
export function createBuildOptionsDedupeKey(options: BuildOptions): string {
	return [
		normalizeEntrypoints(options.entrypoints),
		options.root ? path.resolve(options.root) : 'root:default',
		options.outdir ? path.resolve(options.outdir) : 'outdir:default',
		options.splitting ?? 'splitting:default',
		options.externalPackages ?? 'externalPackages:default',
		options.target ?? 'target:default',
		options.format ?? 'format:default',
		options.sourcemap ?? 'sourcemap:default',
		options.minify ?? 'minify:default',
		options.treeshaking ?? 'treeshaking:default',
		options.naming ?? 'naming:default',
		createJsxCacheKey(options.jsx),
		createPluginCacheKey(options.plugins),
	].join('::');
}

function normalizeEntrypoints(entrypoints: BuildOptions['entrypoints']): string {
	if (Array.isArray(entrypoints)) {
		return entrypoints.map((entrypoint) => path.resolve(entrypoint)).sort().join('|');
	}

	return Object.entries(entrypoints)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, value]) => `${key}:${path.resolve(value)}`)
		.join('|');
}

/**
 * Coalesces concurrent builds with identical options into one in-flight promise.
 */
export class DedupingBuildExecutor implements BuildExecutor {
	private readonly inner: BuildExecutor;
	private readonly inFlight = new Map<string, Promise<BuildResult>>();

	constructor(inner: BuildExecutor) {
		this.inner = inner;
	}

	build(options: BuildOptions): Promise<BuildResult> {
		const key = createBuildOptionsDedupeKey(options);
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
