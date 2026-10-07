import path from 'node:path';

import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { appLogger } from '../../global/app-logger.ts';
import { startupTrace } from '../../diagnostics/startup-trace.ts';
import { DevTransformBundler } from './dev-transform-bundler.ts';
import { DevTransformVendorRegistry } from './dev-transform-vendor-registry.ts';
import { materializeDevTransformStylesheet, resolveDevTransformModuleKind } from './dev-transform-module-kind.ts';
import { mergeContributorRuntimeSpecifierMaps } from './dev-transform-runtime-specifiers.ts';
import { resolveWorkspacePackageWatchRoots } from '../../watchers/workspace-package-watch-roots.ts';
import { resolveDevTransformModuleSourcePath, resolveDevTransformModuleUrl } from './dev-transform-url.ts';
import type { DevTransformBundleContributor } from './types.ts';
import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';

type CacheEntry = {
	code: string;
	sourceHash: string;
};

export type DevTransformServerOptions = {
	appConfig: EcoPagesAppConfig;
	contributors?: readonly DevTransformBundleContributor[];
	onModuleDependencies?: (modulePath: string, dependencies: string[]) => void;
	/** Called with the error message when a module fails to transpile, before the 500 response is returned. */
	onTransformError?: (message: string) => void;
};

/**
 * Serves per-module browser ESM on demand during native CLI dev.
 *
 * @remarks
 * Registration returns a stable URL immediately; the first request (or a cache miss)
 * transpiles one source file and rewrites imports to dev-transform or vendor URLs.
 */
export class DevTransformServer {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly bundler: DevTransformBundler;
	private readonly vendorRegistry: DevTransformVendorRegistry;
	private readonly contributors: DevTransformBundleContributor[] = [];
	private readonly runtimeSpecifierMap = new Map<string, string>();
	private readonly onModuleDependencies?: (modulePath: string, dependencies: string[]) => void;
	private readonly onTransformError?: (message: string) => void;
	private readonly failedSources = new Map<string, string>();
	private readonly urlToSource = new Map<string, string>();
	private readonly sourceToUrl = new Map<string, string>();
	private readonly cache = new Map<string, CacheEntry>();
	private readonly inFlight = new Map<string, Promise<CacheEntry>>();
	private cacheGeneration = 0;
	private readonly sourceGenerations = new Map<string, number>();
	private readonly extraModuleRoots: readonly string[];

	constructor(options: DevTransformServerOptions) {
		this.appConfig = options.appConfig;
		this.onModuleDependencies = options.onModuleDependencies;
		this.onTransformError = options.onTransformError;
		this.contributors.push(...(options.contributors ?? []));
		this.extraModuleRoots = resolveWorkspacePackageWatchRoots(this.appConfig.rootDir);
		this.rebuildRuntimeSpecifierMap();
		this.vendorRegistry = new DevTransformVendorRegistry({
			appConfig: options.appConfig,
			getRuntimeSpecifierMap: () => this.runtimeSpecifierMap,
			resolveVendorBundlePlugins: () => this.resolveVendorBundlePlugins(),
		});
		this.bundler = new DevTransformBundler({
			appConfig: options.appConfig,
			contributors: this.contributors,
			getRuntimeSpecifierMap: () => this.runtimeSpecifierMap,
			vendorRegistry: this.vendorRegistry,
			extraModuleRoots: this.extraModuleRoots,
		});
	}

	registerModule(sourcePath: string): string {
		const normalized = path.resolve(sourcePath);
		const existing = this.sourceToUrl.get(normalized);
		if (existing) {
			return existing;
		}

		const url = resolveDevTransformModuleUrl(
			this.appConfig.absolutePaths.srcDir,
			normalized,
			this.extraModuleRoots,
		);
		this.sourceToUrl.set(normalized, url);
		this.urlToSource.set(url, normalized);
		return url;
	}

	getRegisteredSourcePath(moduleUrl: string): string | undefined {
		return this.urlToSource.get(moduleUrl);
	}

	addContributor(contributor: DevTransformBundleContributor): void {
		this.contributors.push(contributor);
		this.rebuildRuntimeSpecifierMap();
		this.bundler.addContributor(contributor);
	}

	private rebuildRuntimeSpecifierMap(): void {
		this.runtimeSpecifierMap.clear();
		for (const [specifier, url] of mergeContributorRuntimeSpecifierMaps(this.contributors)) {
			this.runtimeSpecifierMap.set(specifier, url);
		}
	}

	private async resolveVendorBundlePlugins(): Promise<readonly EcoBuildPlugin[]> {
		const plugins: EcoBuildPlugin[] = [];
		for (const contributor of this.contributors) {
			if (!contributor.getVendorBundlePlugins) {
				continue;
			}

			plugins.push(...(await contributor.getVendorBundlePlugins()));
		}

		return plugins;
	}

	/** Error messages of modules whose last transpile failed, since the last {@link clearFailures}. */
	getFailureMessages(): string[] {
		return [...this.failedSources.values()];
	}

	/**
	 * @remarks
	 * A failure is recorded under the requested module, but its cause can be another file, or the module can
	 * be removed. The HMR manager therefore clears every failure on each file change; a module that still
	 * fails records its error again on its next request.
	 */
	clearFailures(): void {
		this.failedSources.clear();
	}

	getWatchedModules(): ReadonlyMap<string, string> {
		return this.urlToSource;
	}

	/**
	 * @remarks
	 * Marks pending work stale while preserving one in-flight compile per source.
	 * Requests awaiting that work retry against the current source when it completes.
	 */
	invalidateSource(sourcePath: string): void {
		const normalized = path.resolve(sourcePath);
		this.cache.delete(normalized);
		this.sourceGenerations.set(normalized, (this.sourceGenerations.get(normalized) ?? 0) + 1);
	}

	invalidateAll(): void {
		this.cacheGeneration += 1;
		this.cache.clear();
		this.failedSources.clear();
		this.sourceGenerations.clear();
		this.vendorRegistry.invalidateAll();
	}

	reset(): void {
		this.urlToSource.clear();
		this.sourceToUrl.clear();
		this.invalidateAll();
	}

	async tryHandleRequest(request: Request): Promise<Response | null> {
		const url = new URL(request.url);

		const vendorResponse = this.vendorRegistry.tryHandleVendorRequest(
			url.pathname,
			request.headers.get('If-None-Match'),
		);
		if (vendorResponse) {
			return vendorResponse;
		}

		const sourcePath = this.urlToSource.get(url.pathname) ?? this.resolveSourcePathFromModuleUrl(url.pathname);
		if (!sourcePath) {
			return null;
		}

		startupTrace.beginDevClientTransform();
		const startedAt = performance.now();
		try {
			const entry = await this.materialize(sourcePath);
			this.failedSources.delete(path.resolve(sourcePath));
			if (process.env.ECOPAGES_STARTUP_TRACE === 'true') {
				appLogger.debug(
					`[dev-transform] materialize path=${url.pathname} bytes=${entry.code.length} durationMs=${Math.round(performance.now() - startedAt)}`,
				);
			}
			return this.createJavaScriptResponse(entry.code);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.failedSources.set(path.resolve(sourcePath), message);
			this.onTransformError?.(message);
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

	private resolveSourcePathFromModuleUrl(moduleUrl: string): string | undefined {
		const discoveredSourcePath = resolveDevTransformModuleSourcePath(
			this.appConfig.absolutePaths.srcDir,
			moduleUrl,
			this.extraModuleRoots,
		);
		if (!discoveredSourcePath) {
			return undefined;
		}

		this.registerModule(discoveredSourcePath);
		return path.resolve(discoveredSourcePath);
	}

	private createJavaScriptResponse(code: string): Response {
		return new Response(code, {
			headers: {
				'Content-Type': 'application/javascript',
				'Cache-Control': 'no-store, must-revalidate',
			},
		});
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

		const moduleKind = resolveDevTransformModuleKind(normalized);
		if (moduleKind === 'stylesheet') {
			const entry: CacheEntry = {
				code: materializeDevTransformStylesheet(fileSystem.readFileSync(normalized)),
				sourceHash,
			};
			this.cache.set(normalized, entry);
			return entry;
		}

		const generation = this.cacheGeneration;
		const sourceGeneration = this.sourceGenerations.get(normalized) ?? 0;
		const isStale = () =>
			generation !== this.cacheGeneration ||
			sourceGeneration !== (this.sourceGenerations.get(normalized) ?? 0) ||
			!fileSystem.exists(normalized) ||
			fileSystem.hash(normalized) !== sourceHash;
		const promise = this.bundler
			.transpileModule(normalized)
			.then((result) => {
				if (isStale()) {
					return undefined;
				}

				if (result.dependencies) {
					this.onModuleDependencies?.(normalized, result.dependencies);
				}

				const entry: CacheEntry = { code: result.code, sourceHash };
				this.cache.set(normalized, entry);
				return entry;
			})
			.catch((error: unknown) => {
				if (isStale()) {
					return undefined;
				}
				throw error;
			})
			.finally(() => {
				this.inFlight.delete(normalized);
			})
			.then((entry) => entry ?? this.materialize(normalized));

		this.inFlight.set(normalized, promise);
		return promise;
	}
}
