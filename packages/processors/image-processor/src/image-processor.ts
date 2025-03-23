import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import { Logger } from '@ecopages/logger';
import sharp from 'sharp';
import { ImageUtils } from './image-utils';
import type { ImageAttributes, ImageMap, ImageProcessorConfig, ImageSpecifications, ImageVariant } from './plugin';

const appLogger = new Logger('[@ecopages/image-processor]');

/**
 * ImageProcessor
 * This is the core class for processing images.
 * It uses the sharp library to resize and optimize images.
 */
export class ImageProcessor {
  private imageCache = new Map<string, ImageSpecifications>();

  constructor(private config: ImageProcessorConfig) {
    FileUtils.ensureDirectoryExists(this.config.outputDir);
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
      if (this.imageCache.has(imagePath)) {
        return this.imageCache.get(imagePath) as ImageSpecifications;
      }

      FileUtils.ensureDirectoryExists(this.config.outputDir);

      const metadata = await sharp(imagePath).metadata();
      const originalWidth = metadata.width || 0;
      const originalHeight = metadata.height || 0;

      if (this.config.sizes.length === 0) {
        const outputPath = this.getOutputPath(imagePath, originalWidth);

        await sharp(imagePath).toFormat(this.config.format, { quality: this.config.quality }).toFile(outputPath);

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

        this.imageCache.set(imagePath, imageSpecifications);
        return imageSpecifications;
      }

      let applicableSizes = this.config.sizes.filter((size) => size.width <= originalWidth);

      if (applicableSizes.length === 0) {
        applicableSizes = this.config.sizes.sort((a, b) => a.width - b.width).slice(0, 1);
      }

      const variants: ImageVariant[] = await Promise.all(
        applicableSizes.map(async ({ width: targetWidth, label }) => {
          const { width, height } = await this.calculateDimensions(metadata, targetWidth);
          const outputPath = this.getOutputPath(imagePath, width);

          await sharp(imagePath)
            .resize(width, height)
            .toFormat(this.config.format, { quality: this.config.quality })
            .toFile(outputPath);

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

      this.imageCache.set(imagePath, imageSpecifications);

      return imageSpecifications;
    } catch (error) {
      appLogger.error(`Failed to process image ${imagePath}:`, error as Error);
      return null;
    }
  }

  async processDirectory(): Promise<ImageMap> {
    const acceptedFormats = this.config.acceptedFormats || ['jpg', 'jpeg', 'png', 'webp'];

    const images = await FileUtils.glob([`${this.config.sourceDir}/**/*.{${acceptedFormats.join(',')}}`]);

    appLogger.time('Processing images');

    const results = (await Promise.all(
      images.map(async (file) => {
        const processed = await this.processImage(file);
        if (!processed) return null;
        return [path.basename(file), processed];
      }),
    )) as [string, ImageSpecifications][];

    appLogger.timeEnd('Processing images');
    appLogger.info(`Processed ${results.length} images`);

    return Object.fromEntries(results.filter(Boolean));
  }
}
