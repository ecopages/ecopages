import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileSystem } from '@ecopages/file-system';
import { build, type BuildExecutor, type BuildOptions, type BuildResult } from '../../build/build-adapter.ts';
import { createServerBuildRequest } from '../../build/runtime/build-request-policy.ts';
import { resolveBuildProfileOptions } from '../../build/runtime/build-profile-options.ts';
import {
	importPagesUnifiedGraphModule,
	isPagesUnifiedGraphPage,
	shouldBuildPagesUnifiedGraph,
} from '../../build/cache/pages-unified-graph-build.ts';
import { recordPageModuleBuildInvocation } from '../../build/rolldown/rolldown-build-invocation-metrics.ts';
import { recordPageModuleLoad } from '../../diagnostics/request-pipeline-metrics.ts';
import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { createRouteModuleReuseIdentity, resolvePageModuleOutputFileName } from './route-module-build-manifest.ts';
import { getSharedRouteModuleBuildCache } from './route-module-build-cache-registry.ts';
import {
	RouteModuleDependencyHasher,
	resolveRouteModuleDependencyPaths,
	type RouteModuleDependencyHashes,
} from './route-module-dependency-hasher.ts';
import type { SourceModuleLoaderFactory } from './module-loading-types.ts';
import { supportsSourceModuleLoading } from './source-module-support.ts';

interface PageModuleImportBaseOptions {
	filePath: string;
	bypassCache?: boolean;
}

/**
 * Options for imports that must pass through the Ecopages build pipeline.
 *
 * @remarks
 * Callers should use build mode for framework-owned page modules and any other
 * source that relies on Ecopages build resolution before runtime execution.
 */
export interface PageModuleBuildImportOptions extends PageModuleImportBaseOptions {
	rootDir: string;
	outdir: string;
	buildExecutor?: BuildExecutor;
	splitting?: boolean;
	externalPackages?: boolean;
	sourceTransforms?: BuildOptions['sourceTransforms'];
	jsx?: {
		development?: boolean;
		factory?: string;
		fragment?: string;
		importSource?: string;
		runtime?: 'classic' | 'automatic';
		sideEffects?: boolean;
	};
	plugins?: EcoBuildPlugin[];
	transpileErrorMessage?: (details: string) => string;
	noOutputMessage?: (filePath: string) => string;
}
/**
 * Minimal runtime dependencies required to load page modules.
 *
 * @remarks
 * This service owns cache and runtime import policy. Hashing and build
 * execution are injected so tests can provide explicit fakes without module
 * interception.
 */
export interface PageModuleImportDependencies {
	hashFile(filePath: string): string;
	buildModule(options: Parameters<typeof build>[0], buildExecutor?: BuildExecutor): Promise<BuildResult>;
	canLoadSourceModuleFromHost(filePath: string): boolean;
	getHostModuleLoader: SourceModuleLoaderFactory;
}

interface ImportCacheEntry {
	promise: Promise<unknown>;
	dependencyHashes?: RouteModuleDependencyHashes;
}

type LoadModuleOptions = PageModuleBuildImportOptions & {
	fileHash: string;
	importCacheKey?: string;
};

/**
 * Loads page-like modules through the Ecopages build pipeline.
 *
 * This service centralizes the shared build-first import strategy used by route
 * scanning, page data loading, and request-time page inspection. In Node
 * development it can still delegate compatible source imports to the active
 * host loader, but the public contract remains one transpile-targeted module
 * loading path.
 *
 * Keeping this logic in one place prevents subtle drift in cache-busting,
 * transpilation settings, and error semantics across the different callers.
 */
export class PageModuleImportService {
	private readonly appConfig?: EcoPagesAppConfig;
	private readonly dependencies: PageModuleImportDependencies;
	private readonly dependencyHasher: RouteModuleDependencyHasher;
	private readonly importCache = new Map<string, ImportCacheEntry>();
	private developmentImportGeneration = 0;

	constructor(appConfig?: EcoPagesAppConfig, dependencies?: Partial<PageModuleImportDependencies>) {
		this.appConfig = appConfig;
		this.dependencies = {
			hashFile: dependencies?.hashFile ?? ((filePath) => fileSystem.hash(filePath)),
			buildModule: dependencies?.buildModule ?? ((options, buildExecutor) => build(options, buildExecutor)),
			canLoadSourceModuleFromHost: dependencies?.canLoadSourceModuleFromHost ?? supportsSourceModuleLoading,
			getHostModuleLoader: dependencies?.getHostModuleLoader ?? (() => undefined),
		};
		this.dependencyHasher = new RouteModuleDependencyHasher({
			hashFile: (filePath) => this.dependencies.hashFile(filePath),
			exists: (filePath) => fileSystem.exists(filePath),
		});
	}

	/**
	 * Clears the shared import cache used by framework-owned page-module loads.
	 */
	clearImportCache(): void {
		this.importCache.clear();
	}

	/**
	 * Clears in-memory import promises and dependency-hash memoization so the next
	 * import revalidates against current source and transform identity.
	 */
	invalidateDevelopmentGraph(): void {
		this.developmentImportGeneration += 1;
		this.clearImportCache();
		this.dependencyHasher.clearMemo();
	}

	/**
	 * Imports a page-like module from source.
	 *
	 * The caller controls the output directory and error wording so different
	 * subsystems can reuse the same loading mechanism while preserving their
	 * current diagnostics. Module identities stay stable for unchanged files and
	 * roll forward automatically when the source hash changes during watch mode.
	 *
	 * @typeParam T Expected module shape.
	 * @param options Runtime-specific import settings.
	 * @returns The loaded module.
	 */
	async importModule<T = unknown>(options: PageModuleBuildImportOptions): Promise<T> {
		const { filePath } = options;

		const fileHash = this.dependencies.hashFile(filePath);
		const hostModuleLoader =
			typeof Bun === 'undefined' &&
			process.env.NODE_ENV === 'development' &&
			this.dependencies.canLoadSourceModuleFromHost(filePath)
				? this.dependencies.getHostModuleLoader()
				: undefined;

		if (hostModuleLoader) {
			const sourceModuleUrl = createRuntimeModuleUrl(filePath, fileHash, this.developmentImportGeneration);
			const loadedModule = (await hostModuleLoader(sourceModuleUrl.href)) as T;
			recordPageModuleLoad('host-loader');
			return loadedModule;
		}

		if (!options.bypassCache) {
			const runtime = typeof Bun !== 'undefined' ? 'bun' : 'node-build';
			const cacheKey = [
				runtime,
				filePath,
				createRouteModuleReuseIdentity(options, options.sourceTransforms),
				fileHash,
			].join('::');
			const cachedModule = this.importCache.get(cacheKey);

			if (cachedModule) {
				if (!cachedModule.dependencyHashes) {
					const loadedModule = (await cachedModule.promise) as T;
					recordPageModuleLoad('import-cache-hit');
					return loadedModule;
				}

				if (this.dependencyHasher.matchesStoredHashes(cachedModule.dependencyHashes, filePath, fileHash)) {
					const loadedModule = (await cachedModule.promise) as T;
					recordPageModuleLoad('import-cache-hit');
					return loadedModule;
				}

				this.importCache.delete(cacheKey);
			}

			const importPromise = this.loadModule<T>({
				...options,
				fileHash,
				importCacheKey: cacheKey,
			});

			this.importCache.set(cacheKey, { promise: importPromise });

			try {
				return await importPromise;
			} catch (error) {
				this.importCache.delete(cacheKey);
				throw error;
			}
		}

		return await this.loadModule<T>({
			...options,
			fileHash,
		});
	}

	private async loadModule<T = unknown>(options: LoadModuleOptions): Promise<T> {
		const { filePath, fileHash, importCacheKey } = options;

		const {
			rootDir,
			outdir,
			splitting,
			externalPackages,
			transpileErrorMessage = (details) => `Error transpiling page module: ${details}`,
			noOutputMessage = (targetFilePath) => `No transpiled output generated for page module: ${targetFilePath}`,
		} = options;

		const outputFileName = createRuntimeBuildOutputFileName(
			resolvePageModuleOutputFileName({ filePath, fileHash }),
			this.developmentImportGeneration,
		);
		const outputNamingTemplate = outputFileName.replace(/\.mjs$/u, '.[ext]');
		const preferredOutputPath = path.join(outdir, outputFileName);
		const buildOptions: BuildOptions = this.appConfig
			? createServerBuildRequest(this.appConfig, {
					profile: 'route-module',
					entrypoints: [filePath],
					outdir,
					naming: outputNamingTemplate,
					splitting: splitting ?? true,
					jsx: options.jsx,
					plugins: options.plugins,
					root: rootDir,
					...(externalPackages !== undefined ? { externalPackages } : {}),
				})
			: {
					...resolveBuildProfileOptions('route-module', { rootDir } as EcoPagesAppConfig, {
						entrypoints: [filePath],
						outdir,
						naming: outputNamingTemplate,
						splitting: splitting ?? true,
						jsx: options.jsx,
						plugins: options.plugins,
						...(externalPackages !== undefined ? { externalPackages } : {}),
					}),
					root: rootDir,
					entrypoints: [filePath],
				};
		const cacheBuildOptions = {
			...options,
			rootDir: buildOptions.root ?? rootDir,
			outdir: buildOptions.outdir ?? outdir,
			splitting: buildOptions.splitting,
			externalPackages: buildOptions.externalPackages,
			jsx: buildOptions.jsx,
			plugins: buildOptions.plugins,
			sourceTransforms: buildOptions.sourceTransforms,
			fileHash,
		};
		const routeModuleBuildCache = this.getRouteModuleBuildCache(outdir);
		const cachedBuild = routeModuleBuildCache.lookup(cacheBuildOptions);

		if (cachedBuild) {
			const loadedModule = (await import(/* @vite-ignore */ pathToFileURL(cachedBuild.outputPath).href)) as T;
			recordPageModuleLoad('disk-cache-hit');
			return loadedModule;
		}

		if (shouldBuildPagesUnifiedGraph() && this.appConfig && isPagesUnifiedGraphPage(filePath, this.appConfig)) {
			const graphModule = await importPagesUnifiedGraphModule<T>(this.appConfig, filePath);
			if (graphModule !== undefined) {
				recordPageModuleLoad('unified-graph');
				return graphModule;
			}
		}

		recordPageModuleBuildInvocation();
		const buildResult = await this.dependencies.buildModule(buildOptions, options.buildExecutor);
		recordPageModuleLoad('cold-build', buildResult.outputs.length);

		if (!buildResult.success) {
			const details = buildResult.logs.map((log) => log.message).join(' | ');
			throw new Error(transpileErrorMessage(details));
		}

		const compiledOutput =
			buildResult.outputs.find((output) => output.path === preferredOutputPath)?.path ??
			buildResult.outputs.find((output) => /\.(?:[cm]?js)$/u.test(output.path))?.path;

		if (!compiledOutput) {
			throw new Error(noOutputMessage(filePath));
		}

		const dependencyModulePaths = resolveRouteModuleDependencyPaths(buildResult, filePath, rootDir);
		const dependencyHashes = this.dependencyHasher.createDependencyHashes(dependencyModulePaths);
		dependencyHashes[path.normalize(filePath)] = fileHash;

		if (importCacheKey) {
			const cacheEntry = this.importCache.get(importCacheKey);
			if (cacheEntry) {
				cacheEntry.dependencyHashes = dependencyHashes;
			}
		}

		routeModuleBuildCache.recordBuild({
			...cacheBuildOptions,
			outputPath: compiledOutput,
			dependencyModulePaths,
		});

		const compiledOutputUrl = pathToFileURL(compiledOutput);

		if (shouldAddRuntimeUpdateQuery()) {
			compiledOutputUrl.searchParams.set('update', `${fileHash}-${this.developmentImportGeneration}`);
		}

		return (await import(/* @vite-ignore */ compiledOutputUrl.href)) as T;
	}

	private getRouteModuleBuildCache(outdir: string) {
		return getSharedRouteModuleBuildCache(outdir, this.appConfig);
	}
}

function createRuntimeModuleUrl(filePath: string, fileHash: string, developmentImportGeneration: number): URL {
	const moduleUrl = pathToFileURL(filePath);

	if (shouldAddRuntimeUpdateQuery()) {
		moduleUrl.searchParams.set('update', `${fileHash}-${developmentImportGeneration}`);
	}

	return moduleUrl;
}

function shouldAddRuntimeUpdateQuery(): boolean {
	return process.env.NODE_ENV === 'development';
}

/**
 * Gives Bun a distinct compiled module path after development invalidation.
 *
 * @remarks
 * Bun does not reload an already-imported module when only its URL query changes.
 * A dependency edit can leave the entrypoint source hash unchanged, so the output
 * filename must include the import generation as well as the runtime query.
 */
function createRuntimeBuildOutputFileName(outputFileName: string, developmentImportGeneration: number): string {
	if (typeof Bun === 'undefined' || !shouldAddRuntimeUpdateQuery()) {
		return outputFileName;
	}

	return outputFileName.replace(/\.mjs$/u, `-${developmentImportGeneration}.mjs`);
}
