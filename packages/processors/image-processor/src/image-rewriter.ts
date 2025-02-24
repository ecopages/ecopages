/**
 * This module enhances img elements in HTML with responsive attributes using a custom implementation
 * @module
 */

import path from 'node:path';
import type { ImageMap, ImageProcessor, ImageVariant } from './image-processor';

const PRESERVED_ATTRS = new Set(['src']);
const ATTRIBUTES_REGEX = /(\w+(?:-\w+)*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))|(?=\s|$))/g;

export interface ImageOptions {
  /** CSS class for the img element */
  className?: string;
  /** Alt text for the image */
  alt?: string;
  /** Additional attributes for the img tag */
  imgAttributes?: Record<string, string>;
}

/**
 * Enhances img elements with responsive attributes
 */
export class ImageRewriter {
  private imageProcessor: ImageProcessor;
  private pathCache = new Map<string, string>();
  private htmlCache = new Map<string, string>();
  private imageMap: ImageMap;

  constructor(imageProcessor: ImageProcessor) {
    this.imageProcessor = imageProcessor;
    this.imageMap = imageProcessor.getImageMap();
  }

  /**
   * Enhances an img element with srcset and sizes attributes
   */
  generateImgHtml(imagePath: string, options: ImageOptions = {}): string {
    const cacheKey = this.createCacheKey(imagePath, options);
    const cached = this.htmlCache.get(cacheKey);
    if (cached) return cached;

    const entry = this.imageMap[imagePath];
    if (!entry) return '';

    const { variants, sizes } = entry;
    const publicPath = this.imageProcessor.getPublicPath();

    const html = this.generateHtml(variants, sizes, publicPath, options);
    this.htmlCache.set(cacheKey, html);
    return html;
  }

  private createCacheKey(imagePath: string, options: ImageOptions): string {
    return JSON.stringify({
      path: imagePath,
      attrs: options.imgAttributes,
      class: options.className,
      alt: options.alt,
    });
  }

  private generateHtml(variants: ImageVariant[], sizes: string, publicPath: string, options: ImageOptions): string {
    const staticVariant = options.imgAttributes?.['data-static-variant'];

    if (staticVariant) {
      const variant = variants.find((v) => v.label === staticVariant);
      if (variant) {
        return `<img${this.formatAttributes({
          src: `${publicPath}/${path.basename(variant.path)}`,
          width: variant.width,
          height: variant.height,
          ...this.getCleanAttributes(options.imgAttributes),
        })}>`;
      }
    }

    return this.generateResponsiveImg(variants, publicPath, { ...options, sizes });
  }

  getCleanAttributes(imgAttributes: ImageOptions['imgAttributes']): Record<string, string> {
    const { 'data-static-variant': __, ...cleanAttributes } = imgAttributes || {};
    return cleanAttributes;
  }

  /**
   * Enhances img tags in HTML with responsive attributes
   */
  enhanceImages(html: string, options: ImageOptions = {}): string {
    const cacheKey = `${html}:${JSON.stringify(options)}`;
    const cached = this.htmlCache.get(cacheKey);
    if (cached) return cached;

    const enhanced = html.replace(/<img[^>]+>/g, (imgTag) => {
      const srcMatch = imgTag.match(/src="([^"]+)"/);
      if (!srcMatch) return imgTag;

      const attrs = this.parseAttributes(imgTag);
      const imagePath = this.getNormalizedPath(srcMatch[1]);

      const imgOptions: ImageOptions = {
        ...options,
        imgAttributes: attrs,
      };

      return this.generateImgHtml(imagePath, imgOptions) || imgTag;
    });

    this.htmlCache.set(cacheKey, enhanced);
    return enhanced;
  }

  /**
   * Parse HTML attributes efficiently
   */
  private parseAttributes(imgTag: string): Record<string, string> {
    const attrs: Record<string, string> = {};

    let matches: RegExpExecArray | null = ATTRIBUTES_REGEX.exec(imgTag);

    while (matches !== null) {
      const [, name, doubleQuoted, singleQuoted, unquoted] = matches;
      if (!PRESERVED_ATTRS.has(name)) {
        const value = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
        attrs[name] = value;
      }

      matches = ATTRIBUTES_REGEX.exec(imgTag);
    }

    return attrs;
  }

  /**
   * Get normalized path with caching
   */
  private getNormalizedPath(imagePath: string): string {
    const cached = this.pathCache.get(imagePath);
    if (cached) return cached;

    const normalized = this.normalizeImagePath(imagePath);
    this.pathCache.set(imagePath, normalized);
    return normalized;
  }

  private normalizeImagePath(imagePath: string): string {
    const basename = path.basename(imagePath);

    const normalizedPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
    if (this.imageMap[normalizedPath]) return normalizedPath;

    const match = Object.keys(this.imageMap).find((key) => key.endsWith(basename));
    return match || imagePath;
  }

  /**
   * Generates an img element with srcset and sizes attributes
   */
  private generateResponsiveImg(
    variants: ImageVariant[],
    publicPath: string,
    options: ImageOptions & { sizes: string; customSrcset?: string },
  ): string {
    const [largestVariant, ...otherVariants] = variants.sort((a, b) => b.width - a.width);
    const { customSrcset, imgAttributes = {}, ...restOptions } = options;

    const { 'data-static-variant': __, ...cleanAttributes } = imgAttributes;

    const attributes = {
      src: `${publicPath}/${path.basename(largestVariant.path)}`,
      srcset: this.generateSrcset([largestVariant, ...otherVariants], publicPath),
      sizes: options.sizes,
      alt: options.alt || '',
      width: largestVariant.width,
      height: largestVariant.height,
      ...(options.className && { class: options.className }),
      ...cleanAttributes,
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

  private formatAttributes(attrs: Record<string, string | number | undefined>): string {
    const filtered = Object.entries(attrs).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc.push(value === '' ? key : `${key}="${value}"`);
      }
      return acc;
    }, [] as string[]);

    return filtered.length ? ` ${filtered.join(' ')}` : '';
  }

  clearCaches(): void {
    this.pathCache.clear();
    this.htmlCache.clear();
    this.imageMap = this.imageProcessor.getImageMap();
  }
}
