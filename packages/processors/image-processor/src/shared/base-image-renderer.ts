import type { ImageLayout, LayoutAttributes } from './constants';
import type {
  GenerateAttributesResult,
  GenerateAttributesResultJsx,
  ImageProps,
  RenderImageToString,
} from './image-renderer-provider';
import { ImageUtils } from './image-utils';

export interface ImageRenderer {
  /**
   * This method generates the attributes for the image element based on the provided props
   * This is the main method that should be used to generate the attributes for the image element
   * @param props
   */
  generateAttributes(props: ImageProps): GenerateAttributesResult | null;
  /**
   * This method generates the attributes for the image element based on the provided props as JSX
   * @param props
   */
  generateAttributesJsx(props: ImageProps): GenerateAttributesResultJsx | null;
  /**
   * This component generates the attributes for the image element based on the provided props as a string
   * @param props
   */
  stringifyImageAttributes(props: ImageProps): string;
  /**
   * This method generates the image element based on the provided props as a string
   * @param props
   */
  renderToString(props: RenderImageToString): string;
}

/**
 * CollectedAttributes
 * This interface represents the attributes that are collected by the image renderer
 * These attributes are used to generate the attributes for the image element
 */
export interface CollectedAttributes {
  width?: number;
  height?: number;
  loading: HTMLImageElement['loading'];
  fetchpriority: HTMLImageElement['fetchPriority'];
  decoding: HTMLImageElement['decoding'];
  src: string;
  srcset?: string;
  sizes?: string;
  alt: string;
  styles: [string, string][];
}

/**
 * BaseImageRenderer
 * This class is responsible for generating the attributes for the image element
 * It also provides some helper methods to generate the attributes and the stringified attributes
 * This class should be extended by the client and server image renderers
 * It can also render the image element to a string
 */
export abstract class BaseImageRenderer implements ImageRenderer {
  protected abstract collectAttributes(props: ImageProps): CollectedAttributes | null;

  stringifyImageAttributes(props: ImageProps): string {
    const attributes = this.generateAttributes(props);
    if (!attributes) return '';
    return this.stringifyAttributes(attributes);
  }

  renderToString({
    src,
    alt,
    width,
    height,
    aspectRatio,
    priority,
    layout,
    unstyled,
    staticVariant,
    ...rest
  }: RenderImageToString): string {
    const derivedAttributes = this.generateAttributes({
      src,
      alt,
      width,
      height,
      aspectRatio,
      priority,
      layout,
      unstyled,
      staticVariant,
    });
    if (!derivedAttributes) return '';

    const stringifiedAttributes = this.stringifyAttributes({
      ...derivedAttributes,
      ...rest,
    });

    return `<img ${stringifiedAttributes} />`;
  }

  protected stringifyAttributes(attributes: GenerateAttributesResult): string {
    const attributePairs: string[] = [];

    for (const [key, value] of Object.entries(attributes)) {
      if (value == null || value === '') continue;

      if (typeof value === 'boolean') {
        if (value) attributePairs.push(key);
      } else {
        attributePairs.push(`${key}="${value}"`);
      }
    }

    return attributePairs.join(' ');
  }

  protected getDimensionsAttributes(
    width?: number,
    height?: number,
    aspectRatio?: string,
    layout: ImageLayout = 'constrained',
    unstyled?: boolean,
  ): { attributes: Partial<LayoutAttributes>; styles: [string, string][] } {
    const attributes: Partial<LayoutAttributes> = {};
    const styles: [string, string][] = unstyled ? [] : [['objectFit', 'cover']];

    if (aspectRatio) {
      const ratio = this.parseAspectRatio(aspectRatio);
      if (ratio) {
        if (!unstyled) {
          styles.push(['aspectRatio', aspectRatio]);
        }

        if (width) {
          const calculatedHeight = Math.round(width / ratio);
          attributes.width = width;
          attributes.height = calculatedHeight;
          this.addLayoutStyles(styles, layout, width, calculatedHeight, unstyled);
        } else if (height) {
          const calculatedWidth = Math.round(height * ratio);
          attributes.width = calculatedWidth;
          attributes.height = height;
          this.addLayoutStyles(styles, layout, calculatedWidth, height, unstyled);
        } else if (!unstyled) {
          styles.push(['width', '100%'], ['height', 'auto']);
        }
      }
    } else if (width || height) {
      attributes.width = width;
      attributes.height = height;
      this.addLayoutStyles(styles, layout, width, height, unstyled);
    } else if (!unstyled) {
      styles.push(['width', '100%'], ['height', 'auto']);
    }

    return { attributes, styles };
  }

  protected parseAspectRatio(value: string | undefined): number | undefined {
    if (!value) return undefined;

    if (value.includes('/')) {
      const [width, height] = value.split('/').map(Number);
      return width / height;
    }

    return Number(value);
  }

  protected generateStyleString(styles: [string, string][]): string {
    return styles
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${key}: ${value}`)
      .join(';');
  }

  protected addLayoutStyles(
    styles: [string, string][],
    layout: ImageLayout,
    width?: number,
    height?: number,
    unstyled?: boolean,
  ): void {
    if (unstyled) return;
    const layoutStyles = ImageUtils.generateLayoutStyles({ layout, width, height });
    styles.push(...layoutStyles);
  }

  generateAttributes(props: ImageProps): GenerateAttributesResult | null {
    const collected = this.collectAttributes(props);
    if (!collected) return null;

    return {
      ...collected,
      style: collected.styles ? this.generateStyleString(collected.styles) : undefined,
    };
  }

  generateAttributesJsx(props: ImageProps): GenerateAttributesResultJsx | null {
    const collected = this.collectAttributes(props);
    if (!collected) return null;

    return {
      fetchPriority: collected.fetchpriority,
      loading: collected.loading,
      decoding: collected.decoding,
      src: collected.src,
      alt: collected.alt,
      srcSet: collected.srcset,
      sizes: collected.sizes,
      width: collected.width,
      height: collected.height,
      style: collected.styles ? Object.fromEntries(collected.styles) : undefined,
    };
  }
}
