/**
 * This module enhances img elements in HTML with responsive attributes using Bun's HTMLRewriter
 * @module
 */

import path from 'node:path';
import { Logger } from '@ecopages/logger';
import type { ImageMap, ImageProcessor, ImageVariant } from './image-processor';

const appLogger = new Logger('[@ecopages/image-processor]');

export const CUSTOM_IMAGE_ATTRIBUTES = {
  'data-static-variant': 'data-static-variant',
} as const;

export type CustomImageAttributes = typeof CUSTOM_IMAGE_ATTRIBUTES;

export type ImageOptions = Partial<HTMLImageElement> & {
  [K in keyof CustomImageAttributes]?: string;
};

export interface BaseImageRewriter {
  /**
   * Enhances img elements in HTML with responsive attributes
   */
  enhanceImages<T extends Response | string>(html: T): Promise<T>;
}

interface ImageHandlerOptions {
  imageMap: ImageMap;
}

/**
 * Handles img elements in HTML
 * @internal
 */
class ImageElementHandler {
  private imageMap: ImageMap;

  constructor({ imageMap }: ImageHandlerOptions) {
    this.imageMap = imageMap;
  }

  element(element: HTMLRewriterTypes.Element): void {
    const src = element.getAttribute('src');
    if (!src) return;

    const entry = this.imageMap[src];
    if (!entry) return;

    const staticVariant = element.getAttribute('data-static-variant');
    element.removeAttribute('data-static-variant');

    if (staticVariant) {
      const variant = entry.variants.find((v) => v.label === staticVariant);

      if (variant) {
        element.setAttribute('src', variant.displayPath);
        element.setAttribute('width', variant.width.toString());
        element.setAttribute('height', variant.height.toString());
        return;
      }
    }

    const largestVariant = entry.variants[0];

    element.setAttribute('src', largestVariant.displayPath);
    element.setAttribute('width', largestVariant.width.toString());
    element.setAttribute('height', largestVariant.height.toString());
    element.setAttribute('srcset', entry.srcset);
    if (entry.sizes) {
      element.setAttribute('sizes', entry.sizes);
    }
  }
}

/**
 * Image rewriter using Bun's HTMLRewriter
 */
export class ImageRewriter implements BaseImageRewriter {
  private imageProcessor: ImageProcessor;
  private rewriter: HTMLRewriter;

  constructor(imageProcessor: ImageProcessor) {
    this.imageProcessor = imageProcessor;
    this.rewriter = this.createRewriter();
  }

  private createRewriter(): HTMLRewriter {
    return new HTMLRewriter().on(
      'img',
      new ImageElementHandler({
        imageMap: this.imageProcessor.getImageMap(),
      }),
    );
  }

  async enhanceImages<T = Response | string>(html: T): Promise<T> {
    if (html instanceof Response) {
      const text = await html.text();
      const newResponse = new Response(text, {
        headers: html.headers,
        status: html.status,
        statusText: html.statusText,
      });
      return this.rewriter.transform(newResponse) as T;
    }

    return this.rewriter.transform(html as string) as T;
  }

  /**
   * Updates the internal state with the latest image map
   */
  refresh(): void {
    this.rewriter = this.createRewriter();
  }
}
