/**
 * This module enhances img elements in HTML with responsive attributes using Bun's HTMLRewriter
 * @module
 */

import type { CustomImageAttributes } from './constants';
import { ImageElementUtils } from './image-element-utils';
import type { ImageMap, ImageProcessor } from './image-processor';

/**
 * Options for the image element, including custom attributes
 */
export type ImageOptions = Partial<HTMLImageElement> & {
  [K in keyof CustomImageAttributes]?: string;
};

/**
 * Base interface for image rewriters
 */
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
  private utils = new ImageElementUtils();

  constructor({ imageMap }: ImageHandlerOptions) {
    this.imageMap = imageMap;
  }

  element(element: HTMLRewriterTypes.Element): void {
    const src = element.getAttribute('src');
    if (!src) return;

    const entry = this.imageMap[src];
    if (!entry) return;

    this.utils.enhance(element, {
      variants: entry.variants,
      srcset: entry.srcset,
      sizes: entry.sizes,
    });
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

  /**
   * Instantiates a new HTMLRewriter instance
   * @returns HTMLRewriter instance
   */
  private createRewriter(): HTMLRewriter {
    return new HTMLRewriter().on(
      'img',
      new ImageElementHandler({
        imageMap: this.imageProcessor.getImageMap(),
      }),
    );
  }

  /**
   * Enhances img elements in HTML with responsive attributes.
   * It supports both string and Response inputs.
   * @param html - HTML string or Response object
   * @returns Enhanced HTML string or Response object
   */
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
