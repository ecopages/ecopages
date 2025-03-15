/**
 * This module contains the ImageProcessor class, which is used to process images for optimization and caching.
 * @module
 */

import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import { Logger } from '@ecopages/logger';
import sharp from 'sharp';
import { DEFAULT_CONFIG } from '../shared/constants';
import { ImageUtils } from '../shared/image-utils';

const appLogger = new Logger('[@ecopages/image-processor]', {
  debug: import.meta.env.ECOPAGES_LOGGER_DEBUG === 'true',
});

/**
 * Configuration for an image size variant
 * @interface ImageSize
 */
export interface ImageSize {
  /** Width in pixels */
  width: number;
  /** Label to append to filename */
  label: string;
}

/**
 * Configuration interface for the ImageProcessor
 * @interface ImageProcessorConfig
 */
export interface ImageProcessorConfig {
  /** Directory containing source images */
  imagesDir: string;
  /** Directory where processed images will be saved */
  outputDir: string;
  /** Array of sizes to generate (default: [original size]) */
  sizes: ImageSize[];
  /** Directory for caching processing metadata */
  cacheDir: string;
  /** Quality setting for image compression (default: 80) */
  quality?: number;
  /** Format for the processed images (default: 'webp') */
  format: 'webp' | 'jpeg' | 'png' | 'avif';
  /** Public URL path for the processed images (e.g., '/assets/images') */
  publicPath: string;
  /** Directory for public assets (default: 'public') */
  publicDir: string;
}

/**
 * Represents a processed image variant with its size information
 * @interface ImageVariant
 */
export interface ImageVariant {
  /** Path to the processed image */
  originalPath: string;
  /** Path to be used in HTML img tags (e.g. /assets/images/my-image.jpg) */
  displayPath: string;
  /** Width of the processed image */
  width: number;
  /** Height of the processed image */
  height: number;
  /** Label used for this variant */
  label: string;
  /** Format of the processed image */
  format: 'webp' | 'jpeg' | 'png' | 'avif';
}

/**
 * Interface representing the mapping between original and processed images
 * @interface ImageMap
 */
export interface ImageMap {
  [key: string]: {
    /** Hash of the original file for change detection */
    hash: string;
    /** Array of processed image variants with their sizes */
    variants: ImageVariant[];
    /** Path to the original image file */
    originalPath: string;
    /** Path to be used in HTML img tags (e.g. /assets/images/my-image.jpg) */
    displayPath: string;
    /** Srcset string for the image */
    srcset: string;
    /** Sizes string for the image */
    sizes: string;
  };
}

/**
 * Handles image processing operations including optimization and caching
 * @class ImageProcessor
 */
export class ImageProcessor {
  private static readonly DEFAULT_CONFIG = DEFAULT_CONFIG;

  config: ImageProcessorConfig;
  private imageMap: ImageMap = {};
  private mapPath: string;

  constructor(config: ImageProcessorConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.mapPath = path.join(this.config.cacheDir, 'image-map.json');
    FileUtils.mkdirSync(this.config.cacheDir, { recursive: true });
    FileUtils.mkdirSync(this.config.outputDir, { recursive: true });
    this.loadImageMap();
  }

  /**
   * Loads the image mapping from cache if available
   * @private
   */
  private loadImageMap() {
    if (FileUtils.existsSync(this.mapPath)) {
      this.imageMap = JSON.parse(FileUtils.readFileSync(this.mapPath, 'utf-8'));
    }
  }

  /**
   * Saves the current image mapping to cache
   * @private
   */
  private saveImageMap() {
    FileUtils.writeFileSync(this.mapPath, JSON.stringify(this.imageMap, null, 2));
  }

  /**
   * Gets absolute path from normalized path if needed
   * @private
   */
  private getProcessablePath(imagePath: string): string {
    if (FileUtils.existsSync(imagePath)) {
      return imagePath;
    }

    const entry = this.imageMap[imagePath];
    if (entry) {
      return entry.originalPath;
    }
    return imagePath;
  }

  /**
   * Generates a srcset string from processed image variants using relative paths
   * @param {ImageVariant[]} variants - Array of processed image variants
   * @returns {string} srcset attribute string
   * @private
   */
  private generateSrcsetString(variants: ImageVariant[]): string {
    return ImageUtils.generateSrcset(variants);
  }

  /**
   * Generates sizes attribute based on image variants.
   * Sizes are generated based on the variant widths and breakpoints.
   * Here we use a smart approach to generate sizes based on the variant widths.
   * We start with the largest variant and set a min-width condition for its width.
   * Then we add conditions for each variant based on the viewport width.
   * Finally, we add a catch-all for the smallest screens.
   * This approach ensures that the browser will select the correct image variant based on the viewport width.
   * @see https://developer.mozilla.org/en-US/docs/Learn/HTML/Multimedia_and_embedding/Responsive_images#resolution_switching_different_sizes
   * @param {ImageVariant[]} variants - Array of processed image variants
   * @returns {string} sizes attribute string
   * @private
   */
  private generateSizesString(variants: ImageVariant[]): string {
    return ImageUtils.generateSizes(variants);
  }

  /**
   * Get the display path from the absolute path
   */
  getDisplayPath(imagePath: string): string {
    const publicDir = this.config.publicDir || ImageProcessor.DEFAULT_CONFIG.publicDir;
    const normalizedImagesDir = path.normalize(this.config.imagesDir);
    const indexStartPublicDir = normalizedImagesDir.indexOf(publicDir);
    const relativePath = normalizedImagesDir.substring(indexStartPublicDir);
    return `/${relativePath}/${path.basename(imagePath)}`;
  }

  private async calculateDimensions(imagePath: string, targetWidth: number) {
    const metadata = await sharp(imagePath).metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;
    const aspectRatio = originalHeight / originalWidth;
    const width = Math.min(targetWidth, originalWidth);
    const height = Math.round(width * aspectRatio);
    return { width, height };
  }

  private async createVariant(
    processablePath: string,
    size: ImageSize,
    format: Required<ImageProcessorConfig['format']>,
    filename: string,
  ): Promise<ImageVariant> {
    const labelPart = size.label ? `-${size.label}` : '';
    const outputBasename = `${filename}${labelPart}.${format}`;
    const outputPath = path.join(this.config.outputDir, outputBasename);
    const publicPath = this.config.publicPath || ImageProcessor.DEFAULT_CONFIG.publicPath;
    const variantDisplayPath = path.join(publicPath, outputBasename);
    const safeFormat = format || ImageProcessor.DEFAULT_CONFIG.format;
    const safeQuality = this.config.quality || ImageProcessor.DEFAULT_CONFIG.quality;

    const { width, height } = await this.calculateDimensions(processablePath, size.width);

    await sharp(processablePath).resize(width, height)[safeFormat]({ quality: safeQuality }).toFile(outputPath);

    return {
      originalPath: outputPath,
      displayPath: variantDisplayPath,
      width,
      height,
      label: size.label,
      format: safeFormat,
    };
  }
  /**
   * Processes a single image file
   * @param {string} imagePath - Path to the image file to process
   * @returns {Promise<ImageVariant[]>} Array of processed image variants
   */
  async processImage(imagePath: string): Promise<ImageVariant[]> {
    const displayPath = this.getDisplayPath(imagePath);
    const processablePath = this.getProcessablePath(imagePath);
    const hash = FileUtils.getFileHash(processablePath);

    if (this.imageMap[displayPath]?.hash === hash) {
      return this.imageMap[displayPath].variants;
    }

    const format = this.config.format || ImageProcessor.DEFAULT_CONFIG.format;
    const filename = path.basename(processablePath, path.extname(processablePath));

    const { width: originalWidth } = await this.calculateDimensions(processablePath, Number.POSITIVE_INFINITY);

    const sizes =
      !this.config.sizes || this.config.sizes.length === 0
        ? [{ width: originalWidth, label: 'original' }]
        : this.config.sizes;

    const uniqueSizes = sizes
      .map((size) => ({
        width: Math.min(size.width, originalWidth),
        label: size.label,
      }))
      .sort((a, b) => b.width - a.width)
      .filter((size, index, array) => array.findIndex((s) => s.width === size.width) === index);

    const variants: ImageVariant[] = [];

    for await (const size of uniqueSizes) {
      const variant = await this.createVariant(processablePath, size, format, filename);
      variants.push(variant);
    }

    this.imageMap[displayPath] = {
      hash,
      variants,
      originalPath: processablePath,
      displayPath,
      srcset: this.generateSrcsetString(variants),
      sizes: this.generateSizesString(variants),
    };

    this.saveImageMap();
    return variants;
  }

  /**
   * Gets the srcset attribute string for an image from the image map
   * @param {string} imagePath - Path to the original image
   * @returns {string} srcset attribute string
   */
  getSrcset(imagePath: string): string {
    try {
      return this.imageMap[imagePath]?.srcset || '';
    } catch (error) {
      appLogger.debug(`Error getting srcset for ${imagePath}: ${error}`);
      return '';
    }
  }

  /**
   * Gets the sizes attribute string for an image from the image map
   * @param {string} imagePath - Path to the original image
   * @returns {string} sizes attribute string
   */
  getSizes(imagePath: string): string {
    try {
      return this.imageMap[imagePath]?.sizes || '';
    } catch (error) {
      appLogger.debug(`Error getting sizes for ${imagePath}: ${error}`);
      return '';
    }
  }

  /**
   * Processes all supported images in the configured directory
   * @returns {Promise<void>}
   */
  async processDirectory(): Promise<void> {
    const glob = `${this.config.imagesDir}/**/*.{jpg,jpeg,png,webp}`;
    appLogger.debug(`Processing images in ${glob}`);
    const images = await FileUtils.glob([glob]);

    for (const absolutePath of images) {
      await this.processImage(absolutePath);
    }
  }

  /**
   * Gets the configured public path
   * @returns {string} Public path for image URLs
   */
  getPublicPath(): string {
    return this.config.publicPath || '/public';
  }

  /**
   * Gets the current image map
   * @returns {ImageMap} Current image mapping
   */
  getImageMap(): ImageMap {
    return this.imageMap;
  }
}
