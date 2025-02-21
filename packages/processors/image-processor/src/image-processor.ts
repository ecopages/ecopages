/**
 * This module contains the ImageProcessor class
 * @module
 */

import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import sharp from 'sharp';

/**
 * Configuration for an image size variant
 * @interface ImageSize
 */
export interface ImageSize {
  /** Width in pixels */
  width: number;
  /** Suffix to append to filename */
  suffix: string;
  /** Maximum viewport width where this size should be used (optional) */
  maxViewportWidth?: number;
}

/**
 * Configuration interface for the ImageProcessor
 * @interface ImageProcessorConfig
 */
export interface ImageProcessorConfig {
  /** Directory containing source images */
  imageDir: string;
  /** Directory where processed images will be saved */
  outputDir: string;
  /** Array of sizes to generate (default: [original size]) */
  sizes?: ImageSize[];
  /** Directory for caching processing metadata */
  cacheDir: string;
  /** Maximum width for processed images (default: 1920) */
  maxWidth?: number;
  /** Quality setting for image compression (default: 80) */
  quality?: number;
  /** Format for the processed images (default: 'webp') */
  format?: 'webp' | 'jpeg' | 'png' | 'avif';
  /** Public URL path for the processed images (e.g., '/assets/images') */
  publicPath?: string;
}

/**
 * Represents a processed image variant with its size information
 * @interface ImageVariant
 */
export interface ImageVariant {
  /** Path to the processed image */
  path: string;
  /** Width of the processed image */
  width: number;
  /** Suffix used for this variant */
  suffix: string;
  /** Maximum viewport width where this variant should be used */
  maxViewportWidth?: number;
  /** Format of the processed image */
  format: string;
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
  static readonly OPTIMIZED_SUFFIX = '.opt.';
  private config: ImageProcessorConfig;
  private imageMap: ImageMap = {};
  private mapPath: string;

  constructor(config: ImageProcessorConfig) {
    this.config = config;
    this.mapPath = path.join(config.cacheDir, 'image-map.json');
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
   * Generates a srcset string from processed image variants using relative paths
   * @param {ImageVariant[]} variants - Array of processed image variants
   * @returns {string} srcset attribute string
   * @private
   */
  private generateSrcsetString(variants: ImageVariant[]): string {
    const publicPath = this.config.publicPath || '/output';
    return variants
      .map((variant) => {
        const filename = path.basename(variant.path);
        return `${publicPath}/${filename} ${variant.width}w`;
      })
      .join(', ');
  }

  /**
   * Generates sizes attribute based on image variants
   * @param {ImageVariant[]} variants - Array of processed image variants
   * @returns {string} sizes attribute string
   * @private
   */
  private generateSizesString(variants: ImageVariant[]): string {
    const variantsWithViewport = variants
      .filter((variant) => variant.maxViewportWidth)
      .sort((a, b) => (b.maxViewportWidth || 0) - (a.maxViewportWidth || 0))
      .map((variant) => `(max-width: ${variant.maxViewportWidth}px) ${variant.width}px`);

    const defaultVariant = variants.find((variant) => !variant.maxViewportWidth);
    if (defaultVariant) {
      variantsWithViewport.push(`${defaultVariant.width}px`);
    }

    return variantsWithViewport.join(', ');
  }

  /**
   * Processes a single image file
   * @param {string} imagePath - Path to the image file to process
   * @returns {Promise<ImageVariant[]>} Array of processed image variants
   */
  async processImage(imagePath: string): Promise<ImageVariant[]> {
    const hash = FileUtils.getFileHash(imagePath);

    if (this.imageMap[imagePath]?.hash === hash) {
      return this.imageMap[imagePath].variants;
    }

    const format = this.config.format || 'webp';
    const filename = path.basename(imagePath, path.extname(imagePath));
    const sizes = this.config.sizes || [{ width: this.config.maxWidth || 1920, suffix: '' }];

    const variants: ImageVariant[] = [];

    for (const size of sizes) {
      const outputPath = path.join(
        this.config.outputDir,
        `${filename}${size.suffix}${ImageProcessor.OPTIMIZED_SUFFIX}${format}`,
      );

      const image = sharp(imagePath).resize(size.width);

      switch (format) {
        case 'webp':
          await image.webp({ quality: this.config.quality || 80 }).toFile(outputPath);
          break;
        case 'jpeg':
          await image.jpeg({ quality: this.config.quality || 80 }).toFile(outputPath);
          break;
        case 'png':
          await image.png({ quality: this.config.quality || 80 }).toFile(outputPath);
          break;
        case 'avif':
          await image.avif({ quality: this.config.quality || 80 }).toFile(outputPath);
          break;
      }

      variants.push({
        path: outputPath,
        width: size.width,
        suffix: size.suffix,
        maxViewportWidth: size.maxViewportWidth,
        format: format,
      });
    }

    this.imageMap[imagePath] = {
      hash,
      variants,
      originalPath: imagePath,
      srcset: this.generateSrcsetString(variants),
      sizes: this.generateSizesString(variants),
    };

    this.saveImageMap();
    return variants;
  }

  /**
   * Generates a srcset string from processed image variants
   * @param {string} imagePath - Path to the original image
   * @returns {string} srcset attribute string
   */
  generateSrcset(imagePath: string): string {
    return this.imageMap[imagePath]?.srcset || '';
  }

  /**
   * Generates sizes attribute based on image variants
   * @param {string} imagePath - Path to the original image
   * @returns {string} sizes attribute string
   */
  generateSizes(imagePath: string): string {
    return this.imageMap[imagePath]?.sizes || '';
  }

  /**
   * Processes all supported images in the configured directory
   * @returns {Promise<void>}
   */
  async processDirectory(): Promise<void> {
    const images = await FileUtils.glob([`${this.config.imageDir}/**/*.{jpg,jpeg,png,webp}`]);

    for (const image of images) {
      await this.processImage(image);
    }
  }

  /**
   * Gets the configured public path
   * @returns {string} Public path for image URLs
   */
  getPublicPath(): string {
    return this.config.publicPath || '/output';
  }

  /**
   * Gets the current image map
   * @returns {ImageMap} Current image mapping
   */
  getImageMap(): ImageMap {
    return this.imageMap;
  }
}
