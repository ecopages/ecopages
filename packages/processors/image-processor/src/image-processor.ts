/**
 * This module contains the ImageProcessor class, which is used to process images for optimization and caching.
 * @module
 */

import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import { Logger } from '@ecopages/logger';
import sharp from 'sharp';

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
  /** Directory for public assets (default: 'public') */
  publicDir?: string;
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
  /** Label used for this variant */
  label: string;
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
  config: ImageProcessorConfig;
  private imageMap: ImageMap = {};
  private mapPath: string;

  constructor(config: ImageProcessorConfig) {
    this.config = config;
    this.mapPath = path.join(config.cacheDir, 'image-map.json');
    FileUtils.mkdirSync(config.cacheDir, { recursive: true });
    FileUtils.mkdirSync(config.outputDir, { recursive: true });
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
   * Normalizes an image path for processing
   * @param {string} absolutePath - Absolute path to the image file
   * @returns {string} Normalized path for processing
   * @private
   */
  private normalizeImagePath(absolutePath: string): string {
    if (!absolutePath) {
      return '';
    }

    const normalizedPath = path.normalize(absolutePath);

    if (this.imageMap[normalizedPath]) {
      return normalizedPath;
    }

    if (this.config.publicDir) {
      const publicDir = path.normalize(this.config.publicDir);
      const index = normalizedPath.indexOf(publicDir);

      if (index !== -1) {
        return `/${normalizedPath
          .slice(index + publicDir.length)
          .split(path.sep)
          .filter(Boolean)
          .join('/')}`;
      }
    }

    return absolutePath;
  }

  /**
   * Gets absolute path from normalized path if needed
   * @private
   */
  private getProcessablePath(imagePath: string): string {
    if (FileUtils.existsSync(imagePath)) {
      return imagePath;
    }
    // If the path doesn't exist, it might be a normalized path
    // Try to find it in the image map
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
    const publicPath = this.config.publicPath || '/output';
    return [...variants]
      .sort((a, b) => b.width - a.width)
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
    if (!variants || variants.length === 0) {
      return '';
    }

    // Sort by width ascending
    const sortedByWidth = [...variants].sort((a, b) => a.width - b.width);
    const breakpoints = sortedByWidth.map((v) => v.width);

    // Build a sizes string like:
    // (max-width: 320px) 320px, (max-width: 768px) 768px, ...
    // For each size except the largest
    const pairs = [];
    for (let i = 0; i < breakpoints.length - 1; i++) {
      pairs.push(`(max-width: ${breakpoints[i]}px) ${breakpoints[i]}px`);
    }
    // Final fallback to the largest size
    const largest = breakpoints[breakpoints.length - 1];
    pairs.push(`${largest}px`);

    return pairs.join(', ');
  }

  /**
   * Processes a single image file
   * @param {string} imagePath - Path to the image file to process
   * @returns {Promise<ImageVariant[]>} Array of processed image variants
   */
  async processImage(imagePath: string): Promise<ImageVariant[]> {
    const normalizedPath = this.normalizeImagePath(imagePath);
    const processablePath = this.getProcessablePath(imagePath);
    const hash = FileUtils.getFileHash(processablePath);

    if (this.imageMap[normalizedPath]?.hash === hash) {
      return this.imageMap[normalizedPath].variants;
    }

    const format = this.config.format || 'webp';
    const filename = path.basename(processablePath, path.extname(processablePath));

    // If maxWidth is specified and no sizes are provided, create a single size with maxWidth
    const defaultSizes = this.config.maxWidth
      ? [{ width: this.config.maxWidth, label: 'xl' }]
      : [
          { width: 1920, label: 'xl' },
          { width: 1024, label: 'lg' },
          { width: 768, label: 'md' },
          { width: 320, label: 'sm' },
        ];

    const sizes = this.config.sizes || defaultSizes;

    const originalImage = sharp(processablePath);
    const metadata = await originalImage.metadata();
    const originalWidth = metadata.width || 0;

    // Create variants only for sizes up to original width, maintaining original properties
    const validSizes = sizes.map((size) => ({
      ...size,
      width: Math.min(size.width, originalWidth), // Cap width at original image width
    }));

    // Sort by width to ensure consistent variant selection
    const sortedSizes = validSizes.sort((a, b) => b.width - a.width);

    // Filter unique variants, keeping the first occurrence of each width
    const seen = new Set<number>();
    const uniqueSizes = sortedSizes.filter((size) => {
      if (seen.has(size.width)) {
        return false;
      }
      seen.add(size.width);
      return true;
    });

    const variants: ImageVariant[] = [];

    for (const size of uniqueSizes) {
      // Always include the label in the filename
      const labelPart = size.label ? `-${size.label}` : '';
      const outputBasename = `${filename}${labelPart}${ImageProcessor.OPTIMIZED_SUFFIX}${format}`;
      const outputPath = path.join(this.config.outputDir, outputBasename);

      // Use the capped width for processing
      const image = sharp(processablePath);
      image.resize(size.width);

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
        width: size.width, // Use capped width
        label: size.label || '', // Ensure label is never undefined
        format,
      });
    }

    variants.sort((a, b) => b.width - a.width);

    this.imageMap[normalizedPath] = {
      hash,
      variants,
      originalPath: processablePath,
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
    try {
      const normalizedPath = this.normalizeImagePath(imagePath);
      return this.imageMap[normalizedPath]?.srcset || '';
    } catch (error) {
      appLogger.debug(`Error generating srcset for ${imagePath}: ${error}`);
      return '';
    }
  }

  /**
   * Generates sizes attribute based on image variants
   * @param {string} imagePath - Path to the original image
   * @returns {string} sizes attribute string
   */
  generateSizes(imagePath: string): string {
    try {
      const normalizedPath = this.normalizeImagePath(imagePath);
      return this.imageMap[normalizedPath]?.sizes || '';
    } catch (error) {
      appLogger.debug(`Error generating sizes for ${imagePath}: ${error}`);
      return '';
    }
  }

  /**
   * Processes all supported images in the configured directory
   * @returns {Promise<void>}
   */
  async processDirectory(): Promise<void> {
    const glob = `${this.config.imageDir}/**/*.{jpg,jpeg,png,webp}`;
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
