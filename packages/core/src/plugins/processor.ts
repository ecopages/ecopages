import path from 'node:path';
import type { BunPlugin } from 'bun';
import { resolveGeneratedPath } from '../constants';
import type { EcoPagesAppConfig } from '../internal-types';
import type { AssetDefinition } from '../services/asset-processing-service';
import { FileUtils } from '../utils/file-utils.module';

export interface ProcessorWatchConfig {
	paths: string[];
	extensions?: string[];
	onCreate?: (path: string) => Promise<void>;
	onChange?: (path: string) => Promise<void>;
	onDelete?: (path: string) => Promise<void>;
	onError?: (error: Error) => void;
}

export interface ProcessorConfig<TOptions = Record<string, unknown>> {
	name: string;
	description?: string;
	options?: TOptions;
	watch?: ProcessorWatchConfig;
}
export interface ProcessorContext {
	config: EcoPagesAppConfig;
	rootDir: string;
	srcDir: string;
	distDir: string;
	cache?: string;
}

/**
 * Interface for processor build plugins
 * This is used to pass plugins to the build process directly from the processor
 * For instance it can become very handy when dealing with virtual modules that needs to be recognized by the bundler
 * i.e. @ecopages/image-processor
 */
export abstract class Processor<TOptions = Record<string, unknown>> {
	readonly name: string;
	protected dependencies: AssetDefinition[] = [];
	protected context?: ProcessorContext;
	protected options?: TOptions;
	protected watchConfig?: ProcessorWatchConfig;

	/** Plugins that are only used during the build process */
	abstract buildPlugins?: BunPlugin[];

	/** Plugins that are used during runtime for file processing */
	abstract plugins?: BunPlugin[];

	constructor(config: ProcessorConfig<TOptions>) {
		this.name = config.name;
		this.options = config.options;
		this.watchConfig = config.watch;
	}

	setContext(appConfig: EcoPagesAppConfig): void {
		this.context = {
			config: appConfig,
			rootDir: appConfig.rootDir,
			srcDir: appConfig.absolutePaths.srcDir,
			distDir: appConfig.absolutePaths.distDir,
			cache: resolveGeneratedPath('cache', {
				root: appConfig.rootDir,
				module: this.name,
				ensureDirExists: true,
			}),
		};
	}

	abstract setup(): Promise<void>;
	abstract teardown(): Promise<void>;
	abstract process(input: unknown): Promise<unknown>;

	protected getCachePath(key: string): string {
		return `${this.context?.cache}/${key}`;
	}

	protected async readCache<T>(key: string): Promise<T | null> {
		const cachePath = this.getCachePath(key);
		try {
			const data = await FileUtils.getFileAsString(cachePath);
			return JSON.parse(data) as T;
		} catch {
			return null;
		}
	}

	protected async writeCache<T>(key: string, data: T): Promise<void> {
		if (!this.context?.cache) {
			throw new Error('Cache directory not set in context');
		}

		const cachePath = this.getCachePath(key);
		FileUtils.write(cachePath, JSON.stringify(data, null, 2));
	}

	getWatchConfig(): ProcessorWatchConfig | undefined {
		return this.watchConfig;
	}

	getDependencies(): AssetDefinition[] {
		return this.dependencies;
	}

	getName(): string {
		return this.name;
	}
}
