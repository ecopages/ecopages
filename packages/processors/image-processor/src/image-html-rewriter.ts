/**
 * This module enhances img elements in HTML with responsive attributes using Bun's HTMLRewriter
 * @module
 */

import path from 'node:path';
import type { ImageMap, ImageProcessor, ImageVariant } from './image-processor';

interface ImageHandlerOptions {
  imageMap: ImageMap;
  publicPath: string;
}

/**
 * Handles img elements in HTML
 * @internal
 */
class ImageElementHandler {
  private imageMap: ImageMap;
  private publicPath: string;
  private pathCache = new Map<string, string>();
  private variantsCache = new Map<string, { sorted: ImageVariant[]; srcset: string }>();

  constructor({ imageMap, publicPath }: ImageHandlerOptions) {
    this.imageMap = imageMap;
    this.publicPath = publicPath;
    this.prepareCache();
  }

  private prepareCache(): void {
    for (const [imagePath, entry] of Object.entries(this.imageMap)) {
      const sorted = entry.variants.sort((a, b) => b.width - a.width);
      const srcset = sorted.map((v) => `${this.publicPath}/${path.basename(v.path)} ${v.width}w`).join(', ');
      this.variantsCache.set(imagePath, { sorted, srcset });
    }
  }

  element(element: HTMLRewriterTypes.Element): void {
    const src = element.getAttribute('src');
    if (!src) return;

    const normalizedPath = this.getNormalizedPath(src);
    const entry = this.imageMap[normalizedPath];
    if (!entry) return;

    const cached = this.variantsCache.get(normalizedPath);
    if (!cached) return;

    const staticVariant = element.getAttribute('data-static-variant');
    if (staticVariant) {
      const variant = cached.sorted.find((v) => v.label === staticVariant);
      if (variant) {
        element.setAttribute('src', `${this.publicPath}/${path.basename(variant.path)}`);
        element.setAttribute('width', variant.width.toString());
        element.setAttribute('height', variant.height.toString());
        element.removeAttribute('data-static-variant');
      }
      return;
    }

    const largestVariant = cached.sorted[0];
    element.setAttribute('src', `${this.publicPath}/${path.basename(largestVariant.path)}`);
    element.setAttribute('width', largestVariant.width.toString());
    element.setAttribute('height', largestVariant.height.toString());
    element.setAttribute('srcset', cached.srcset);
    if (entry.sizes) {
      element.setAttribute('sizes', entry.sizes);
    }
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

  /*
   * Normalize image path
   */
  private normalizeImagePath(imagePath: string): string {
    const basename = path.basename(imagePath);
    const normalizedPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;

    if (this.imageMap[normalizedPath]) return normalizedPath;

    const match = Object.keys(this.imageMap).find((key) => key.endsWith(basename));
    return match || imagePath;
  }
}

/**
 * Image rewriter using Bun's HTMLRewriter
 */
export class ImageHTMLRewriter {
  private imageProcessor: ImageProcessor;
  private rewriter: HTMLRewriter;
  private resultCache = new Map<string, string>();

  constructor(imageProcessor: ImageProcessor) {
    this.imageProcessor = imageProcessor;
    this.rewriter = this.createRewriter();
  }

  private createRewriter(): HTMLRewriter {
    return new HTMLRewriter().on(
      'img',
      new ImageElementHandler({
        imageMap: this.imageProcessor.getImageMap(),
        publicPath: this.imageProcessor.getPublicPath(),
      }),
    );
  }

  enhanceImages(html: string): string {
    const cached = this.resultCache.get(html);
    if (cached) return cached;

    const result = this.rewriter.transform(html);
    this.resultCache.set(html, result);
    return result;
  }

  clearCache(): void {
    this.resultCache.clear();
    this.rewriter = this.createRewriter();
  }

  /**
   * Updates the internal state with the latest image map
   */
  refresh(): void {
    this.rewriter = this.createRewriter();
  }
}
