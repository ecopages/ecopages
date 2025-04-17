import path from 'node:path';
import { FileUtils, deepMerge } from '@ecopages/core';
import { Logger } from '@ecopages/logger';
import sharp from 'sharp';
import { ImageUtils } from './image-utils';
import type { ImageMap, ImageProcessorConfig } from './plugin';
import type { ImageAttributes, ImageSpecifications, ImageVariant } from './types';

const appLogger = new Logger('[@ecopages/image-processor]', {
  debug: import.meta.env.ECOPAGES_LOGGER_DEBUG === 'true',
});

/**
 * ImageProcessor
 * This is the core class for processing images.
 * It uses the sharp library to resize and optimize images.
 */
export class ImageProcessor {
  private imageCache = new Map<string, ImageSpecifications>();
  private cacheFilePath: string;
  private config: ImageProcessorConfig;

  constructor(config: ImageProcessorConfig) {
    this.config = deepMerge({ cacheEnabled: true }, config);
    FileUtils.ensureDirectoryExists(this.config.outputDir);
    this.cacheFilePath = path.join(this.config.outputDir, '.image-cache.json');

    if (this.config.cacheEnabled) this.loadCache();
  }

  private loadCache(): void {
    try {
      if (FileUtils.existsSync(this.cacheFilePath)) {
        const cacheData = JSON.parse(FileUtils.readFileSync(this.cacheFilePath).toString());
        this.imageCache = new Map(Object.entries(cacheData));
        appLogger.debug(`Loaded image cache with ${this.imageCache.size} entries`);
      }
    } catch (error) {
      appLogger.warn('Failed to load image cache:', error as Error);
    }
  }

  private saveCache(): void {
    if (this.config.cacheEnabled === false) return;

    try {
      const cacheData = Object.fromEntries(this.imageCache.entries());
      FileUtils.writeFileSync(this.cacheFilePath, JSON.stringify(cacheData));
      appLogger.debug(`Saved image cache with ${this.imageCache.size} entries`);
    } catch (error) {
      appLogger.warn('Failed to save image cache:', error as Error);
    }
  }

  private async calculateDimensions(metadata: sharp.Metadata, targetWidth: number) {
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;
    const aspectRatio = originalHeight / originalWidth;
    const width = Math.min(targetWidth, originalWidth);
    const height = Math.round(width * aspectRatio);
    return { width, height };
  }

  private getOutputPath(imagePath: string, width: number) {
    const hash = FileUtils.getFileHash(imagePath);
    const ext = path.extname(imagePath);
    const base = path.basename(imagePath, ext);
    const filename = `${base}-${hash}-${width}.${this.config.format}`;
    return path.join(this.config.outputDir, filename);
  }

  async processImage(imagePath: string): Promise<ImageSpecifications | null> {
    try {
      const fileHash = FileUtils.getFileHash(imagePath);
      const cacheKey = `${imagePath}:${fileHash}`;

      if (this.imageCache.has(cacheKey)) {
        appLogger.debug(`Cache hit for ${imagePath}`);
        return this.imageCache.get(cacheKey) as ImageSpecifications;
      }

      FileUtils.ensureDirectoryExists(this.config.outputDir);

      const metadata = await sharp(imagePath).metadata();
      const originalWidth = metadata.width || 0;
      const originalHeight = metadata.height || 0;

      if (this.config.sizes.length === 0) {
        const outputPath = this.getOutputPath(imagePath, originalWidth);

        if (FileUtils.existsSync(outputPath)) {
          appLogger.debug(`Using existing file for ${imagePath}`);
        } else {
          await sharp(imagePath).toFormat(this.config.format, { quality: this.config.quality }).toFile(outputPath);
        }

        const src = path.join(this.config.publicPath, path.basename(outputPath));

        const imageSpecifications: ImageSpecifications = {
          attributes: {
            src,
            width: originalWidth,
            height: originalHeight,
            sizes: '',
          },
          variants: [],
        };

        this.imageCache.set(cacheKey, imageSpecifications);
        if (this.config.cacheEnabled) this.saveCache();

        return imageSpecifications;
      }

      let applicableSizes = this.config.sizes
        .filter((size) => size.width <= originalWidth)
        .sort((a, b) => b.width - a.width);

      if (applicableSizes.length === 0) {
        applicableSizes = this.config.sizes.sort((a, b) => b.width - a.width).slice(0, 1);
      }

      const variants: ImageVariant[] = await Promise.all(
        applicableSizes.map(async ({ width: targetWidth, label }) => {
          const { width, height } = await this.calculateDimensions(metadata, targetWidth);
          const outputPath = this.getOutputPath(imagePath, width);

          if (FileUtils.existsSync(outputPath)) {
            appLogger.debug(`Variant ${width}px already exists for ${imagePath}`);
          } else {
            await sharp(imagePath)
              .resize(width, height)
              .toFormat(this.config.format, { quality: this.config.quality })
              .toFile(outputPath);
          }

          const src = path.join(this.config.publicPath, path.basename(outputPath));

          return {
            width,
            height,
            src,
            label,
          };
        }),
      );

      const mainVariant = variants[0];
      const attributes: ImageAttributes = {
        src: mainVariant.src,
        width: mainVariant.width,
        height: mainVariant.height,
        sizes: ImageUtils.generateSizes(variants),
        srcset: ImageUtils.generateSrcset(variants),
      };

      const imageSpecifications: ImageSpecifications = {
        attributes,
        variants,
      };

      this.imageCache.set(cacheKey, imageSpecifications);
      if (this.config.cacheEnabled) this.saveCache();

      return imageSpecifications;
    } catch (error) {
      appLogger.error(`Failed to process image ${imagePath}:`, error as Error);
      return null;
    }
  }

  async processDirectory(): Promise<ImageMap> {
    const acceptedFormats = this.config.acceptedFormats || ['jpg', 'jpeg', 'png', 'webp'];

    const images = await FileUtils.glob([`${this.config.sourceDir}/**/*.{${acceptedFormats.join(',')}}`]);

    appLogger.debugTime('Processing images');

    const results = (
      await Promise.all(
        images.map(async (file) => {
          const processed = await this.processImage(file);
          if (!processed) return null;
          return [path.basename(file), processed] as [string, ImageSpecifications];
        }),
      )
    ).filter(Boolean) as [string, ImageSpecifications][];

    appLogger.debugTimeEnd('Processing images');
    appLogger.info(`Processed ${results.length} images`);

    this.saveCache();

    return Object.fromEntries(results);
  }
}
