import { BaseProcessor } from './base-processor';
import type { ScriptAsset } from '../../assets.types';
import type { BunPlugin } from 'bun';
import { appLogger } from '../../../../global/app-logger';
import type { EcoPagesAppConfig } from '../../../../internal-types';

export abstract class BaseScriptProcessor<T extends ScriptAsset> extends BaseProcessor<T> {
  buildPlugins: BunPlugin[] = [];
  constructor({ appConfig }: { appConfig: EcoPagesAppConfig }) {
    super({ appConfig });
    this.buildPlugins = this.collectBuildPlugins();
  }

  protected shouldBundle(dep: T): boolean {
    return dep.bundle !== false;
  }

  protected getBundlerOptions(dep: T): Record<string, any> {
    return dep.bundleOptions || {};
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
      plugins: this.buildPlugins,
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
