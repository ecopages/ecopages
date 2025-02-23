import path from 'node:path';
import { Logger } from '@ecopages/logger';
import type { ImageProcessor, ImageVariant } from './image-processor';

const appLogger = new Logger('[@ecopages/image-processor > image-enhancer]');

export interface ImageOptions {
  /** CSS class for the img element */
  className?: string;
  /** Alt text for the image */
  alt?: string;
  /** Whether to enable lazy loading */
  lazy?: boolean;
  /** Additional attributes for the img tag */
  imgAttributes?: Record<string, string>;
  /** For data-static-variant attribute */
  staticVariant?: string;
  /** For data-srcset attribute */
  customSrcset?: string;
}

/**
 * Enhances img elements with responsive attributes
 */
export class ImageRewriter {
  private imageProcessor: ImageProcessor;
  private variantGroupCache = new WeakMap<ImageVariant[], Record<string, ImageVariant[]>>();

  constructor(imageProcessor: ImageProcessor) {
    this.imageProcessor = imageProcessor;
  }

  /**
   * Enhances an img element with srcset and sizes attributes
   */
  generateImgHtml(imagePath: string, options: ImageOptions = {}): string {
    const imageMap = this.imageProcessor.getImageMap();
    const entry = imageMap[imagePath];

    if (!entry) return '';

    const { variants, sizes } = entry;
    const publicPath = this.imageProcessor.getPublicPath();

    // Handle fixed size
    if (options.staticVariant) {
      const variant = entry.variants.find((v) => v.label === options.staticVariant);
      if (variant) {
        const imgAttrs = this.formatAttributes({
          src: `${publicPath}/${path.basename(variant.path)}`,
          width: variant.width.toString(),
          ...options.imgAttributes,
        });
        return `<img${imgAttrs}>`;
      }
    }

    // Handle custom srcset
    if (options.customSrcset) {
      return this.generateResponsiveImg(variants, publicPath, {
        ...options,
        customSrcset: options.customSrcset,
        sizes,
      });
    }

    return this.generateResponsiveImg(variants, publicPath, { ...options, sizes });
  }

  /**
   * Enhances img tags in HTML with responsive attributes
   */
  enhanceImages(html: string, options: ImageOptions = {}): string {
    return html.replace(/<img[^>]+>/g, (imgTag) => {
      const srcMatch = imgTag.match(/src="([^"]+)"/);
      if (!srcMatch) return imgTag;

      const fixedSizeMatch = imgTag.match(/data-static-variant="([^"]+)"/);
      const customSrcsetMatch = imgTag.match(/data-srcset="([^"]+)"/);

      const attrs: Record<string, string> = {};
      imgTag.replace(/(\w+(?:-\w+)*)="([^"]+)"/g, (_, name, value) => {
        if (!['src', 'data-static-variant', 'data-srcset'].includes(name)) {
          attrs[name] = value;
        }
        return '';
      });

      const imgOptions: ImageOptions = {
        ...options,
        imgAttributes: attrs,
        staticVariant: fixedSizeMatch?.[1],
        customSrcset: customSrcsetMatch?.[1],
      };

      const imagePath = this.normalizeImagePath(srcMatch[1]);
      return this.generateImgHtml(imagePath, imgOptions) || imgTag;
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
   * Generates an img element with srcset and sizes attributes
   */
  private generateResponsiveImg(
    variants: ImageVariant[],
    publicPath: string,
    options: ImageOptions & { sizes: string; customSrcset?: string },
  ): string {
    const largestVariant = variants.sort((a, b) => b.width - a.width)[0];

    const srcset = options.customSrcset || this.generateSrcset(variants, publicPath);

    const attributes: Record<string, string | number> = {
      src: `${publicPath}/${path.basename(largestVariant.path)}`,
      srcset,
      sizes: options.sizes,
      alt: options.alt || '',
      width: largestVariant.width,
      ...(options.className && { class: options.className }),
      ...(options.lazy && { loading: 'lazy' }),
      ...options.imgAttributes,
    };

    return `<img${this.formatAttributes(attributes)}>`;
  }

  /**
   * Generates srcset string from variants
   */
  private generateSrcset(variants: ImageVariant[], publicPath: string): string {
    return variants
      .sort((a, b) => b.width - a.width)
      .map((v) => `${publicPath}/${path.basename(v.path)} ${v.width}w`)
      .join(', ');
  }

  private formatAttributes(attrs: Record<string, string | number>): string {
    const filtered = Object.entries(attrs).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== '') {
        acc.push(`${key}="${value}"`);
      }
      return acc;
    }, [] as string[]);

    return filtered.length ? ` ${filtered.join(' ')}` : '';
  }
}
