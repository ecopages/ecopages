import { path } from '@ecopages/file-system/path';

import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { isEcopagesEnvEnabled } from '../../env.ts';
import { appLogger } from '../../global/app-logger.ts';
import { startupTrace } from '../../diagnostics/startup-trace.ts';
import { DevTransformBundler } from './dev-transform-bundler.ts';
import { DevTransformVendorRegistry } from './dev-transform-vendor-registry.ts';
import { DevTransformInstallStamp } from './dev-transform-install-stamp.ts';
import { getStylesheetKinds, type StylesheetKinds } from '../../plugins/stylesheet-kinds.ts';
import { RESOLVED_ASSETS_DIR } from '../../constants.ts';
import { compileStylesheetModule } from '../../assets/asset-processing-service/processors/stylesheet/stylesheet-module.ts';
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
	/** Called when a vendor graph rebuild changes vendor files a browser already loaded, so connected pages can reload. */
	onVendorGraphChange?: () => void;
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
	private readonly onModuleDependencies?: (modulePath: string, dependencies: string[]) => void;
	private readonly onTransformError?: (message: string) => void;
	private readonly failedSources = new Map<string, string>();
	private readonly urlToSource = new Map<string, string>();
	private readonly sourceToUrl = new Map<string, string>();
	private readonly cache = new Map<string, CacheEntry>();
	/**
	 * The module each stylesheet last compiled to, by source path.
	 *
	 * @remarks
	 * A stylesheet whose compile fails keeps answering with it, so the importer still loads while the error shows in
	 * the page, and the next save that compiles replaces it. A stylesheet that never compiled answers `500`.
	 */
	private readonly lastCompiledStylesheets = new Map<string, string>();
	private readonly inFlight = new Map<string, Promise<CacheEntry>>();
	private cacheGeneration = 0;
	private readonly sourceGenerations = new Map<string, number>();
	private readonly extraModuleRoots: readonly string[];
	private readonly stylesheetKinds: StylesheetKinds;
	private readonly installStamp: DevTransformInstallStamp;

	constructor(options: DevTransformServerOptions) {
		this.appConfig = options.appConfig;
		this.stylesheetKinds = getStylesheetKinds(options.appConfig);
		this.onModuleDependencies = options.onModuleDependencies;
		this.onTransformError = options.onTransformError;
		this.contributors.push(...(options.contributors ?? []));
		this.extraModuleRoots = resolveWorkspacePackageWatchRoots(this.appConfig.rootDir);
		this.installStamp = new DevTransformInstallStamp(this.appConfig.rootDir);
		this.vendorRegistry = new DevTransformVendorRegistry({
			appConfig: options.appConfig,
			resolveVendorBundlePlugins: () => this.resolveVendorBundlePlugins(),
			onVendorGraphChange: options.onVendorGraphChange,
		});
		for (const contributor of this.contributors) {
			const vendorEntries = contributor.getVendorEntries?.();
			if (vendorEntries) this.vendorRegistry.addKnownEntries(vendorEntries);
		}
		this.bundler = new DevTransformBundler({
			appConfig: options.appConfig,
			contributors: this.contributors,
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
		this.bundler.addContributor(contributor);
		const vendorEntries = contributor.getVendorEntries?.();
		if (vendorEntries) this.vendorRegistry.addKnownEntries(vendorEntries);
	}

	/**
	 * Rewrites the imports of a module the browser loads as written, such as an unbundled content script.
	 *
	 * @remarks
	 * The rules are those of a transpiled module: a bare import becomes its vendor URL, with named imports of a
	 * CommonJS vendor read from its default export, and a project import becomes its dev-transform URL.
	 * `importerPath` resolves relative imports.
	 */
	async rewriteImports(code: string, importerPath: string): Promise<string> {
		const rewritten = await this.bundler.rewriteImports(code, importerPath);
		return rewritten.code;
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
		this.lastCompiledStylesheets.clear();
		this.invalidateAll();
	}

	/**
	 * @remarks
	 * An asset request first checks whether packages were installed since the last one, and if so invalidates
	 * every compiled module and vendor graph, so an install during the session takes effect without a restart.
	 */
	async tryHandleRequest(request: Request): Promise<Response | null> {
		const url = new URL(request.url);
		if (url.pathname.startsWith(`/${RESOLVED_ASSETS_DIR}/`) && this.installStamp.changed()) {
			appLogger.info('[dev-transform] Installed packages changed; rebuilding browser modules and vendors');
			this.invalidateAll();
		}

		const vendorResponse = await this.vendorRegistry.tryHandleVendorRequest(
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
			if (isEcopagesEnvEnabled('ECOPAGES_STARTUP_TRACE')) {
				appLogger.debug(
					`[dev-transform] materialize path=${url.pathname} bytes=${entry.code.length} durationMs=${Math.round(performance.now() - startedAt)}`,
				);
			}
			return this.createJavaScriptResponse(entry.code);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.failedSources.set(path.resolve(sourcePath), message);
			this.onTransformError?.(message);
			const lastCompiled =
				error instanceof StylesheetCompileError
					? this.lastCompiledStylesheets.get(path.resolve(sourcePath))
					: undefined;
			if (lastCompiled !== undefined) {
				return this.createJavaScriptResponse(lastCompiled);
			}
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
			this.stylesheetKinds,
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

	/**
	 * Compiles a stylesheet import into the module of its processed CSS, as server builds and bundles do.
	 *
	 * @remarks
	 * The stylesheets its CSS inlined are not reported as module dependencies: an edit to one reaches this module
	 * through the development stylesheet service, which plans the importing stylesheet as changed when its output does.
	 * Reporting them would send the partial itself to HMR, which no served module imports.
	 */
	private async compileStylesheet(sourcePath: string): Promise<{ code: string }> {
		try {
			return { code: (await compileStylesheetModule(this.appConfig, sourcePath)).code };
		} catch (error) {
			throw new StylesheetCompileError(sourcePath, error);
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

		const isStylesheet = this.stylesheetKinds.isStylesheet(normalized);
		const generation = this.cacheGeneration;
		const sourceGeneration = this.sourceGenerations.get(normalized) ?? 0;
		const isStale = () =>
			generation !== this.cacheGeneration ||
			sourceGeneration !== (this.sourceGenerations.get(normalized) ?? 0) ||
			!fileSystem.exists(normalized) ||
			fileSystem.hash(normalized) !== sourceHash;
		const compile: Promise<{ code: string; dependencies?: string[] }> = isStylesheet
			? this.compileStylesheet(normalized)
			: this.bundler.transpileModule(normalized);
		const promise = compile
			.then((result) => {
				if (isStale()) {
					return undefined;
				}

				if (result.dependencies) {
					this.onModuleDependencies?.(normalized, result.dependencies);
				}

				const entry: CacheEntry = { code: result.code, sourceHash };
				this.cache.set(normalized, entry);
				if (isStylesheet) this.lastCompiledStylesheets.set(normalized, result.code);
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

/**
 * A stylesheet whose Processor threw, which the server answers with the stylesheet's last compiled module when it has one.
 */
class StylesheetCompileError extends Error {
	constructor(sourcePath: string, cause: unknown) {
		const message = cause instanceof Error ? cause.message : String(cause);
		super(`[dev-transform] Failed to compile stylesheet ${sourcePath}: ${message}`, { cause });
		this.name = 'StylesheetCompileError';
	}
}
