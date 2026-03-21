import path from 'node:path';
import { RESOLVED_ASSETS_DIR } from '../../constants';
import { appLogger } from '../../global/app-logger';
import type { EcoPagesAppConfig, IHmrManager } from '../../internal-types';
import { rapidhash } from '../../utils/hash';
import { fileSystem } from '@ecopages/file-system';
import type { AssetDefinition, AssetKind, AssetSource, ProcessedAsset } from './assets.types';
import { isHmrAware } from './processor.interface';
import { ProcessorRegistry } from './processor.registry';
import {
	ContentScriptProcessor,
	ContentStylesheetProcessor,
	FileScriptProcessor,
	FileStylesheetProcessor,
	NodeModuleScriptProcessor,
} from './processors';

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
	private registry = new ProcessorRegistry();
	private hmrManager?: IHmrManager;
	private cache = new Map<string, { asset: ProcessedAsset }>();
	private readonly config: EcoPagesAppConfig;

	/**
	 * Creates the asset-processing service bound to one finalized app config.
	 */
	constructor(config: EcoPagesAppConfig) {
		this.config = config;
	}

	/**
	 * Set the HMR manager for the asset processing service.
	 * @param hmrManager The HMR manager to set.
	 */
	setHmrManager(hmrManager: IHmrManager) {
		this.hmrManager = hmrManager;

		for (const processor of this.registry.getAllProcessors().values()) {
			if (isHmrAware(processor)) {
				processor.setHmrManager(hmrManager);
			}
		}
	}

	getHmrManager(): IHmrManager | undefined {
		return this.hmrManager;
	}

	/**
	 * Register a processor for a specific asset kind and source.
	 * @param kind The asset kind.
	 * @param variant The asset source.
	 * @param processor The processor to register.
	 */
	registerProcessor(kind: AssetKind, variant: AssetSource, processor: any): void {
		if (this.hmrManager && isHmrAware(processor)) {
			processor.setHmrManager(this.hmrManager);
		}
		this.registry.register(kind, variant, processor);
	}

	/**
	 * Processes one dependency list into normalized emitted assets.
	 *
	 * @remarks
	 * Dependencies are deduplicated before processor execution so repeated
	 * declarations across the render tree reuse the same emitted outputs and cache
	 * entries.
	 */
	async processDependencies(deps: AssetDefinition[], key: string): Promise<ProcessedAsset[]> {
		const depsDir = path.join(this.config.absolutePaths.distDir, RESOLVED_ASSETS_DIR);
		fileSystem.ensureDir(depsDir);

		const dedupedDeps = this.deduplicateDependencies(deps);
		const results = await this.processDependenciesParallel(dedupedDeps, key);

		await this.optimizeDependencies(results);
		return results;
	}

	/**
	 * Removes duplicate dependency declarations while preserving first-seen order.
	 */
	private deduplicateDependencies(deps: AssetDefinition[]): AssetDefinition[] {
		const seen = new Map<string, AssetDefinition>();

		for (const dep of deps) {
			const key = this.getDependencyKey(dep);
			if (!seen.has(key)) {
				seen.set(key, dep);
			}
		}

		return Array.from(seen.values());
	}

	/**
	 * Builds the cache signature fragment for script dependencies that can vary by
	 * bundling policy.
	 */
	private getScriptDependencyBuildSignature(dep: AssetDefinition): string | undefined {
		if (dep.kind !== 'script') {
			return undefined;
		}

		const pluginNames = dep.bundleOptions?.plugins?.map((plugin) => plugin.name) ?? [];
		const signature = {
			bundle: dep.bundle,
			inline: dep.inline,
			excludeFromHtml: dep.excludeFromHtml,
			naming: dep.bundleOptions?.naming,
			external: dep.bundleOptions?.external,
			minify: dep.bundleOptions?.minify,
			plugins: pluginNames,
		};

		return this.generateHash(JSON.stringify(signature));
	}

	/**
	 * Derives the stable cache key for one dependency declaration.
	 */
	private getDependencyKey(dep: AssetDefinition): string {
		const parts: string[] = [dep.kind, dep.source];

		if ('filepath' in dep) {
			parts.push(dep.filepath);
		} else if ('content' in dep) {
			parts.push(`content:${this.generateHash(dep.content)}`);
		} else if ('importPath' in dep) {
			parts.push(dep.importPath);
		}

		if ('position' in dep && dep.position) {
			parts.push(dep.position);
		}

		const scriptBuildSignature = this.getScriptDependencyBuildSignature(dep);
		if (scriptBuildSignature) {
			parts.push(`build:${scriptBuildSignature}`);
		}

		return parts.join(':');
	}

	/**
	 * Hashes content used in dependency cache and signature keys.
	 */
	private generateHash(content: string): string {
		return rapidhash(content).toString();
	}

	/**
	 * Processes deduplicated dependencies grouped by processor type.
	 *
	 * @remarks
	 * Grouping keeps cache and processor behavior isolated by asset kind/source
	 * pair, while still allowing the overall dependency set to resolve in
	 * parallel.
	 */
	private async processDependenciesParallel(deps: AssetDefinition[], key: string): Promise<ProcessedAsset[]> {
		const grouped = this.groupDependenciesByType(deps);

		const groupPromises = Object.entries(grouped).map(async ([, typeDeps]) => {
			const typePromises = typeDeps.map(async (dep) => {
				const depKey = this.getDependencyKey(dep);
				const cached = this.getCachedAsset(dep, depKey);

				if (cached) {
					return { key, ...cached };
				}

				const processor = this.registry.getProcessor(dep.kind, dep.source);
				if (!processor) {
					appLogger.error(`No processor found for ${dep.kind}/${dep.source}`);
					return null;
				}

				if (dep.source === 'file' && 'filepath' in dep) {
					const fileExists = fileSystem.exists(dep.filepath);
					if (!fileExists) {
						appLogger.warn(`Skipping missing ${dep.kind} file: ${dep.filepath}`);
						return null;
					}
				}

				try {
					const processed = await processor.process(dep);
					const srcUrl = this.resolveProcessedAssetSrcUrl(processed);

					const processedWithKey = {
						key,
						...processed,
						srcUrl,
					};

					this.setCachedAsset(dep, depKey, processedWithKey);

					return processedWithKey as ProcessedAsset;
				} catch (error) {
					appLogger.error(
						`Failed to process dependency: ${
							error instanceof Error ? error.message : String(error)
						} for ${dep.kind}/${dep.source}`,
					);
					appLogger.debug(error as Error);
					return null;
				}
			});

			const typeResults = await Promise.all(typePromises);
			return typeResults.filter((result) => result !== null);
		});

		const allTypeResults = await Promise.all(groupPromises);
		return allTypeResults.flat();
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
		if (!filepath.startsWith(distDir)) return undefined;

		const relativePath = filepath.slice(distDir.length);
		const urlPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
		return urlPath.replace(/\\/g, '/');
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

		if (value.startsWith(this.config.absolutePaths.distDir)) {
			return true;
		}

		const rootDir = this.config.rootDir;
		if (rootDir && value.startsWith(rootDir)) {
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
	private async optimizeDependencies(processedAssets: ProcessedAsset[]): Promise<void> {
		if (process.env.NODE_ENV !== 'production') {
			return;
		}

		const filesToGzip = new Set<string>();

		for (const asset of processedAssets) {
			if (!asset.filepath) {
				continue;
			}

			if (!asset.filepath.startsWith(this.config.absolutePaths.distDir)) {
				continue;
			}

			const extension = path.extname(asset.filepath).slice(1);
			if (extension === 'css' || extension === 'js') {
				filesToGzip.add(asset.filepath);
			}
		}

		for (const filePath of filesToGzip) {
			if (fileSystem.exists(filePath)) {
				fileSystem.gzipFile(filePath);
			}
		}
	}

	/**
	 * Returns the cached processed asset for a dependency key when available.
	 */
	private getCachedAsset(dep: AssetDefinition, depKey: string): ProcessedAsset | null {
		const cached = this.cache.get(depKey);
		if (!cached) {
			return null;
		}

		if (cached.asset.filepath && !fileSystem.exists(cached.asset.filepath)) {
			this.cache.delete(depKey);
			return null;
		}

		return cached.asset;
	}

	/**
	 * Stores one processed asset in the dependency cache.
	 */
	private setCachedAsset(dep: AssetDefinition, depKey: string, asset: ProcessedAsset): void {
		this.cache.set(depKey, { asset });
	}

	/**
	 * Clears all cached processed assets.
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Removes cached assets that were produced from the given file path.
	 */
	invalidateCacheForFile(filepath: string): void {
		for (const [key, value] of this.cache.entries()) {
			if (value.asset.filepath === filepath) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * Creates a service prewired with the default core processors.
	 */
	static createWithDefaultProcessors(appConfig: EcoPagesAppConfig): AssetProcessingService {
		const service = new AssetProcessingService(appConfig);

		service.registerProcessor('script', 'content', new ContentScriptProcessor({ appConfig }));
		service.registerProcessor('script', 'file', new FileScriptProcessor({ appConfig }));
		service.registerProcessor('script', 'node-module', new NodeModuleScriptProcessor({ appConfig }));

		service.registerProcessor('stylesheet', 'content', new ContentStylesheetProcessor({ appConfig }));
		service.registerProcessor('stylesheet', 'file', new FileStylesheetProcessor({ appConfig }));

		return service;
	}

	/**
	 * Returns the processor registry owned by this service.
	 */
	getRegistry(): ProcessorRegistry {
		return this.registry;
	}
}
