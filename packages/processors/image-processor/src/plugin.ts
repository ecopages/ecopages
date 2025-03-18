import { FileUtils, deepMerge } from '@ecopages/core';
import { Processor, type ProcessorConfig, type ProcessorWatchConfig } from '@ecopages/core/processors/processor';
import { type Dependency, DependencyHelpers } from '@ecopages/core/services/dependency-service';
import { Logger } from '@ecopages/logger';
import type { FSWatcher } from 'chokidar';
import { type ImageMap, ImageProcessor, type ImageProcessorConfig } from './server/image-processor';
import { IMAGE_PROCESSOR_CONFIG_ID } from './shared/constants';

const logger = new Logger('[@ecopages/image-processor]');

export class ImageProcessorPlugin extends Processor<ImageProcessorConfig> {
  private static readonly IMAGE_MAP_CACHE_KEY = 'image-map.json';
  private declare processor: ImageProcessor;
  private declare watcher: FSWatcher;

  constructor(config: ProcessorConfig<ImageProcessorConfig>) {
    const defaultWatchConfig: ProcessorWatchConfig = {
      paths: [],
      extensions: config.options?.supportedImageFormats ?? ['jpg', 'jpeg', 'png', 'webp', 'avif'],
      onCreate: async (path: string) => this.process([path]),
      onChange: async (path) => this.process([path]),
      onDelete: async (path) => {
        if (!this.processor) return;
        FileUtils.rmSync(`${this.processor.getResolvedPath().targetImages}/${path}`);
      },
      onError: (error) => logger.error('Watcher error', { error }),
    };

    super({
      ...config,
      name: 'ecopages-image-processor',
      type: 'image',
      watch: config.watch ? deepMerge(defaultWatchConfig, config.watch) : defaultWatchConfig,
    });
  }

  private generateDependencies(): Dependency[] {
    return [
      DependencyHelpers.createJsonScriptDependency({
        content: `${JSON.stringify(this.processor.getClientConfig())}`,
        position: 'body',
        attributes: {
          type: 'application/json',
          id: IMAGE_PROCESSOR_CONFIG_ID,
        },
      }),
      DependencyHelpers.createInlineStylesheetDependency({
        content: '.lazy-image{opacity: 0;transition:opacity 0.3s;}.lazy-image.loaded{opacity: 1;}',
      }),
      DependencyHelpers.createInlineScriptDependency({
        content: `document.addEventListener("DOMContentLoaded",() => console.log("[@ecopages/image-processor] Client tools loaded"));`,
        attributes: {
          type: 'module',
        },
      }),
    ];
  }

  async setup(): Promise<void> {
    if (!this.context) {
      throw new Error('ImageProcessor requires context to be set');
    }

    logger.debug('Setting up image processor', {
      srcDir: this.context.srcDir,
      distDir: this.context.distDir,
    });

    const cachedMap = await this.readCache<ImageMap>(ImageProcessorPlugin.IMAGE_MAP_CACHE_KEY);

    const optionsPaths = this.options?.paths;

    const defaultPaths = {
      sourceImages: `${this.context.srcDir}/public/assets/images`,
      targetImages: `${this.context.distDir}/public/assets/optimized`,
      sourceUrlPrefix: '/public/assets/images',
      optimizedUrlPrefix: '/public/assets/optimized',
    };

    const paths = optionsPaths ? deepMerge(defaultPaths, optionsPaths) : defaultPaths;

    this.processor = new ImageProcessor({
      initialImageMap: cachedMap || {},
      importMeta: import.meta,
      ...this.options,
      paths,
    });

    await this.processor.processDirectory();

    this.writeCache(ImageProcessorPlugin.IMAGE_MAP_CACHE_KEY, this.processor.getImageMap());

    if (this.watchConfig) {
      this.watchConfig.paths = [this.processor.getResolvedPath().sourceImages];
    }

    this.dependencies = this.generateDependencies();
  }

  async process(images: string[]): Promise<void> {
    if (!this.processor) {
      throw new Error('ImageProcessor not initialized');
    }

    logger.debug('Processing images', { count: images.length });

    for (const image of images) {
      try {
        await this.processor.processImage(image);
      } catch (error) {
        logger.error('Failed to process image', { image, error });
      }
    }
  }

  async teardown(): Promise<void> {
    logger.debug('Tearing down image processor');
  }

  getProcessor(): ImageProcessor | undefined {
    return this.processor;
  }

  getImageMap(): ImageProcessor['imageMap'] {
    if (!this.processor) throw new Error('ImageProcessor not initialized');
    return this.processor.getImageMap();
  }

  getClientConfig(): ReturnType<ImageProcessor['getClientConfig']> {
    if (!this.processor) throw new Error('ImageProcessor not initialized');
    return this.processor.getClientConfig();
  }
}
