/**
 * Generates HTML for a picture element with all available formats and sizes
 * @module
 */

import path from 'node:path';
import type { ImageProcessor, ImageVariant } from './image-processor';

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
  pictureAttributes?: Record<string, string>;
}

/**
 * Generates HTML for a picture element with all available formats and sizes
 */
export class PictureGenerator {
  private imageProcessor: ImageProcessor;

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
    const lazy = options.lazy ?? true;

    const sourceElements = this.generateSourceElements(variants, sizes, publicPath);
    const imgElement = this.generateImgElement(variants, publicPath, options);
    const pictureAttrs = this.formatAttributes(options.pictureAttributes || {});

    return `<picture${pictureAttrs}>\n${sourceElements}\n  ${imgElement}\n</picture>`;
  }

  /**
   * Replaces img tags in HTML with picture elements
   */
  replaceImagesWithPictures(html: string, options: PictureOptions = {}): string {
    return html.replace(/<img[^>]+src="([^"]+)"[^>]*>/g, (match, src) => {
      // Preserve original alt and class if not specified in options
      const altMatch = match.match(/alt="([^"]+)"/);
      const classMatch = match.match(/class="([^"]+)"/);

      const pictureOptions: PictureOptions = {
        ...options,
        alt: options.alt || (altMatch ? altMatch[1] : ''),
        className: options.className || (classMatch ? classMatch[1] : ''),
      };

      return this.generatePictureHtml(src, pictureOptions) || match;
    });
  }

  private generateSourceElements(variants: ImageVariant[], sizes: string, publicPath: string): string {
    const variantsByFormat = this.groupVariantsByFormat(variants);

    return Object.entries(variantsByFormat)
      .map(([format, formatVariants]) => {
        const srcset = formatVariants.map((v) => `${publicPath}/${path.basename(v.path)} ${v.width}w`).join(', ');

        return `  <source type="image/${format}" srcset="${srcset}" sizes="${sizes}">`;
      })
      .join('\n');
  }

  private generateImgElement(variants: ImageVariant[], publicPath: string, options: PictureOptions): string {
    const fallbackVariant = variants.sort((a, b) => b.width - a.width)[0];
    const attributes = {
      src: `${publicPath}/${path.basename(fallbackVariant.path)}`,
      alt: options.alt || '',
      ...(options.className && { class: options.className }),
      ...(options.lazy && { loading: 'lazy' }),
      width: fallbackVariant.width.toString(),
      ...options.imgAttributes,
    };

    return `<img ${this.formatAttributes(attributes)}>`;
  }

  private groupVariantsByFormat(variants: ImageVariant[]): Record<string, ImageVariant[]> {
    return variants.reduce(
      (acc, variant) => {
        acc[variant.format] = acc[variant.format] || [];
        acc[variant.format].push(variant);
        return acc;
      },
      {} as Record<string, ImageVariant[]>,
    );
  }

  private formatAttributes(attrs: Record<string, string | number | boolean>): string {
    const filtered = Object.entries(attrs).filter(([_, value]) => value !== undefined && value !== '');
    if (filtered.length === 0) return '';

    return ` ${filtered.map(([key, value]) => `${key}="${value}"`).join(' ')}`;
  }
}
