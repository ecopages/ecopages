import path from 'node:path';
import { RESOLVED_ASSETS_DIR } from '../../constants.ts';
import { isPathInside } from '../../utils/path-containment.ts';
import { isProductionRuntime } from '../../utils/runtime.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig, IHmrManager } from '../../config/internal-types.ts';
import { fileSystem } from '@ecopages/file-system';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import type {
	AssetDefinition,
	AssetKind,
	AssetSource,
	ContentScriptAsset,
	ContentStylesheetAsset,
	FileScriptAsset,
	FileStylesheetAsset,
	NodeModuleScriptAsset,
	ProcessedAsset,
} from './assets.types.ts';
import { deduplicateAssetDependencies, getAssetDependencyKey } from './asset-dependency-keys.ts';
import {
	ensureGroupedContentScriptsBundle,
	partitionGroupedContentScriptDependencies,
} from './grouped-content-bundles.ts';
import type { AssetProcessor } from './processor.interface.ts';
import { materializeContentScriptAsset } from './materialize-content-script-asset.ts';
import { clearPageCacheForBrowserRuntimeAssetChange } from '../browser-runtime-asset-page-cache.ts';
import { isBrowserRuntimeAssetRole } from './asset-package-role.ts';
import type { AssetProcessingIntegration } from './asset-processing-integration.ts';
import { finalizeProcessedAsset } from './finalize-processed-asset.ts';
import {
	ContentScriptProcessor,
	ContentStylesheetProcessor,
	FileScriptProcessor,
	FileStylesheetProcessor,
	NodeModuleScriptProcessor,
} from './processors/index.ts';

type CachedAsset = {
	asset: ProcessedAsset;
	sourceHash?: string;
};

type CachedGroupedBundle = {
	dependencyKeys: string[];
};

type GroupedAssetProcessor<T extends AssetDefinition> = AssetProcessor<T> & {
	processGrouped?: (dependencies: T[]) => Promise<ProcessedAsset[]>;
};

type RegisteredAssetProcessor =
	| GroupedAssetProcessor<ContentScriptAsset>
	| GroupedAssetProcessor<FileScriptAsset>
	| AssetProcessor<NodeModuleScriptAsset>
	| AssetProcessor<ContentStylesheetAsset>
	| AssetProcessor<FileStylesheetAsset>;

type AssetProcessorRecord = {
	script: {
		content?: GroupedAssetProcessor<ContentScriptAsset>;
		file?: GroupedAssetProcessor<FileScriptAsset>;
		'node-module'?: AssetProcessor<NodeModuleScriptAsset>;
	};
	stylesheet: {
		content?: AssetProcessor<ContentStylesheetAsset>;
		file?: AssetProcessor<FileStylesheetAsset>;
	};
};

function isContentScriptBundle(dependencies: AssetDefinition[]): dependencies is ContentScriptAsset[] {
	return dependencies.every(
		(dependency) => dependency.kind === 'script' && dependency.source === 'content' && dependency.groupedBundle,
	);
}

function isFileScriptBundle(dependencies: AssetDefinition[]): dependencies is FileScriptAsset[] {
	return dependencies.every(
		(dependency) => dependency.kind === 'script' && dependency.source === 'file' && dependency.groupedBundle,
	);
}

/**
 * Processes declared component and page asset dependencies for one app instance.
 *
 * @remarks
 * This service is the shared bridge between dependency declarations and emitted
 * runtime-ready assets. It owns deduplication, processor dispatch, cache reuse,
 * output URL normalization, and production gzip preparation so route rendering
 * and HMR flows do not need to understand processor-specific behavior.
 */
export class AssetProcessingService {
	static readonly RESOLVED_ASSETS_DIR = RESOLVED_ASSETS_DIR;
	private readonly processors: AssetProcessorRecord = { script: {}, stylesheet: {} };
	private hmrManager?: IHmrManager;
	private cache = new Map<string, CachedAsset>();
	private readonly groupedBundleCache = new Map<string, CachedGroupedBundle>();
	private readonly inFlight = new Map<string, Promise<unknown>>();
	private readonly gzippedFiles = new Set<string>();
	private readonly config: EcoPagesAppConfig;

	/**
	 * Creates the asset-processing service bound to one finalized app config.
	 *
	 * @remarks
	 * In development each change batch evicts the cached assets whose source or bundled inputs it
	 * touched, so a cached bundle is never served after one of its imports changed.
	 */
	constructor(config: EcoPagesAppConfig) {
		this.config = config;
		requireAppRuntime(config).buildInputIndex.subscribeToChanges((filePaths) => {
			for (const filePath of filePaths) {
				this.invalidateCacheForFile(filePath);
			}
		});
	}

	/**
	 * Set the HMR manager for the asset processing service.
	 * @param hmrManager The HMR manager to set.
	 */
	setHmrManager(hmrManager: IHmrManager) {
		this.hmrManager = hmrManager;
	}

	getHmrManager(): IHmrManager | undefined {
		return this.config.appRuntime?.hmr ?? this.hmrManager;
	}

	/**
	 * Register a processor for a specific asset kind and source.
	 * @param kind The asset kind.
	 * @param variant The asset source.
	 * @param processor The processor to register.
	 */
	registerProcessor(kind: 'script', variant: 'content', processor: GroupedAssetProcessor<ContentScriptAsset>): void;
	registerProcessor(kind: 'script', variant: 'file', processor: GroupedAssetProcessor<FileScriptAsset>): void;
	registerProcessor(kind: 'script', variant: 'node-module', processor: AssetProcessor<NodeModuleScriptAsset>): void;
	registerProcessor(kind: 'stylesheet', variant: 'content', processor: AssetProcessor<ContentStylesheetAsset>): void;
	registerProcessor(kind: 'stylesheet', variant: 'file', processor: AssetProcessor<FileStylesheetAsset>): void;
	registerProcessor(kind: AssetKind, variant: AssetSource, processor: RegisteredAssetProcessor): void {
		if (kind === 'script' && variant === 'content') {
			this.processors.script.content = processor as GroupedAssetProcessor<ContentScriptAsset>;
			return;
		}

		if (kind === 'script' && variant === 'file') {
			this.processors.script.file = processor as GroupedAssetProcessor<FileScriptAsset>;
			return;
		}

		if (kind === 'script' && variant === 'node-module') {
			this.processors.script['node-module'] = processor as AssetProcessor<NodeModuleScriptAsset>;
			return;
		}

		if (kind === 'stylesheet' && variant === 'content') {
			this.processors.stylesheet.content = processor as AssetProcessor<ContentStylesheetAsset>;
			return;
		}

		if (kind === 'stylesheet' && variant === 'file') {
			this.processors.stylesheet.file = processor as AssetProcessor<FileStylesheetAsset>;
			return;
		}

		throw new Error(`No processor slot exists for ${kind}/${variant}`);
	}

	/**
	 * Processes one dependency list into normalized emitted assets.
	 *
	 * @remarks
	 * Dependencies are deduplicated before processor execution so repeated
	 * declarations across the render tree reuse the same emitted outputs and cache
	 * entries. Returned asset order is unspecified — consumers must re-associate
	 * outputs with inputs via dependency metadata such as `groupedBundle`, not by
	 * array index alignment with the input list.
	 */
	async processDependencies(
		deps: AssetDefinition[],
		integration: AssetProcessingIntegration | undefined,
	): Promise<ProcessedAsset[]> {
		const depsDir = path.join(this.config.absolutePaths.distDir, RESOLVED_ASSETS_DIR);
		fileSystem.ensureDir(depsDir);

		const dedupedDeps = deduplicateAssetDependencies(deps);
		const preparedDeps = integration?.prepareAssetDependencies?.(dedupedDeps) ?? dedupedDeps;
		ensureGroupedContentScriptsBundle(preparedDeps);
		const results = await this.processDependenciesParallel(preparedDeps);

		await this.optimizeDependencies(results);
		return results;
	}

	/**
	 * Processes deduplicated dependencies grouped by processor type.
	 *
	 * @remarks
	 * Grouping keeps cache and processor behavior isolated by asset kind/source
	 * pair, while still allowing the overall dependency set to resolve in
	 * parallel.
	 */
	private async processDependenciesParallel(deps: AssetDefinition[]): Promise<ProcessedAsset[]> {
		const grouped = this.groupDependenciesByType(deps);
		const groupPromises = Object.entries(grouped).map(async ([, typeDeps]) => {
			const { groupedBundleDeps, ungroupedDeps } = partitionGroupedContentScriptDependencies(typeDeps);

			const typePromises = ungroupedDeps.map((dep) =>
				this.shareInFlight(getAssetDependencyKey(dep), () => this.processUngroupedDependency(dep)),
			);

			const groupedBundles = Array.from(groupedBundleDeps.values());
			const groupedKey = groupedBundles
				.flatMap((bundle) => bundle.map(getAssetDependencyKey))
				.sort()
				.join('|');
			const groupedResults = await this.shareInFlight(`grouped:${groupedKey}`, () =>
				this.processGroupedDependencyBundles(groupedBundles),
			);

			const typeResults = await Promise.all(typePromises);
			const processedTypeResults = typeResults.flatMap((result) => {
				if (!result) {
					return [];
				}

				return Array.isArray(result) ? result : [result];
			});

			return [...processedTypeResults, ...groupedResults];
		});

		const allTypeResults = await Promise.all(groupPromises);
		return allTypeResults.flat();
	}

	private async processUngroupedDependency(dep: AssetDefinition): Promise<ProcessedAsset | null> {
		const dependencyKey = getAssetDependencyKey(dep);
		const cached = this.getCachedAsset(dep, dependencyKey);
		if (cached) {
			return finalizeProcessedAsset(cached, (processed) => this.resolveProcessedAssetSrcUrl(processed));
		}

		if (dep.source === 'file' && 'filepath' in dep && !fileSystem.exists(dep.filepath)) {
			appLogger.warn(`Skipping missing ${dep.kind} file: ${dep.filepath}`);
			return null;
		}

		try {
			const processed = await this.runProcessor(dep);
			if (!processed) {
				appLogger.error(`No processor found for ${dep.kind}/${dep.source}`);
				return null;
			}

			const finalized = finalizeProcessedAsset(processed, (asset) => this.resolveProcessedAssetSrcUrl(asset));
			this.setCachedAsset(dep, dependencyKey, finalized);
			return finalized;
		} catch (error) {
			appLogger.error(`Failed to process ${dep.kind}/${dep.source} dependency:`, error);
			return null;
		}
	}

	private runProcessor(dep: AssetDefinition): Promise<ProcessedAsset> | undefined {
		switch (dep.kind) {
			case 'script':
				switch (dep.source) {
					case 'content':
						return this.processors.script.content?.process(dep);
					case 'file':
						return this.processors.script.file?.process(dep);
					case 'node-module':
						return this.processors.script['node-module']?.process(dep);
					default:
						return undefined;
				}
			case 'stylesheet':
				switch (dep.source) {
					case 'content':
						return this.processors.stylesheet.content?.process(dep);
					case 'file':
						return this.processors.stylesheet.file?.process(dep);
					default:
						return undefined;
				}
			default:
				return undefined;
		}
	}

	private async processGroupedDependencyBundles(bundles: AssetDefinition[][]): Promise<ProcessedAsset[]> {
		const processedBundles = await Promise.all(
			bundles.map(async (bundleDeps) => {
				const dependencyKeys = bundleDeps.map(getAssetDependencyKey);
				const cachedBundle = this.getCachedGroupedBundle(bundleDeps, dependencyKeys);
				if (cachedBundle) {
					return cachedBundle.map((asset) =>
						finalizeProcessedAsset(asset, (processed) => this.resolveProcessedAssetSrcUrl(processed)),
					);
				}

				try {
					const processedAssets = await this.runGroupedProcessor(bundleDeps);
					if (!processedAssets) {
						return [];
					}

					const processedByEntryKey = new Map<string, ProcessedAsset>();
					for (const processed of processedAssets) {
						if (processed.groupedBundle) {
							processedByEntryKey.set(
								`${processed.groupedBundle.id}:${processed.groupedBundle.entryName}`,
								processed,
							);
						}
					}

					const processedBundle = bundleDeps.flatMap((dep) => {
						if (dep.kind !== 'script' || !dep.groupedBundle) {
							return [];
						}
						const asset = processedByEntryKey.get(`${dep.groupedBundle.id}:${dep.groupedBundle.entryName}`);
						return asset
							? [
									finalizeProcessedAsset(asset, (processed) =>
										this.resolveProcessedAssetSrcUrl(processed),
									),
								]
							: [];
					});

					if (processedBundle.length === bundleDeps.length) {
						this.setCachedGroupedBundle(bundleDeps, dependencyKeys, processedBundle);
					}
					return processedBundle;
				} catch (error) {
					appLogger.error('Failed to process grouped dependency bundle:', error);
					return [];
				}
			}),
		);

		return processedBundles.flat();
	}

	private runGroupedProcessor(deps: AssetDefinition[]): Promise<ProcessedAsset[]> | undefined {
		if (isContentScriptBundle(deps)) {
			return this.processors.script.content?.processGrouped?.(deps);
		}
		if (isFileScriptBundle(deps)) {
			return this.processors.script.file?.processGrouped?.(deps);
		}
		return undefined;
	}

	/**
	 * Runs `run` once for `key` while an earlier call with the same key is still running.
	 *
	 * @remarks
	 * Concurrent renders that need the same uncached asset would otherwise each run its processor and
	 * write the same output file. A file change clears the map, so a render that starts after the
	 * change never joins a run that began before it.
	 */
	private shareInFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
		const running = this.inFlight.get(key) as Promise<T> | undefined;
		if (running) {
			return running;
		}

		const promise = run().finally(() => {
			if (this.inFlight.get(key) === promise) {
				this.inFlight.delete(key);
			}
		});
		this.inFlight.set(key, promise);
		return promise;
	}

	/**
	 * Groups dependencies by processor bucket.
	 */
	private groupDependenciesByType(deps: AssetDefinition[]): Record<string, AssetDefinition[]> {
		return deps.reduce(
			(acc, dep) => {
				const key = `${dep.kind}_${dep.source}`;
				if (!acc[key]) acc[key] = [];
				acc[key].push(dep);
				return acc;
			},
			{} as Record<string, AssetDefinition[]>,
		);
	}

	/**
	 * Converts a dist-local file path into its public URL.
	 */
	private getSrcUrl(filepath: string): string | undefined {
		const distDir = this.config.absolutePaths.distDir;
		if (!path.isAbsolute(filepath) || !isPathInside(filepath, distDir)) return undefined;

		return `/${path.relative(distDir, filepath).replace(/\\/g, '/')}`;
	}

	/**
	 * Normalizes the public source URL for one processed asset.
	 */
	private resolveProcessedAssetSrcUrl(processed: ProcessedAsset): string | undefined {
		if (processed.srcUrl) {
			if (this.isFilesystemPath(processed.srcUrl)) {
				const srcUrlFromPath = this.getSrcUrl(processed.srcUrl);
				if (srcUrlFromPath) return srcUrlFromPath;
			} else {
				return processed.srcUrl;
			}
		}

		if (processed.filepath) {
			return this.getSrcUrl(processed.filepath);
		}

		return undefined;
	}

	/**
	 * Returns whether a value should be interpreted as a filesystem path instead
	 * of an already-public URL.
	 */
	private isFilesystemPath(value: string): boolean {
		if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('//')) {
			return false;
		}

		if (!path.isAbsolute(value)) {
			return false;
		}

		if (isPathInside(value, this.config.absolutePaths.distDir)) {
			return true;
		}

		const rootDir = this.config.rootDir;
		if (rootDir && isPathInside(value, rootDir)) {
			return true;
		}

		return /^[A-Za-z]:\\/.test(value);
	}

	/**
	 * Applies post-processing for emitted production assets.
	 *
	 * @remarks
	 * Current optimization is intentionally conservative: only generated CSS and
	 * JavaScript files inside the app dist directory are gzipped.
	 */
	/**
	 * Gzips the emitted CSS and JS files of a production build, once per processed output.
	 *
	 * @remarks
	 * A request that finds its assets cached must not compress them again; a file is compressed
	 * again only after its processor ran and wrote it anew.
	 */
	private async optimizeDependencies(processedAssets: ProcessedAsset[]): Promise<void> {
		if (!isProductionRuntime()) {
			return;
		}

		const filesToGzip = new Set<string>();

		for (const asset of processedAssets) {
			if (!asset.filepath) {
				continue;
			}

			if (!isPathInside(asset.filepath, this.config.absolutePaths.distDir)) {
				continue;
			}

			const extension = path.extname(asset.filepath).slice(1);
			if (extension === 'css' || extension === 'js') {
				filesToGzip.add(asset.filepath);
			}
		}

		for (const filePath of filesToGzip) {
			if (!this.gzippedFiles.has(filePath) && fileSystem.exists(filePath)) {
				fileSystem.gzipFile(filePath);
				this.gzippedFiles.add(filePath);
			}
		}
	}

	/**
	 * Returns the cached processed asset for a dependency key when it is still valid.
	 *
	 * @remarks
	 * Outside production the source hash and the emitted file are re-checked on every call. In
	 * production nothing edits the sources or the output directory while the process runs, so a cached
	 * asset is reused as is instead of hashing its source on every request.
	 */
	private getCachedAsset(dep: AssetDefinition, depKey: string): ProcessedAsset | null {
		if (dep.kind === 'script' && dep.source === 'content') {
			return this.getCachedContentScriptAsset(dep, depKey);
		}

		if (isProductionRuntime()) {
			return this.cache.get(depKey)?.asset ?? null;
		}

		const currentCache = this.cache.get(depKey);
		if (!currentCache) {
			return null;
		}
		const sourceFilepath = currentCache.asset.sourceFilepath ?? this.getDependencySourceFilepath(dep);
		const sourceHash = sourceFilepath ? this.getFileSourceHash(sourceFilepath) : undefined;
		if (sourceFilepath && sourceHash === undefined) {
			this.invalidateCachedAsset(depKey);
			return null;
		}

		if (currentCache.sourceHash !== sourceHash) {
			this.invalidateCachedAsset(depKey);
			return null;
		}

		if (currentCache.asset.filepath && !fileSystem.exists(currentCache.asset.filepath)) {
			this.invalidateCachedAsset(depKey);
			return null;
		}

		return currentCache.asset;
	}

	private getGroupedBundleCacheKey(deps: AssetDefinition[]): string | undefined {
		const dependency = deps[0];
		if (dependency?.kind !== 'script' || !dependency.groupedBundle?.id) {
			return undefined;
		}

		return `${dependency.kind}:${dependency.source}:${dependency.groupedBundle.id}`;
	}

	private getCachedGroupedBundle(deps: AssetDefinition[], dependencyKeys: string[]): ProcessedAsset[] | null {
		const cacheKey = this.getGroupedBundleCacheKey(deps);
		if (!cacheKey) {
			return null;
		}

		const cachedBundle = this.groupedBundleCache.get(cacheKey);
		const sortedDependencyKeys = [...dependencyKeys].sort();
		if (!cachedBundle || JSON.stringify(cachedBundle.dependencyKeys) !== JSON.stringify(sortedDependencyKeys)) {
			this.groupedBundleCache.delete(cacheKey);
			return null;
		}

		const cachedAssets = deps.map((dep, index) => {
			const depKey = dependencyKeys[index];
			return depKey ? this.getCachedAsset(dep, depKey) : null;
		});
		if (cachedAssets.some((asset) => asset === null)) {
			this.groupedBundleCache.delete(cacheKey);
			return null;
		}

		return cachedAssets.filter((asset): asset is ProcessedAsset => asset !== null);
	}

	private setCachedGroupedBundle(
		deps: AssetDefinition[],
		dependencyKeys: string[],
		processedAssets: ProcessedAsset[],
	): void {
		for (const [index, dep] of deps.entries()) {
			const depKey = dependencyKeys[index];
			const processed = processedAssets[index];
			if (depKey && processed) {
				this.setCachedAsset(dep, depKey, processed);
			}
		}

		const cacheKey = this.getGroupedBundleCacheKey(deps);
		if (cacheKey) {
			this.groupedBundleCache.set(cacheKey, {
				dependencyKeys: [...dependencyKeys].sort(),
			});
		}
	}

	private getCachedContentScriptAsset(dep: ContentScriptAsset, depKey: string): ProcessedAsset | null {
		const filepath = this.resolveCachedContentScriptFilepath(depKey);

		if (!filepath) {
			return null;
		}

		const cached = this.cache.get(depKey);
		const materialized = materializeContentScriptAsset(dep, filepath);
		const bundledSourceFilepaths = [
			...new Set([
				...(cached?.asset.bundledSourceFilepaths ?? []),
				...(materialized.bundledSourceFilepaths ?? []),
			]),
		];
		if (bundledSourceFilepaths.length > 0) {
			materialized.bundledSourceFilepaths = bundledSourceFilepaths;
		}
		this.cache.set(depKey, {
			asset: materialized,
			sourceHash: cached?.sourceHash,
		});
		return materialized;
	}

	private resolveCachedContentScriptFilepath(depKey: string): string | undefined {
		const cached = this.cache.get(depKey);
		if (!cached?.asset.filepath) {
			return undefined;
		}

		if (!fileSystem.exists(cached.asset.filepath)) {
			this.cache.delete(depKey);
			return undefined;
		}

		return cached.asset.filepath;
	}

	/**
	 * Stores one processed asset in the dependency cache.
	 *
	 * @remarks
	 * Clears the development HTML cache when a runtime or page-script asset is stored over an
	 * existing entry under a new file path, because cached pages embed the previous URL. This
	 * happens when a grouped bundle is rebuilt for a new member and re-emits its cached siblings.
	 */
	private setCachedAsset(dep: AssetDefinition, depKey: string, asset: ProcessedAsset): void {
		const previous = this.cache.get(depKey)?.asset;
		const isBrowserRuntimeAsset = isBrowserRuntimeAssetRole(dep.packageRole);

		this.cache.set(depKey, {
			asset,
			sourceHash: this.getFileSourceHash(asset.sourceFilepath ?? this.getDependencySourceFilepath(dep)),
		});
		if (asset.filepath) {
			this.gzippedFiles.delete(asset.filepath);
		}

		if (isBrowserRuntimeAsset && previous !== undefined && previous.filepath !== asset.filepath) {
			void clearPageCacheForBrowserRuntimeAssetChange(this.config);
		}
	}

	/**
	 * Removes a cached asset and clears the development HTML cache when the
	 * removed asset can determine browser runtime URLs.
	 */
	private invalidateCachedAsset(depKey: string): void {
		const cached = this.cache.get(depKey);
		this.cache.delete(depKey);
		this.invalidateGroupedBundlesContaining(depKey);

		if (isBrowserRuntimeAssetRole(cached?.asset.packageRole)) {
			void clearPageCacheForBrowserRuntimeAssetChange(this.config);
		}
	}

	private getDependencySourceFilepath(dep: AssetDefinition): string | undefined {
		return dep.source === 'file' && 'filepath' in dep ? dep.filepath : undefined;
	}

	private getFileSourceHash(filepath: string | undefined): string | undefined {
		if (!filepath || !fileSystem.exists(filepath)) {
			return undefined;
		}

		return fileSystem.hash(filepath);
	}

	/**
	 * Removes cached assets that were produced from the given file path.
	 */
	private invalidateCacheForFile(filepath: string): void {
		this.inFlight.clear();
		const resolvedPath = path.resolve(filepath);
		let invalidatesBrowserRuntime = false;
		const invalidatedKeys = new Set<string>();
		for (const [key, value] of this.cache.entries()) {
			if (
				(value.asset.filepath && path.resolve(value.asset.filepath) === resolvedPath) ||
				(value.asset.sourceFilepath && path.resolve(value.asset.sourceFilepath) === resolvedPath) ||
				value.asset.bundledSourceFilepaths?.some((sourcePath) => path.resolve(sourcePath) === resolvedPath)
			) {
				invalidatesBrowserRuntime ||= isBrowserRuntimeAssetRole(value.asset.packageRole);
				this.cache.delete(key);
				invalidatedKeys.add(key);
			}
		}
		for (const key of invalidatedKeys) {
			this.invalidateGroupedBundlesContaining(key);
		}
		if (invalidatesBrowserRuntime) {
			void clearPageCacheForBrowserRuntimeAssetChange(this.config);
		}
	}

	private invalidateGroupedBundlesContaining(depKey: string): void {
		for (const [cacheKey, bundle] of this.groupedBundleCache) {
			if (bundle.dependencyKeys.includes(depKey)) {
				this.groupedBundleCache.delete(cacheKey);
			}
		}
	}

	/**
	 * Creates a service prewired with the default core processors.
	 */
	static createWithDefaultProcessors(appConfig: EcoPagesAppConfig): AssetProcessingService {
		const service = new AssetProcessingService(appConfig);

		service.registerProcessor('script', 'content', new ContentScriptProcessor({ appConfig }));
		service.registerProcessor(
			'script',
			'file',
			new FileScriptProcessor({ appConfig, getHmrManager: () => service.getHmrManager() }),
		);
		service.registerProcessor('script', 'node-module', new NodeModuleScriptProcessor({ appConfig }));

		service.registerProcessor('stylesheet', 'content', new ContentStylesheetProcessor({ appConfig }));
		service.registerProcessor('stylesheet', 'file', new FileStylesheetProcessor({ appConfig }));

		return service;
	}
}
