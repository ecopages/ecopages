import { FileUtils, deepMerge } from '@ecopages/core';
import { Processor, type ProcessorConfig, type ProcessorWatchConfig } from '@ecopages/core/processors/processor';
import { type Dependency, DependencyHelpers } from '@ecopages/core/services/dependency-service';
import { Logger } from '@ecopages/logger';
import { type ImageMap, ImageProcessor, type ImageProcessorConfig } from './server/image-processor';
import { IMAGE_PROCESSOR_CONFIG_ID } from './shared/constants';

const logger = new Logger('[@ecopages/image-processor]');

/**
 * @class ImageProcessorPlugin
 * @extends {Processor<ImageProcessorConfig>}
 *
 * This plugin is responsible for processing images, optimizing them, and generating
 * necessary dependencies for client-side usage. It integrates with a file watcher
 * to automatically process images on create, change, or delete events.
 *
 * @property {string} IMAGE_MAP_CACHE_KEY - The key used for caching the image map.
 * @property {ImageProcessor} processor - The image processor instance.
 *
 * @constructor
 * @param {ProcessorConfig<ImageProcessorConfig>} config - The configuration object for the plugin.
 *
 * @method setup - Initializes the image processor, reads cached image map, processes the directory,
 *  and sets up file watching.
 * @method process - Processes a list of images.
 * @method teardown - Tears down the image processor.
 * @method getProcessor - Returns the image processor instance.
 * @method getImageMap - Returns the image map.
 * @method getClientConfig - Returns the client configuration.
 * @method generateDependencies - Generates dependencies for the image processor.
 */
export class ImageProcessorPlugin extends Processor<ImageProcessorConfig> {
  private static readonly IMAGE_MAP_CACHE_KEY = 'image-map.json';
  private declare processor: ImageProcessor;

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
    const deps: Dependency[] = [
      DependencyHelpers.createJsonScriptDependency({
        content: `${JSON.stringify(this.processor.getClientConfig())}`,
        position: 'body',
        attributes: {
          type: 'application/json',
          id: IMAGE_PROCESSOR_CONFIG_ID,
        },
      }),
    ];

    if (import.meta.env.NODE_ENV === 'development') {
      deps.push(
        DependencyHelpers.createInlineScriptDependency({
          content: `document.addEventListener("DOMContentLoaded",() => console.log("[@ecopages/image-processor] Processor is loaded"));`,
          attributes: {
            type: 'module',
          },
        }),
      );
    }

    return deps;
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
