import path from 'node:path';
import { RESOLVED_ASSETS_DIR } from '../../../../constants';
import type { EcoPagesAppConfig } from '../../../../internal-types';
import { rapidhash } from '../../../../utils/hash';
import type { BaseAsset, ProcessedAsset } from '../../assets.types';

export abstract class BaseProcessor<T extends BaseAsset> {
	protected appConfig: EcoPagesAppConfig;
	/**
	 * Cache for processed assets to avoid reprocessing the same asset multiple times.
	 * The cache key is a combination of the asset name and its hash.
	 * The cache value is the processed asset.
	 */
	protected cache: Map<string, ProcessedAsset> = new Map();

	constructor({ appConfig }: { appConfig: EcoPagesAppConfig }) {
		this.appConfig = appConfig;
	}

	get isDevelopment(): boolean {
		return import.meta.env.NODE_ENV === 'development';
	}

	get isProduction(): boolean {
		return import.meta.env.NODE_ENV === 'production';
	}

	abstract process(dep: T): Promise<ProcessedAsset>;

	protected getAssetsDir(): string {
		return path.join(this.appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR);
	}

	protected writeCacheFile(key: string, path: ProcessedAsset): void {
		this.cache.set(key, path);
	}

	protected getCacheFile(key: string): ProcessedAsset | undefined {
		return this.cache.get(key);
	}

	protected hasCacheFile(key: string): boolean {
		return this.cache.has(key);
	}

	protected generateHash(content: string): string {
		return rapidhash(content).toString();
	}

	protected buildCacheKey(identifier: string, contentHash: string, dep: T): string {
		const attrsHash = dep.attributes ? this.generateHash(JSON.stringify(dep.attributes)) : '';
		const position = dep.position ?? '';
		return `${identifier}:${contentHash}:${position}:${attrsHash}`;
	}

	protected getOrProcess(
		cacheKey: string,
		processFn: () => ProcessedAsset | Promise<ProcessedAsset>,
	): Promise<ProcessedAsset> {
		if (this.hasCacheFile(cacheKey)) {
			return Promise.resolve(this.getCacheFile(cacheKey) as ProcessedAsset);
		}

		const result = processFn();
		if (result instanceof Promise) {
			return result.then((asset) => {
				this.writeCacheFile(cacheKey, asset);
				return asset;
			});
		}

		this.writeCacheFile(cacheKey, result);
		return Promise.resolve(result);
	}
}
