import path from 'node:path';

import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { appLogger } from '../../global/app-logger.ts';
import { startupTrace } from '../../diagnostics/startup-trace.ts';
import { DevTransformBundler } from './dev-transform-bundler.ts';
import { DevTransformVendorRegistry } from './dev-transform-vendor-registry.ts';
import { materializeDevTransformStylesheet, resolveDevTransformModuleKind } from './dev-transform-module-kind.ts';
import { mergeContributorRuntimeSpecifierMaps } from './dev-transform-runtime-specifiers.ts';
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
	private readonly urlToSource = new Map<string, string>();
	private readonly sourceToUrl = new Map<string, string>();
	private readonly cache = new Map<string, CacheEntry>();
	private readonly inFlight = new Map<string, Promise<CacheEntry>>();
	private cacheGeneration = 0;

	constructor(options: DevTransformServerOptions) {
		this.appConfig = options.appConfig;
		this.onModuleDependencies = options.onModuleDependencies;
		this.contributors.push(...(options.contributors ?? []));
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

	getWatchedModules(): ReadonlyMap<string, string> {
		return this.urlToSource;
	}

	invalidateSource(sourcePath: string): void {
		const normalized = path.resolve(sourcePath);
		this.cache.delete(normalized);
	}

	invalidateAll(): void {
		this.cacheGeneration += 1;
		this.cache.clear();
		this.inFlight.clear();
		this.vendorRegistry.invalidateAll();
	}

	reset(): void {
		this.urlToSource.clear();
		this.sourceToUrl.clear();
		this.invalidateAll();
	}

	async tryHandleRequest(request: Request): Promise<Response | null> {
		const url = new URL(request.url);

		const vendorResponse = this.vendorRegistry.tryHandleVendorRequest(url.pathname);
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
			if (process.env.ECOPAGES_STARTUP_TRACE === 'true') {
				appLogger.debug(
					`[dev-transform] materialize path=${url.pathname} bytes=${entry.code.length} durationMs=${Math.round(performance.now() - startedAt)}`,
				);
			}
			return this.createJavaScriptResponse(entry.code);
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

	private resolveSourcePathFromModuleUrl(moduleUrl: string): string | undefined {
		const discoveredSourcePath = resolveDevTransformModuleSourcePath(
			this.appConfig.absolutePaths.srcDir,
			moduleUrl,
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
		const promise = this.bundler
			.transpileModule(normalized)
			.then((result) => {
				if (generation !== this.cacheGeneration) {
					throw new Error(`[dev-transform] Stale transpile result for ${normalized}`);
				}

				if (result.dependencies) {
					this.onModuleDependencies?.(normalized, result.dependencies);
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
