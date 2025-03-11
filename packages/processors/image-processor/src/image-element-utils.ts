import { CUSTOM_IMAGE_ATTRIBUTES, type ImageLayout, type LayoutAttributes } from './constants';
import type { ImageVariant } from './image-processor';
import { ImageUtils } from './image-utils';

export interface ImageElementLike {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export interface ImageEnhanceOptions {
  variants: ImageVariant[];
  srcset: string;
  sizes?: string;
}

/**
 * ImageElementUtils
 * This class is responsible for enhancing an image element with responsive attributes
 */
export class ImageElementUtils {
  /**
   * Enhances an image element with responsive attributes
   * @param element - Image element to enhance
   * @param options - Options to enhance the image element
   */
  enhance(element: ImageElementLike, options: ImageEnhanceOptions): void {
    const staticVariant = element.getAttribute(CUSTOM_IMAGE_ATTRIBUTES['data-static-variant']);

    if (staticVariant) {
      element.removeAttribute(CUSTOM_IMAGE_ATTRIBUTES['data-static-variant']);
      const variant = options.variants.find((v) => v.label === staticVariant);

      if (variant) {
        this.applyVariant(element, variant);
        return;
      }
    }

    const layoutAttrs = this.getLayoutAttributes(element);

    if (layoutAttrs) {
      const styles = ImageUtils.generateStyles(layoutAttrs.layout, layoutAttrs);
      element.setAttribute('style', styles);

      if (layoutAttrs.priority) {
        element.setAttribute('loading', 'eager');
        element.setAttribute('fetchpriority', 'high');
      } else {
        element.setAttribute('loading', 'lazy');
      }
    }

    const largestVariant = options.variants[0];
    this.applyVariant(element, largestVariant);
    element.setAttribute('srcset', options.srcset);

    if (options.sizes) {
      element.setAttribute('sizes', options.sizes);
    }

    this.cleanupCustomAttributes(element);

    element.setAttribute(CUSTOM_IMAGE_ATTRIBUTES['data-processed'], '');
  }

  private cleanupCustomAttributes(element: ImageElementLike): void {
    for (const key of Object.values(CUSTOM_IMAGE_ATTRIBUTES)) {
      element.removeAttribute(key);
    }
  }

  /**
   * If the element has custom attributes, return the layout attributes
   * @param element
   * @returns
   */
  private getLayoutAttributes(element: ImageElementLike): LayoutAttributes | null {
    const layout = element.getAttribute(CUSTOM_IMAGE_ATTRIBUTES['data-layout']) as ImageLayout;
    if (!layout) return null;

    const isHtmlElement = element instanceof HTMLElement;

    /**
     * In the case of an HTML element, the width and height attributes are not always set
     * and we need to calculate them based on the clientWidth and clientHeight properties
     */
    const width =
      isHtmlElement && !Number(element.getAttribute('width'))
        ? element.clientWidth
        : Number(element.getAttribute('width'));
    const height =
      isHtmlElement && Number(element.getAttribute('width'))
        ? element.clientHeight
        : Number(element.getAttribute('height'));

    return {
      layout,
      width,
      height,
      priority: element.getAttribute(CUSTOM_IMAGE_ATTRIBUTES['data-priority']) === 'true',
    };
  }

  /**
   * Applies a variant to an image element
   * @param element - Image element to apply the variant to
   * @param variant - Image variant to apply
   */
  private applyVariant(element: ImageElementLike, variant: ImageVariant): void {
    element.setAttribute('src', variant.displayPath);
    element.setAttribute('width', variant.width.toString());
    element.setAttribute('height', variant.height.toString());
  }
}
