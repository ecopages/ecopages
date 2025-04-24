import path from 'node:path';
import { RESOLVED_ASSETS_DIR } from '../../constants';
import { appLogger } from '../../global/app-logger';
import type { EcoPagesAppConfig } from '../../internal-types';
import { FileUtils } from '../../utils/file-utils.module';
import { ProcessorRegistry } from './processor.registry';
import { NodeModuleScriptProcessor, PreBundledProcessor, ContentProcessor, FileProcessor } from './assets-processors';
import type { AssetDependency, AssetKind, AssetSource } from './assets.types';

export class AssetsDependencyService {
  static readonly RESOLVED_ASSETS_DIR = RESOLVED_ASSETS_DIR;
  private registry = new ProcessorRegistry();

  constructor(private readonly config: EcoPagesAppConfig) {}

  registerProcessor(kind: AssetKind, variant: AssetSource, processor: any): void {
    this.registry.register(kind, variant, processor);
  }

  async processDependencies(deps: AssetDependency[], key: string) {
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
        const processed = await processor.process(dep, key, this.config);
        results.push({
          key,
          ...processed,
          srcUrl: this.getSrcUrl(processed.filepath),
        });
      } catch (error) {
        appLogger.error(`Failed to process dependency: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await this.optimizeDependencies(depsDir);
    return results;
  }

  private getSrcUrl(filepath: string): string {
    return filepath.split(this.config.absolutePaths.distDir)[1];
  }

  private async optimizeDependencies(depsDir: string): Promise<void> {
    FileUtils.gzipDirSync(depsDir, ['css', 'js']);
  }

  static createWithDefaultProcessors(appConfig: EcoPagesAppConfig): AssetsDependencyService {
    const service = new AssetsDependencyService(appConfig);

    const fileProcessor = new FileProcessor({ appConfig });
    const contentProcessor = new ContentProcessor({ appConfig });
    const preBundledProcessor = new PreBundledProcessor({ appConfig });
    const nodeModuleProcessor = new NodeModuleScriptProcessor({ appConfig });

    service.registerProcessor('script', 'content', contentProcessor);
    service.registerProcessor('script', 'file', fileProcessor);
    service.registerProcessor('script', 'node-module', nodeModuleProcessor);
    // service.registerProcessor('script', 'url', preBundledProcessor);

    service.registerProcessor('stylesheet', 'content', contentProcessor);
    service.registerProcessor('stylesheet', 'file', fileProcessor);
    service.registerProcessor('stylesheet', 'file', preBundledProcessor);

    return service;
  }

  getRegistry() {
    return this.registry;
  }
}
