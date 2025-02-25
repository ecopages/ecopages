/**
 * This module enhances img elements in HTML with responsive attributes using a custom implementation
 * @module
 */

import path from 'node:path';
import type { ImageMap, ImageProcessor, ImageVariant } from './image-processor';

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
  static PRESERVED_ATTRS = new Set(['src']);
  static ATTRIBUTES_REGEX = /(\w+(?:-\w+)*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))|(?=\s|$))/g;
  static IMG_TAG_REGEX = /<img[^>]+>/g;
  static SRC_ATTR_REGEX = /src="([^"]+)"/;

  private imageProcessor: ImageProcessor;
  private pathCache = new Map<string, string>();
  private htmlCache = new Map<string, string>();
  private imageMap: ImageMap;
  private variantsCache = new Map<string, ImageVariant[]>();
  private srcsetCache = new Map<string, string>();

  constructor(imageProcessor: ImageProcessor) {
    this.imageProcessor = imageProcessor;
    this.imageMap = imageProcessor.getImageMap();
    this.prepareCache();
  }

  /**
   * Pre-compute and cache sorted variants and srcset strings
   */
  private prepareCache(): void {
    const publicPath = this.imageProcessor.getPublicPath();

    for (const [imagePath, entry] of Object.entries(this.imageMap)) {
      // Sort and cache variants
      const sortedVariants = [...entry.variants].sort((a, b) => b.width - a.width);
      this.variantsCache.set(imagePath, sortedVariants);

      // Pre-compute and cache srcset
      const srcset = sortedVariants.map((v) => `${publicPath}/${path.basename(v.path)} ${v.width}w`).join(', ');
      this.srcsetCache.set(imagePath, srcset);
    }
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
    if (!html.includes('<img')) return html;

    const cacheKey = `${html}:${JSON.stringify(options)}`;
    const cached = this.htmlCache.get(cacheKey);
    if (cached) return cached;

    const optionsStr = JSON.stringify(options);

    const enhanced = html.replace(ImageRewriter.IMG_TAG_REGEX, (imgTag) => {
      const srcMatch = imgTag.match(ImageRewriter.SRC_ATTR_REGEX);
      if (!srcMatch) return imgTag;

      const imagePath = this.getNormalizedPath(srcMatch[1]);

      if (!this.imageMap[imagePath]) return imgTag;

      const imgCacheKey = `${imagePath}:${imgTag}:${optionsStr}`;
      const imgCached = this.htmlCache.get(imgCacheKey);
      if (imgCached) return imgCached;

      const attrs = this.parseAttributes(imgTag);
      const imgOptions: ImageOptions = {
        ...options,
        imgAttributes: attrs,
      };

      const result = this.generateImgHtml(imagePath, imgOptions) || imgTag;

      this.htmlCache.set(imgCacheKey, result);
      return result;
    });

    this.htmlCache.set(cacheKey, enhanced);
    return enhanced;
  }

  /**
   * Parse HTML attributes efficiently
   */
  private parseAttributes(imgTag: string): Record<string, string> {
    const attrs: Record<string, string> = {};

    ImageRewriter.ATTRIBUTES_REGEX.lastIndex = 0;

    let matches: RegExpExecArray | null = ImageRewriter.ATTRIBUTES_REGEX.exec(imgTag);

    while (matches !== null) {
      const [, name, doubleQuoted, singleQuoted, unquoted] = matches;
      if (!ImageRewriter.PRESERVED_ATTRS.has(name)) {
        const value = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
        attrs[name] = value;
      }
      matches = ImageRewriter.ATTRIBUTES_REGEX.exec(imgTag);
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
    options: ImageOptions & { sizes: string },
  ): string {
    if (variants.length === 0) return '';

    const cacheKey = variants[0].path;
    let sortedVariants = this.variantsCache.get(cacheKey);

    if (!sortedVariants) {
      sortedVariants = [...variants].sort((a, b) => b.width - a.width);
      this.variantsCache.set(cacheKey, sortedVariants);
    }

    const largestVariant = sortedVariants[0];
    const { alt, className, imgAttributes = {} } = options;

    const attributes: Record<string, string | number> = {
      src: `${publicPath}/${path.basename(largestVariant.path)}`,
      srcset: this.generateSrcset(sortedVariants, publicPath),
      sizes: options.sizes,
      width: largestVariant.width,
      height: largestVariant.height,
    };

    if (alt) attributes.alt = alt;
    if (className) attributes.class = className;

    for (const key in imgAttributes) {
      if (key !== 'data-static-variant') {
        attributes[key] = imgAttributes[key];
      }
    }

    return `<img${this.formatAttributes(attributes)}>`;
  }

  /**
   * Generates srcset string from variants
   */
  private generateSrcset(variants: ImageVariant[], publicPath: string): string {
    const firstPath = variants[0]?.path;
    if (!firstPath) return '';

    const cacheKey = variants.map((v) => v.path).join(',');
    const cached = this.srcsetCache.get(cacheKey);
    if (cached) return cached;

    const srcset = variants.map((v) => `${publicPath}/${path.basename(v.path)} ${v.width}w`).join(', ');

    this.srcsetCache.set(cacheKey, srcset);
    return srcset;
  }

  private formatAttributes(attrs: Record<string, string | number | undefined>): string {
    // More efficient string building with array joins
    const parts = [];

    for (const [key, value] of Object.entries(attrs)) {
      if (value !== undefined) {
        parts.push(value === '' ? key : `${key}="${value}"`);
      }
    }

    return parts.length ? ` ${parts.join(' ')}` : '';
  }

  clearCaches(): void {
    this.pathCache.clear();
    this.htmlCache.clear();
    this.variantsCache.clear();
    this.srcsetCache.clear();
    this.imageMap = this.imageProcessor.getImageMap();
    this.prepareCache();
  }
}
