import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { startupTrace } from '../../diagnostics/startup-trace.ts';
import { DevTransformBundler } from './dev-transform-bundler.ts';
import { resolveDevTransformModuleUrl } from './dev-transform-url.ts';
import type { DevTransformBundleContributor } from './types.ts';

type CacheEntry = {
	code: string;
	sourceHash: string;
};

export type DevTransformServerOptions = {
	appConfig: EcoPagesAppConfig;
	contributors?: readonly DevTransformBundleContributor[];
	onEntrypointDependencies?: (entrypointPath: string, dependencies: string[]) => void;
};

/**
 * Serves browser client modules on demand during native CLI dev.
 *
 * @remarks
 * Registration returns a stable URL immediately; the first request (or a cache miss)
 * runs Rolldown on demand. Replaces blocking Rolldown `registerEntrypoint` emits.
 */
export class DevTransformServer {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly bundler: DevTransformBundler;
	private readonly onEntrypointDependencies?: (entrypointPath: string, dependencies: string[]) => void;
	private readonly urlToSource = new Map<string, string>();
	private readonly sourceToUrl = new Map<string, string>();
	private readonly cache = new Map<string, CacheEntry>();
	private readonly inFlight = new Map<string, Promise<CacheEntry>>();
	private cacheGeneration = 0;

	constructor(options: DevTransformServerOptions) {
		this.appConfig = options.appConfig;
		this.onEntrypointDependencies = options.onEntrypointDependencies;
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
		this.cache.delete(path.resolve(sourcePath));
	}

	invalidateAll(): void {
		this.cacheGeneration += 1;
		this.cache.clear();
		this.inFlight.clear();
	}

	reset(): void {
		this.urlToSource.clear();
		this.sourceToUrl.clear();
		this.invalidateAll();
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
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return new Response(message, {
				status: 500,
				headers: {
					'Content-Type': 'text/plain',
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

		const sourceHash = fileSystem.hash(normalized);
		const cached = this.cache.get(normalized);
		if (cached && cached.sourceHash === sourceHash) {
			return cached;
		}

		const pending = this.inFlight.get(normalized);
		if (pending) {
			return pending;
		}

		const generation = this.cacheGeneration;
		const promise = this.bundler
			.bundleEntrypoint(normalized)
			.then((result) => {
				if (generation !== this.cacheGeneration) {
					throw new Error(`[dev-transform] Stale bundle result for ${normalized}`);
				}

				if (result.dependencies) {
					this.onEntrypointDependencies?.(normalized, result.dependencies);
				}

				const entry: CacheEntry = { code: result.code, sourceHash: fileSystem.hash(normalized) };
				this.cache.set(normalized, entry);
				return entry;
			})
			.finally(() => {
				this.inFlight.delete(normalized);
			});

		this.inFlight.set(normalized, promise);
		return promise;
	}
}
