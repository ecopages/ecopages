import type { ImageVariant } from '../server/image-processor';
import { CUSTOM_IMAGE_ATTRIBUTES, DEFAULT_LAYOUT, type ImageLayout, type LayoutAttributes } from '../shared/constants';
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
    const staticVariantAttribute = element.getAttribute(CUSTOM_IMAGE_ATTRIBUTES['data-static-variant']);
    const shouldBeUnstyled = element.getAttribute(CUSTOM_IMAGE_ATTRIBUTES['data-unstyled']) === 'true';
    const layoutAttrs = this.getLayoutAttributes(element);

    console.log(
      'should be unstyled',
      element.getAttribute(CUSTOM_IMAGE_ATTRIBUTES['data-unstyled']),
      element.getAttribute(CUSTOM_IMAGE_ATTRIBUTES['data-static-variant']),
      element.getAttribute('data-index'),
      shouldBeUnstyled,
    );

    const staticVariant = staticVariantAttribute && options.variants.find((v) => v.label === staticVariantAttribute);

    if (staticVariant) {
      element.removeAttribute(CUSTOM_IMAGE_ATTRIBUTES['data-static-variant']);
      if (staticVariant) this.applyVariant(element, staticVariant);
    } else {
      const largestVariant = options.variants[0];
      this.applyVariant(element, largestVariant);
      element.setAttribute('srcset', options.srcset);
      if (options.sizes) element.setAttribute('sizes', options.sizes);
    }

    if (layoutAttrs) {
      if (!shouldBeUnstyled) {
        const styles = ImageUtils.generateStyles(layoutAttrs);
        if (styles) element.setAttribute('style', styles);
      }

      if (layoutAttrs.priority) {
        element.setAttribute('loading', 'eager');
        element.setAttribute('fetchpriority', 'high');
      } else {
        element.setAttribute('loading', 'lazy');
        element.setAttribute('fetchpriority', 'auto');
        element.setAttribute('decoding', 'async');
      }
    }

    this.cleanupCustomAttributes(element);

    element.setAttribute(CUSTOM_IMAGE_ATTRIBUTES['data-processed'], '');
  }

  private cleanupCustomAttributes(element: ImageElementLike): void {
    for (const key of Object.values(CUSTOM_IMAGE_ATTRIBUTES)) {
      element.removeAttribute(key as string);
    }
  }

  /**
   * If the element has custom attributes, return the layout attributes
   * @param element
   * @returns
   */
  private getLayoutAttributes(element: ImageElementLike): LayoutAttributes | null {
    const layout = (element.getAttribute(CUSTOM_IMAGE_ATTRIBUTES['data-layout']) || DEFAULT_LAYOUT) as ImageLayout;
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
