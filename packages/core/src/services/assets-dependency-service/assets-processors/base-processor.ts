import path from 'node:path';
import type { EcoPagesAppConfig } from '../../../internal-types';
import type { BaseAsset, ProcessedAsset, ScriptAsset } from '../assets.types';
import { RESOLVED_ASSETS_DIR } from '../../../constants';
import { FileUtils } from '../../../utils/file-utils.module';
import { rapidhash } from '../../../utils/hash';
import type { BunPlugin } from 'bun';
import { appLogger } from '../../../global/app-logger';

export abstract class BaseProcessor<T extends BaseAsset> {
  private appConfig: EcoPagesAppConfig;
  constructor({ appConfig }: { appConfig: EcoPagesAppConfig }) {
    this.appConfig = appConfig;
  }

  get isDevelopment(): boolean {
    return import.meta.env.NODE_ENV !== 'development';
  }

  get isProduction(): boolean {
    return import.meta.env.NODE_ENV === 'production';
  }

  abstract process(dep: T, key: string, config: EcoPagesAppConfig): Promise<ProcessedAsset>;

  protected getDistDir(): string {
    return path.join(this.appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR);
  }

  protected getExtension(dep: T): string {
    if (dep.kind === 'script') return 'js';
    if (dep.kind === 'stylesheet') return 'css';
    throw new Error(`Unknown asset kind: ${dep.kind}`);
  }

  protected shouldBundle(dep: T): boolean {
    if (dep.kind === 'script' && 'bundle' in dep) return (dep as ScriptAsset).bundle !== false;
    return false;
  }

  protected getBundlerOptions(dep: T): Record<string, any> {
    if (dep.kind === 'script' && 'bundleOptions' in dep) {
      return (dep as ScriptAsset).bundleOptions || {};
    }
    return {};
  }

  protected getFilepath(filename: string): string {
    const distDir = this.getDistDir();
    const filepath = path.join(distDir, filename);
    return filepath;
  }

  protected generateHash(key: string, content: string): string {
    return rapidhash(`${key}:${content}`).toString();
  }

  protected writeAssetToFile({
    content,
    name,
    ext,
  }: {
    content: string | Buffer;
    name: string;
    ext: 'css' | 'js';
  }): string {
    const filepath = this.getFilepath(`${name}.${ext}`);
    if (!FileUtils.existsSync(filepath)) FileUtils.write(filepath, content);
    return filepath;
  }

  private collectBuildPlugins(): BunPlugin[] {
    const plugins: BunPlugin[] = [];

    for (const processor of this.appConfig.processors.values()) {
      if (processor.buildPlugins) {
        plugins.push(...processor.buildPlugins);
      }
    }

    return plugins;
  }

  protected async bundleScript({
    entrypoint,
    outdir,
    ...rest
  }: {
    entrypoint: string;
    outdir: string;
  } & ScriptAsset['bundleOptions']): Promise<string> {
    const build = await Bun.build({
      entrypoints: [entrypoint],
      outdir,
      root: this.appConfig.rootDir,
      target: 'browser',
      format: 'esm',
      splitting: true,
      naming: '[name].[ext]',
      plugins: this.collectBuildPlugins(),
      ...rest,
    });

    if (!build.success) {
      for (const log of build.logs) {
        appLogger.debug(log);
      }
    }

    return build.outputs[0].path;
  }
}
