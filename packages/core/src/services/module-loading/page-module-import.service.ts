import { collectBuildOutputImports, getBuildEntryOutput } from '../../build/build-graph.ts';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileSystem } from '@ecopages/file-system';
import { requireAppRuntime } from '../../config/app-runtime.ts';
import {
	type BuildExecutor,
	type BuildOptions,
	type BuildResult,
	type BuildSuccess,
} from '../../build/build-adapter.ts';
import { requireBuildQueue } from '../../build/runtime/build-queue.ts';
import { createServerBuildRequest } from '../../build/runtime/build-request-policy.ts';
import {
	importPagesUnifiedGraphModule,
	isPagesUnifiedGraphPage,
	shouldBuildPagesUnifiedGraph,
} from '../../build/cache/pages-unified-graph-build.ts';
import { findIntegrationForFile } from '../../plugins/find-integration-for-file.ts';
import { recordPageModuleBuildInvocation } from '../../build/rolldown/rolldown-build-invocation-metrics.ts';
import { recordPageModuleLoad } from '../../diagnostics/request-pipeline-metrics.ts';
import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { createRouteModuleReuseIdentity, resolvePageModuleOutputFileName } from './route-module-build-manifest.ts';
import { getSharedRouteModuleBuildCache } from './route-module-build-cache-registry.ts';
import { resolveRouteModuleDependencyPaths } from './route-module-dependency-hasher.ts';
import { assertBuildSucceeded } from '../../build/build-log.ts';
import { isProductionRuntime } from '../../utils/runtime.ts';

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
	buildModule(options: BuildOptions, buildExecutor?: BuildExecutor): Promise<BuildResult>;
}

interface ImportCacheEntry {
	promise: Promise<unknown>;
}

interface RouteModuleBuildRequest {
	buildOptions: BuildOptions;
	rootDir: string;
	outdir: string;
}

type LoadModuleOptions = PageModuleBuildImportOptions & {
	fileHash: string;
	routeModuleBuild?: RouteModuleBuildRequest;
};

/**
 * Loads page-like modules through the Ecopages build pipeline.
 *
 * This service centralizes the shared build-first import strategy used by route
 * scanning, page data loading, and request-time page inspection.
 *
 * Keeping this logic in one place prevents subtle drift in cache-busting,
 * transpilation settings, and error semantics across the different callers.
 */
export class PageModuleImportService {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly dependencies: PageModuleImportDependencies;
	private readonly importCache = new Map<string, ImportCacheEntry>();
	private readonly productionFileHashes = new Map<string, string>();

	private recordPipelineLoad(outcome: Parameters<typeof recordPageModuleLoad>[1], artifactCount = 0): void {
		recordPageModuleLoad(requireAppRuntime(this.appConfig).requestPipelineMetrics, outcome, artifactCount);
	}

	constructor(appConfig: EcoPagesAppConfig, dependencies?: Partial<PageModuleImportDependencies>) {
		this.appConfig = appConfig;
		this.dependencies = {
			hashFile: dependencies?.hashFile ?? ((filePath) => fileSystem.hash(filePath)),
			buildModule:
				dependencies?.buildModule ??
				((options, buildExecutor) => (buildExecutor ?? requireBuildQueue(this.appConfig)).build(options)),
		};
	}

	/**
	 * Clears the shared import cache used by framework-owned page-module loads.
	 */
	clearImportCache(): void {
		this.importCache.clear();
	}

	getDevelopmentGeneration(): number {
		return requireAppRuntime(this.appConfig).serverInvalidation.currentGeneration();
	}

	/**
	 * Clears in-memory import promises and advances the development generation so the next
	 * import rebuilds against current source and transform identity.
	 *
	 * @remarks
	 * This is the only way a cached development import is dropped: the cache does not re-hash a module's
	 * dependencies on a hit, because the watcher records every server module closure and invalidates it.
	 */
	invalidateDevelopmentGraph(): void {
		requireAppRuntime(this.appConfig).serverInvalidation.advance();
		this.clearImportCache();
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

		if (!options.bypassCache && isProductionRuntime()) {
			return this.importUnchangedModule<T>(options);
		}

		const fileHash = this.dependencies.hashFile(filePath);

		return this.importWithCache<T>(options, fileHash, !options.bypassCache);
	}

	/**
	 * Imports a module whose sources cannot change while the process runs.
	 *
	 * @remarks
	 * In production nothing edits the sources and no watcher invalidates them: every build
	 * compiles from source in a fresh process. The entry source hash is read once per service and
	 * memoized for the build identity. An in-memory hit therefore avoids file hashing; after that
	 * cache is cleared, the route-module cache may still hash tracked dependencies to validate its
	 * compiled output.
	 */
	private async importUnchangedModule<T>(options: PageModuleBuildImportOptions): Promise<T> {
		const fileHash = this.getProductionFileHash(options.filePath);
		return this.importWithCache<T>(options, fileHash, true);
	}

	private async importWithCache<T>(
		options: PageModuleBuildImportOptions,
		fileHash: string,
		cacheEnabled: boolean,
	): Promise<T> {
		if (!cacheEnabled) {
			return this.loadModule<T>({ ...options, fileHash });
		}

		const owner = findIntegrationForFile(this.appConfig.integrations, options.filePath);
		const routeModuleBuild = owner?.compilePageModule
			? undefined
			: this.createRouteModuleBuildOptions(
					options,
					this.resolveRouteModuleOutputNaming(options.filePath, fileHash),
				);
		let cacheKey: string;
		if (owner?.compilePageModule) {
			cacheKey = [options.filePath, owner.name, fileHash].join('::');
		} else if (routeModuleBuild) {
			cacheKey = [options.filePath, createRouteModuleReuseIdentity(routeModuleBuild.buildOptions), fileHash].join(
				'::',
			);
		} else {
			throw new Error('A route-module build request was not assembled before caching.');
		}

		const cachedModule = this.importCache.get(cacheKey);
		if (cachedModule) {
			const loadedModule = (await cachedModule.promise) as T;
			this.recordPipelineLoad('import-cache-hit');
			return loadedModule;
		}

		const importPromise = this.loadModule<T>({ ...options, fileHash, routeModuleBuild });
		this.importCache.set(cacheKey, { promise: importPromise });

		try {
			return await importPromise;
		} catch (error) {
			this.importCache.delete(cacheKey);
			throw error;
		}
	}

	private getProductionFileHash(filePath: string): string {
		const cached = this.productionFileHashes.get(filePath);
		if (cached !== undefined) {
			return cached;
		}

		const fileHash = this.dependencies.hashFile(filePath);
		this.productionFileHashes.set(filePath, fileHash);
		return fileHash;
	}

	private resolveRouteModuleOutputNaming(filePath: string, fileHash: string): string {
		const outputFileName = createRuntimeBuildOutputFileName(
			resolvePageModuleOutputFileName({ filePath, fileHash }),
			this.getDevelopmentGeneration(),
		);
		return outputFileName.replace(/\.mjs$/u, '.[ext]');
	}

	private createRouteModuleBuildOptions(
		options: PageModuleBuildImportOptions,
		outputNamingTemplate: string,
	): RouteModuleBuildRequest {
		const { filePath, rootDir, outdir, splitting, externalPackages } = options;
		const buildOptions: BuildOptions = createServerBuildRequest(this.appConfig, {
			entrypoints: [filePath],
			outdir,
			naming: outputNamingTemplate,
			splitting: splitting ?? true,
			jsx: options.jsx,
			plugins: options.plugins,
			root: rootDir,
			...(externalPackages !== undefined ? { externalPackages } : {}),
		});
		return {
			buildOptions,
			rootDir: buildOptions.root ?? rootDir,
			outdir: buildOptions.outdir ?? outdir,
		};
	}

	private createRouteModuleCacheBuildOptions(
		options: LoadModuleOptions,
		routeModuleBuild: RouteModuleBuildRequest,
		fileHash: string,
	) {
		return {
			...options,
			rootDir: routeModuleBuild.rootDir,
			outdir: routeModuleBuild.outdir,
			buildOptions: routeModuleBuild.buildOptions,
			fileHash,
		};
	}

	private async tryLoadCachedRouteModuleBuild<T>(
		cacheBuildOptions: ReturnType<PageModuleImportService['createRouteModuleCacheBuildOptions']>,
		outdir: string,
	): Promise<T | undefined> {
		const cachedBuild = this.getRouteModuleBuildCache(outdir).lookup(cacheBuildOptions);
		if (!cachedBuild) {
			return undefined;
		}
		this.registerRouteModuleDependencies(
			cacheBuildOptions.filePath,
			Object.keys(cachedBuild.entry.dependencyHashes ?? {}),
		);
		const loadedModule = (await import(/* @vite-ignore */ pathToFileURL(cachedBuild.outputPath).href)) as T;
		this.recordPipelineLoad('disk-cache-hit');
		return loadedModule;
	}

	private async tryLoadPagesUnifiedGraphModule<T>(filePath: string): Promise<T | undefined> {
		if (!shouldBuildPagesUnifiedGraph() || !isPagesUnifiedGraphPage(filePath, this.appConfig)) {
			return undefined;
		}
		const graphModule = await importPagesUnifiedGraphModule<T>(this.appConfig, filePath);
		if (graphModule === undefined) {
			return undefined;
		}
		this.recordPipelineLoad('unified-graph');
		return graphModule;
	}

	private resolveCompiledRouteModuleOutput(
		buildResult: BuildSuccess,
		filePath: string,
		rootDir: string,
		noOutputMessage: (targetFilePath: string) => string,
	): string {
		const compiledOutput = getBuildEntryOutput(buildResult, filePath, rootDir);
		if (!compiledOutput) {
			throw new Error(noOutputMessage(filePath));
		}
		return compiledOutput;
	}

	private async importCompiledRouteModule<T>(
		compiledOutput: string,
		filePath: string,
		fileHash: string,
		rootDir: string,
		buildResult: BuildSuccess,
		cacheBuildOptions: ReturnType<PageModuleImportService['createRouteModuleCacheBuildOptions']>,
		outdir: string,
	): Promise<T> {
		const dependencyModulePaths = resolveRouteModuleDependencyPaths(buildResult, filePath, rootDir);
		this.registerRouteModuleDependencies(filePath, dependencyModulePaths);
		this.getRouteModuleBuildCache(outdir).recordBuild({
			...cacheBuildOptions,
			outputPath: compiledOutput,
			dependencyModulePaths,
			outputImports: collectBuildOutputImports(buildResult, compiledOutput),
		});

		const compiledOutputUrl = pathToFileURL(compiledOutput);
		if (shouldAddRuntimeUpdateQuery()) {
			compiledOutputUrl.searchParams.set('update', `${fileHash}-${this.getDevelopmentGeneration()}`);
		}
		return (await import(/* @vite-ignore */ compiledOutputUrl.href)) as T;
	}

	private registerRouteModuleDependencies(filePath: string, dependencyPaths: readonly string[]): void {
		requireAppRuntime(this.appConfig).buildInputIndex.register(
			{ consumer: 'server-route-module', key: path.resolve(filePath) },
			dependencyPaths,
		);
	}

	private async loadModule<T = unknown>(options: LoadModuleOptions): Promise<T> {
		const { filePath, fileHash } = options;
		const owner = findIntegrationForFile(this.appConfig.integrations, filePath);
		if (owner?.compilePageModule) {
			return (await owner.compilePageModule(filePath, this.appConfig)) as T;
		}
		const {
			transpileErrorMessage = (details) => `Error transpiling page module: ${details}`,
			noOutputMessage = (targetFilePath) => `No transpiled output generated for page module: ${targetFilePath}`,
		} = options;

		const routeModuleBuild =
			options.routeModuleBuild ??
			this.createRouteModuleBuildOptions(options, this.resolveRouteModuleOutputNaming(filePath, fileHash));
		const { buildOptions, rootDir: resolvedRootDir, outdir: resolvedOutdir } = routeModuleBuild;
		const cacheBuildOptions = this.createRouteModuleCacheBuildOptions(options, routeModuleBuild, fileHash);

		const cachedModule = await this.tryLoadCachedRouteModuleBuild<T>(cacheBuildOptions, resolvedOutdir);
		if (cachedModule !== undefined) {
			return cachedModule;
		}

		const unifiedGraphModule = await this.tryLoadPagesUnifiedGraphModule<T>(filePath);
		if (unifiedGraphModule !== undefined) {
			return unifiedGraphModule;
		}

		recordPageModuleBuildInvocation();
		const buildResult = await this.dependencies.buildModule(buildOptions, options.buildExecutor);
		assertBuildSucceeded(buildResult, transpileErrorMessage);
		this.recordPipelineLoad('cold-build', buildResult.outputs.length);

		const compiledOutput = this.resolveCompiledRouteModuleOutput(
			buildResult,
			filePath,
			resolvedRootDir,
			noOutputMessage,
		);
		return await this.importCompiledRouteModule(
			compiledOutput,
			filePath,
			fileHash,
			resolvedRootDir,
			buildResult,
			cacheBuildOptions,
			resolvedOutdir,
		);
	}

	private getRouteModuleBuildCache(outdir: string) {
		return getSharedRouteModuleBuildCache(outdir, this.appConfig);
	}
}

function shouldAddRuntimeUpdateQuery(): boolean {
	return process.env.NODE_ENV === 'development';
}

/**
 * Gives every runtime a distinct compiled module path after development invalidation.
 *
 * @remarks
 * A dependency edit can leave the entrypoint source hash unchanged. The filename
 * includes the import generation so the next import is a new file. A URL query
 * is not enough: Bun keeps the module it already imported for that path.
 */
function createRuntimeBuildOutputFileName(outputFileName: string, developmentImportGeneration: number): string {
	if (!shouldAddRuntimeUpdateQuery()) {
		return outputFileName;
	}

	return outputFileName.replace(/\.mjs$/u, `-${developmentImportGeneration}.mjs`);
}
