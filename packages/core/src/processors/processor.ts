import path from 'node:path';
import type { BunPlugin } from 'bun';
import type { EcoPagesAppConfig, ProcessorType } from '../internal-types';
import type { Dependency } from '../services/dependency.service';
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
  type: ProcessorType;
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
 */
export interface ProcessorBuildPlugin {
  /**
   * Unique name to identify the plugin
   */
  name: string;
  /**
   * Factory function that returns the build plugin
   */
  createBuildPlugin(): BunPlugin;
}

export abstract class Processor<TOptions = Record<string, unknown>> {
  static CACHE_DIR = '__cache__';
  readonly name: string;
  readonly type: ProcessorType;
  protected dependencies: Dependency[] = [];
  protected context?: ProcessorContext;
  protected options?: TOptions;
  protected watchConfig?: ProcessorWatchConfig;
  abstract buildPlugin?: ProcessorBuildPlugin;

  constructor(config: ProcessorConfig<TOptions>) {
    this.name = config.name;
    this.type = config.type;
    this.options = config.options;
    this.watchConfig = config.watch;
  }

  setContext(appConfig: EcoPagesAppConfig): void {
    this.context = {
      config: appConfig,
      rootDir: appConfig.rootDir,
      srcDir: appConfig.absolutePaths.srcDir,
      distDir: appConfig.absolutePaths.distDir,
      cache: `${appConfig.absolutePaths.distDir}/${Processor.CACHE_DIR}/${this.name}`,
    };
  }

  abstract setup(): Promise<void>;
  abstract process(input: unknown): Promise<unknown>;
  abstract teardown(): Promise<void>;

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

  protected writeCache<T>(key: string, data: T): void {
    if (!this.context?.cache) {
      throw new Error('Cache directory not set in context');
    }

    const cachePath = this.getCachePath(key);
    const cacheDir = path.dirname(cachePath);

    FileUtils.ensureDirectoryExists(cacheDir);
    FileUtils.write(cachePath, JSON.stringify(data, null, 2));
  }

  getWatchConfig(): ProcessorWatchConfig | undefined {
    return this.watchConfig;
  }

  getDependencies(): Dependency[] {
    return this.dependencies;
  }

  getName(): string {
    return this.name;
  }
}
