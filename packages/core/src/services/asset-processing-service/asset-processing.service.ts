import path from 'node:path';
import { RESOLVED_ASSETS_DIR } from '../../constants';
import { appLogger } from '../../global/app-logger';
import type { EcoPagesAppConfig } from '../../internal-types';
import { FileUtils } from '../../utils/file-utils.module';
import type { AssetDefinition, AssetKind, AssetSource, ProcessedAsset } from './assets.types';
import { ProcessorRegistry } from './processor.registry';
import {
  ContentScriptProcessor,
  ContentStylesheetProcessor,
  FileScriptProcessor,
  FileStylesheetProcessor,
  NodeModuleScriptProcessor,
} from './processors';

export class AssetProcessingService {
  static readonly RESOLVED_ASSETS_DIR = RESOLVED_ASSETS_DIR;
  private registry = new ProcessorRegistry();

  constructor(private readonly config: EcoPagesAppConfig) {}

  registerProcessor(kind: AssetKind, variant: AssetSource, processor: any): void {
    this.registry.register(kind, variant, processor);
  }

  async processDependencies(deps: AssetDefinition[], key: string): Promise<ProcessedAsset[]> {
    const results = [];
    const depsDir = path.join(this.config.absolutePaths.distDir, RESOLVED_ASSETS_DIR);

    FileUtils.ensureDirectoryExists(depsDir);

    for (const dep of deps) {
      const processor = this.registry.getProcessor(dep.kind, dep.source);
      if (!processor) {
        appLogger.error(`No processor found for ${dep.kind}/${dep.source}`);
        continue;
      }

      try {
        const processed = await processor.process(dep);
        results.push({
          key,
          ...processed,
          srcUrl: processed.filepath ? this.getSrcUrl(processed.filepath) : undefined,
        });
      } catch (error) {
        appLogger.error(
          `Failed to process dependency: ${
            error instanceof Error ? error.message : String(error)
          } for ${dep.kind}/${dep.source}`,
        );
        appLogger.debug(error as Error);
      }
    }

    await this.optimizeDependencies(depsDir);
    return results;
  }

  private getSrcUrl(filepath: string): string | undefined {
    return filepath.split(this.config.absolutePaths.distDir)[1];
  }

  private async optimizeDependencies(depsDir: string): Promise<void> {
    FileUtils.gzipDirSync(depsDir, ['css', 'js']);
  }

  static createWithDefaultProcessors(appConfig: EcoPagesAppConfig): AssetProcessingService {
    const service = new AssetProcessingService(appConfig);

    service.registerProcessor('script', 'content', new ContentScriptProcessor({ appConfig }));
    service.registerProcessor('script', 'file', new FileScriptProcessor({ appConfig }));
    service.registerProcessor('script', 'node-module', new NodeModuleScriptProcessor({ appConfig }));

    service.registerProcessor('stylesheet', 'content', new ContentStylesheetProcessor({ appConfig }));
    service.registerProcessor('stylesheet', 'file', new FileStylesheetProcessor({ appConfig }));

    return service;
  }

  getRegistry(): ProcessorRegistry {
    return this.registry;
  }
}
