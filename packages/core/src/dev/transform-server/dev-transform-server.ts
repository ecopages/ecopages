import fs from 'node:fs';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { startupTrace } from '../../diagnostics/startup-trace.ts';
import { DevTransformBundler } from './dev-transform-bundler.ts';
import { resolveDevTransformModuleUrl } from './dev-transform-url.ts';
import type { DevTransformBundleContributor } from './types.ts';

type CacheEntry = {
	code: string;
	sourceMtimeMs: number;
};

export type DevTransformServerOptions = {
	appConfig: EcoPagesAppConfig;
	contributors?: readonly DevTransformBundleContributor[];
};

/**
 * Serves browser client modules on demand during native CLI dev.
 *
 * @remarks
 * Registration returns a stable URL immediately; the first request (or a cache miss)
 * runs esbuild in memory. Replaces blocking Rolldown `registerEntrypoint` emits.
 */
export class DevTransformServer {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly bundler: DevTransformBundler;
	private readonly urlToSource = new Map<string, string>();
	private readonly sourceToUrl = new Map<string, string>();
	private readonly cache = new Map<string, CacheEntry>();
	private readonly inFlight = new Map<string, Promise<CacheEntry>>();

	constructor(options: DevTransformServerOptions) {
		this.appConfig = options.appConfig;
		this.bundler = new DevTransformBundler({
			appConfig: options.appConfig,
			contributors: options.contributors ?? [],
		});
	}

	registerModule(sourcePath: string): string {
		const normalized = path.resolve(sourcePath);
		const existing = this.sourceToUrl.get(normalized);
		if (existing) {
			return existing;
		}

		const url = resolveDevTransformModuleUrl(this.appConfig.absolutePaths.srcDir, normalized);
		this.sourceToUrl.set(normalized, url);
		this.urlToSource.set(url, normalized);
		return url;
	}

	getRegisteredSourcePath(moduleUrl: string): string | undefined {
		return this.urlToSource.get(moduleUrl);
	}

	addContributor(contributor: DevTransformBundleContributor): void {
		this.bundler.addContributor(contributor);
	}

	getWatchedModules(): ReadonlyMap<string, string> {
		return this.urlToSource;
	}

	invalidateSource(sourcePath: string): void {
		const normalized = path.resolve(sourcePath);
		this.cache.delete(normalized);
		const url = this.sourceToUrl.get(normalized);
		if (url) {
			for (const [cachedSource] of this.cache) {
				if (cachedSource === normalized) {
					this.cache.delete(cachedSource);
				}
			}
		}
	}

	invalidateAll(): void {
		this.cache.clear();
		this.inFlight.clear();
	}

	async tryHandleRequest(request: Request): Promise<Response | null> {
		const url = new URL(request.url);
		const sourcePath = this.urlToSource.get(url.pathname);
		if (!sourcePath) {
			return null;
		}

		startupTrace.beginDevClientTransform();
		try {
			const entry = await this.materialize(sourcePath);
			return new Response(entry.code, {
				headers: {
					'Content-Type': 'application/javascript',
					'Cache-Control': 'no-store, must-revalidate',
				},
			});
		} finally {
			startupTrace.endDevClientTransform();
		}
	}

	private async materialize(sourcePath: string): Promise<CacheEntry> {
		const normalized = path.resolve(sourcePath);
		if (!fileSystem.exists(normalized)) {
			throw new Error(`[dev-transform] Missing source module: ${normalized}`);
		}

		const sourceMtimeMs = fs.statSync(normalized).mtimeMs;
		const cached = this.cache.get(normalized);
		if (cached && cached.sourceMtimeMs >= sourceMtimeMs) {
			return cached;
		}

		const pending = this.inFlight.get(normalized);
		if (pending) {
			return pending;
		}

		const promise = this.bundler.bundleEntrypoint(normalized).then((result) => {
			const entry: CacheEntry = { code: result.code, sourceMtimeMs };
			this.cache.set(normalized, entry);
			this.inFlight.delete(normalized);
			return entry;
		});

		this.inFlight.set(normalized, promise);
		return promise;
	}
}
