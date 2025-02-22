/**
 * Generates HTML for a picture element with all available formats and sizes
 * @module
 */

import path from 'node:path';
import { Logger } from '@ecopages/logger';
import type { ImageProcessor, ImageVariant } from './image-processor';

const appLogger = new Logger('[@ecopages/image-processor > picture-generator]');

export interface PictureOptions {
  /** CSS class for the img element */
  className?: string;
  /** Alt text for the image */
  alt?: string;
  /** Whether to enable lazy loading */
  lazy?: boolean;
  /** Additional attributes for the img tag */
  imgAttributes?: Record<string, string>;
  /** Additional attributes for the picture tag */
  pictureAttributes?: Partial<HTMLImageElement> & Record<string, string>;
  /** For data-fixed-size attribute */
  fixedSize?: string;
  /** For data-custom-srcset attribute */
  customSrcset?: string;
}

/**
 * Generates HTML for a picture element with all available formats and sizes
 */
export class PictureGenerator {
  private imageProcessor: ImageProcessor;
  private variantGroupCache = new WeakMap<ImageVariant[], Record<string, ImageVariant[]>>();

  constructor(imageProcessor: ImageProcessor) {
    this.imageProcessor = imageProcessor;
  }

  /**
   * Generates HTML for a picture element with all available formats and sizes
   */
  generatePictureHtml(imagePath: string, options: PictureOptions = {}): string {
    const imageMap = this.imageProcessor.getImageMap();
    const entry = imageMap[imagePath];

    if (!entry) return '';

    const { variants, sizes } = entry;
    const publicPath = this.imageProcessor.getPublicPath();

    // Handle fixed size
    if (options.fixedSize) {
      const variant = entry.variants.find((v) => v.label === options.fixedSize);
      if (variant) {
        const imgAttrs = this.formatAttributes({
          src: `${publicPath}/${path.basename(variant.path)}`,
          width: variant.width.toString(),
          ...options.imgAttributes,
        });
        return `<picture>\n  <img${imgAttrs}>\n</picture>`;
      }
    }

    // Handle custom srcset
    if (options.customSrcset) {
      const imgElement = this.generateImgElement(entry.variants, publicPath, options);
      return `<picture>\n  <source srcset="${options.customSrcset}">\n  ${imgElement}\n</picture>`;
    }

    const sourceElements = this.generateSourceElements(variants, sizes, publicPath);
    const imgElement = this.generateImgElement(variants, publicPath, options);
    const pictureAttrs = this.formatAttributes(options.pictureAttributes || {});

    return `<picture${pictureAttrs}>\n${sourceElements}\n  ${imgElement}\n</picture>`;
  }

  /**
   * Replaces img tags in HTML with picture elements
   */
  replaceImagesWithPictures(html: string, options: PictureOptions = {}): string {
    return html.replace(/<img[^>]+>/g, (imgTag) => {
      // Extract attributes
      const srcMatch = imgTag.match(/src="([^"]+)"/);
      if (!srcMatch) return imgTag;

      // Extract data attributes
      const fixedSizeMatch = imgTag.match(/data-fixed-size="([^"]+)"/);
      const customSrcsetMatch = imgTag.match(/data-custom-srcset="([^"]+)"/);

      // Extract other attributes
      const attrs: Record<string, string> = {};
      imgTag.replace(/(\w+(?:-\w+)*)="([^"]+)"/g, (_, name, value) => {
        if (!['src', 'data-fixed-size', 'data-custom-srcset'].includes(name)) {
          attrs[name] = value;
        }
        return '';
      });

      const pictureOptions: PictureOptions = {
        ...options,
        imgAttributes: attrs,
        fixedSize: fixedSizeMatch?.[1],
        customSrcset: customSrcsetMatch?.[1],
      };

      const imagePath = this.normalizeImagePath(srcMatch[1]);
      return this.generatePictureHtml(imagePath, pictureOptions) || imgTag;
    });
  }

  private normalizeImagePath(imagePath: string): string {
    // Get public dir from image processor config
    const publicDir = this.imageProcessor.config.publicDir || 'public';

    // If it's already a public path, try it first
    if (imagePath.startsWith('/')) {
      // Remove leading slash for matching
      const normalizedPath = imagePath.substring(1);

      // Check if path exists in image map
      for (const key of Object.keys(this.imageProcessor.getImageMap())) {
        if (key.includes(normalizedPath)) {
          return key;
        }
      }
    }

    // Try finding the image by its basename
    const basename = path.basename(imagePath);
    for (const key of Object.keys(this.imageProcessor.getImageMap())) {
      if (key.endsWith(basename)) {
        return key;
      }
    }

    // If all else fails, return original path
    return imagePath;
  }

  /**
   * Generates HTML for a picture element with all available formats and sizes
   * @param variants
   * @param sizes
   * @param publicPath
   * @returns
   */
  private generateSourceElements(variants: ImageVariant[], sizes: string, publicPath: string): string {
    const variantsByFormat = this.groupVariantsByFormat(variants);

    return Object.entries(variantsByFormat)
      .map(([format, formatVariants]) => {
        // Sort variants by width for consistent ordering
        const sortedVariants = [...formatVariants].sort((a, b) => b.width - a.width);

        // Include all variants in srcset
        const srcset = sortedVariants.map((v) => `${publicPath}/${path.basename(v.path)} ${v.width}w`).join(', ');

        return `  <source type="image/${format}" srcset="${srcset}" sizes="${sizes}">`;
      })
      .join('\n');
  }

  /**
   * Generates an img element with the largest variant as the src
   * @param variants
   * @param publicPath
   * @param options
   * @returns
   */
  private generateImgElement(variants: ImageVariant[], publicPath: string, options: PictureOptions): string {
    const fallbackVariant = variants.sort((a, b) => b.width - a.width)[0];
    const attributes: Partial<HTMLImageElement> = {
      src: `${publicPath}/${path.basename(fallbackVariant.path)}`,
      alt: options.alt || '',
      ...(options.className && { class: options.className }),
      ...(options.lazy && { loading: 'lazy' }),
      width: fallbackVariant.width,
      ...options.imgAttributes,
    };

    return `<img ${this.formatAttributes(attributes)}>`;
  }

  /**
   * Groups image variants by format
   * @param variants
   * @returns
   */
  private groupVariantsByFormat(variants: ImageVariant[]): Record<string, ImageVariant[]> {
    const cached = this.variantGroupCache.get(variants);
    if (cached) return cached;

    const result = variants.reduce(
      (acc, variant) => {
        acc[variant.format] = acc[variant.format] || [];
        acc[variant.format].push(variant);
        return acc;
      },
      {} as Record<string, ImageVariant[]>,
    );

    this.variantGroupCache.set(variants, result);
    return result;
  }

  /**
   * Formats attributes for an HTML element
   * @param attrs
   * @returns
   */
  private formatAttributes(attrs: Partial<HTMLImageElement>): string {
    const filtered = Object.entries(attrs).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== '') {
        acc.push(`${key}="${value}"`);
      }
      return acc;
    }, [] as string[]);

    return filtered.length ? ` ${filtered.join(' ')}` : '';
  }
}
