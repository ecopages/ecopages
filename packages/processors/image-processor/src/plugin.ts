/**
 * ImageProcessorPlugin
 * @module @ecopages/image-processor
 */

import path from 'node:path';
import { FileUtils, deepMerge } from '@ecopages/core';
import {
  Processor,
  type ProcessorBuildPlugin,
  type ProcessorConfig,
  type ProcessorWatchConfig,
} from '@ecopages/core/processors/processor';
import { type Dependency, DependencyHelpers } from '@ecopages/core/services/dependency-service';
import { Logger } from '@ecopages/logger';
import { createImagePlugin, createImagePluginBundler } from './bun-plugins';
import { ImageProcessor } from './image-processor';
import type { ImageProcessorConfig, ImageSpecifications } from './image-processor';

const logger = new Logger('[@ecopages/image-processor]');

/**
 * ImageProcessorPlugin
 * A Processor for optimizing images.
 */
export class ImageProcessorPlugin extends Processor<ImageProcessorConfig> {
  private declare processor: ImageProcessor;
  public processedImages: Record<string, ImageSpecifications> = {};

  constructor(config: ProcessorConfig<ImageProcessorConfig>) {
    const defaultWatchConfig: ProcessorWatchConfig = {
      paths: [],
      extensions: config.options?.acceptedFormats ?? ['jpg', 'jpeg', 'png', 'webp'],
      onCreate: async (filePath: string) => this.process([filePath]),
      onChange: async (filePath) => this.process([filePath]),
      onDelete: async (filePath) => this.deleteProcessedImagesbyPath(filePath),
      onError: (error) => logger.error('Watcher error', { error }),
    };

    super({
      ...config,
      name: 'ecopages-image-processor',
      type: 'image',
      watch: config.watch ? deepMerge(defaultWatchConfig, config.watch) : defaultWatchConfig,
    });
  }

  get buildPlugin(): ProcessorBuildPlugin {
    return {
      name: 'ecopages-image-processor',
      createBuildPlugin: () => createImagePluginBundler(this.processedImages),
    };
  }

  /**
   * Generate dependencies for processor.
   * It is ossible to define which one should be included in the final bundle based on the environment.
   * @returns
   */
  private generateDependencies(): Dependency[] {
    const deps: Dependency[] = [];

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

  /**
   * Setup the image processor and create the virtual module.
   */
  async setup(): Promise<void> {
    if (!this.context) {
      throw new Error('ImageProcessor requires context to be set');
    }

    logger.debug('Setting up image processor', {
      srcDir: this.context.srcDir,
      distDir: this.context.distDir,
    });

    const defaultConfig = {
      sourceDir: `${this.context.srcDir}/public/assets/images`,
      outputDir: `${this.context.distDir}/public/assets/optimized`,
      publicPath: '/public/assets/optimized',
      sizes: [],
      quality: 80,
      format: 'webp' as const,
    };

    const config = this.options ? deepMerge(defaultConfig, this.options) : defaultConfig;

    this.processor = new ImageProcessor(config);

    this.processedImages = await this.processor.processDirectory();

    Bun.plugin(createImagePlugin(this.processedImages));

    if (this.watchConfig) {
      this.watchConfig.paths = [config.sourceDir];
    }

    this.dependencies = this.generateDependencies();
  }

  /**
   * Process images.
   * @param images
   */
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

  /**
   * Delete processed images using the original image path.
   * @param imagePath
   */
  async deleteProcessedImagesbyPath(imagePath: string): Promise<void> {
    if (!this.processor) {
      throw new Error('ImageProcessor not initialized');
    }

    logger.debug('Deleting processed images', { path: imagePath });

    try {
      const baseNameWithoutExt = path.basename(imagePath, path.extname(imagePath));

      if (!this.options) {
        throw new Error('Options not set');
      }

      const outputDir = this.options.outputDir;

      const files = await FileUtils.glob([`${outputDir}/${baseNameWithoutExt}-*`]);

      await Promise.all(
        files.map(async (file) => {
          try {
            await FileUtils.rmAsync(file);
            logger.debug('Deleted processed image', { file });
          } catch (error) {
            logger.error('Failed to delete processed image', { file, error });
          }
        }),
      );

      delete this.processedImages[path.basename(imagePath)];
    } catch (error) {
      logger.error('Failed to delete processed images', { path: imagePath, error });
    }
  }

  /**
   * Teardown the image processor.
   */
  async teardown(): Promise<void> {
    logger.debug('Tearing down image processor');
  }

  /**
   * Get the image processor instance.
   * @returns The image processor instance.
   */
  getProcessor(): ImageProcessor | undefined {
    return this.processor;
  }
}
