/**
 * ImageRenderer
 * @module
 */

import type { ImageSpecifications, ImageVariant } from './image-processor';
import { ImageUtils } from './image-utils';

/**
 * Default image layout
 * @constant "constrained"
 */
export const DEFAULT_LAYOUT: ImageLayout = 'constrained';

/**
 * Image layout options
 */
export type ImageLayout = 'fixed' | 'constrained' | 'full-width';

/**
 * ImageProps
 * This interface represents the properties that can be passed to the image element
 */
export type EcoImageProps = ImageSpecifications & {
  /**
   * width of the image as defined in the component
   */
  width?: number;
  /**
   * height of the image as defined in the component
   */
  height?: number;
  /**
   * The alt text for the image
   */
  aspectRatio?: string;
  /**
   * If true, the image will be loaded eagerly
   */
  priority?: boolean;
  /**
   * The layout of the image
   * @default "constrained"
   */
  layout?: ImageLayout;
  /**
   * If true, the image will not have any styles applied to it
   */
  unstyled?: boolean;
  /**
   * Specifies a fixed image variant from the configuration.
   * This should match one of the variant labels defined in your image optimization config.
   * When set, the image will use this specific variant instead of responsive sizes.
   */
  staticVariant?: string;
  /**
   * Optional additional attributes to be added to the image element
   */
  [additionalAttributes: string]: any;
};

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
  styles: [string, string][];
}

/**
 * GenerateAttributesResult
 * This interface represents the result of the generateAttributes method
 */
export interface GenerateAttributesResult {
  fetchpriority: HTMLImageElement['fetchPriority'];
  loading: HTMLImageElement['loading'];
  decoding: HTMLImageElement['decoding'];
  src: string;
  srcset?: string;
  sizes?: string;
  width?: number;
  height?: number;
  style?: string;
}

/**
 * GenerateAttributesResultJsx
 * This interface represents the result of the generateAttributes method as JSX
 */
export interface GenerateAttributesResultJsx {
  fetchPriority: HTMLImageElement['fetchPriority'];
  loading: HTMLImageElement['loading'];
  decoding: HTMLImageElement['decoding'];
  src: string;
  srcSet?: string;
  sizes?: string;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}

/**
 * IImageRenderer
 * This interface represents the image renderer in charge of generating the attributes for the image element
 */
export interface IImageRenderer {
  /**
   * This method generates the attributes for the image element based on the provided props
   * This is the main method that should be used to generate the attributes for the image element
   * @param props
   */
  generateAttributes(props: EcoImageProps): GenerateAttributesResult | null;
  /**
   * This method generates the attributes for the image element based on the provided props as JSX
   * @param props
   */
  generateAttributesJsx(props: EcoImageProps): GenerateAttributesResultJsx | null;
  /**
   * This method generates the image element based on the provided props as a string
   * @param props
   */
  renderToString(props: EcoImageProps): string;
}

/**
 * ImageRenderer
 * This class is responsible for generating the attributes for the image element
 */
export class ImageRenderer implements IImageRenderer {
  private readonly internalProps = [
    'attributes',
    'variants',
    'layout',
    'staticVariant',
    'aspectRatio',
    'unstyled',
    'priority',
  ];

  generateAttributes(props: EcoImageProps): GenerateAttributesResult | null {
    const collected = this.collectAttributes(props);
    if (!collected) return null;

    const { styles, ...rest } = collected;

    return {
      ...rest,
      style: collected.styles ? this.generateStyleString(collected.styles) : undefined,
    };
  }

  generateAttributesJsx(props: EcoImageProps): GenerateAttributesResultJsx | null {
    const collected = this.collectAttributes(props);
    if (!collected) return null;

    const { styles, fetchpriority, loading, decoding, src, srcset, sizes, width, height, ...rest } = collected;

    const validHtmlAttributes = Object.fromEntries(
      Object.entries(props).filter(([key]) => !this.internalProps.includes(key)),
    );

    return {
      fetchPriority: fetchpriority,
      loading,
      decoding,
      src,
      srcSet: srcset,
      sizes,
      width,
      height,
      style: styles ? this.createCamelCaseKeysOnStyle(styles) : undefined,
      ...validHtmlAttributes,
    };
  }

  renderToString({ attributes, variants, ...rest }: EcoImageProps): string {
    const derivedAttributes = this.generateAttributes({
      attributes,
      variants,
      ...rest,
    });

    if (!derivedAttributes) return '';

    const stringifiedAttributes = this.stringifyAttributes({
      ...derivedAttributes,
      ...rest,
    });

    return `<img ${stringifiedAttributes} />`;
  }

  private collectAttributes(props: EcoImageProps): CollectedAttributes | null {
    const {
      variants,
      attributes,
      alt,
      priority,
      layout = DEFAULT_LAYOUT,
      unstyled,
      staticVariant,
      aspectRatio,
      width,
      height,
      ...rest
    } = props;

    const priorityAttributes: Pick<GenerateAttributesResult, 'loading' | 'fetchpriority' | 'decoding'> = {
      loading: priority ? 'eager' : 'lazy',
      fetchpriority: priority ? 'high' : 'auto',
      decoding: priority ? 'auto' : 'async',
    };

    if (!variants || variants.length === 0) {
      const effectiveWidth = width || attributes.width;
      const effectiveHeight = height || attributes.height;

      const { attributes: dimensionsAttributes, styles } = this.getDimensionsAttributes(
        effectiveWidth,
        effectiveHeight,
        aspectRatio,
        layout,
        unstyled,
      );

      return {
        ...dimensionsAttributes,
        ...priorityAttributes,
        width: effectiveWidth,
        height: effectiveHeight,
        src: attributes.src,
        styles,
        ...rest,
      };
    }

    const staticVariantExists = staticVariant && variants.some((v) => v.label === staticVariant);

    const useResponsiveImage = !staticVariantExists;

    const mainVariant = useResponsiveImage
      ? variants.sort((a, b) => b.width - a.width)[0]
      : (variants.find((v) => v.label === staticVariant) as ImageVariant);

    const effectiveWidth = width || mainVariant.width;
    let effectiveHeight: number | undefined;

    if (aspectRatio && effectiveWidth) {
      const [aspectWidth, aspectHeight] = aspectRatio.split('/').map(Number);
      effectiveHeight = Math.round((effectiveWidth * aspectHeight) / aspectWidth);
    } else {
      effectiveHeight = height || mainVariant.height;
    }

    const derivedAspectRatio =
      aspectRatio || (effectiveWidth && effectiveHeight) ? `${effectiveWidth}/${effectiveHeight}` : undefined;

    const { attributes: dimensionsAttributes, styles } = this.getDimensionsAttributes(
      effectiveWidth,
      effectiveHeight,
      derivedAspectRatio,
      layout,
      unstyled,
    );

    const validHtmlAttributes = Object.fromEntries(
      Object.entries(rest).filter(([key]) => !this.internalProps.includes(key)),
    );

    return {
      ...dimensionsAttributes,
      ...priorityAttributes,
      width: effectiveWidth,
      height: effectiveHeight,
      src: mainVariant.src,
      ...(useResponsiveImage ? { srcset: attributes.srcset, sizes: attributes.sizes } : {}),
      styles,
      ...validHtmlAttributes,
    };
  }

  private stringifyAttributes(attributes: GenerateAttributesResult): string {
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

  private getDimensionsAttributes(
    width?: number,
    height?: number,
    aspectRatio?: string,
    layout: ImageLayout = 'constrained',
    unstyled?: boolean,
  ): { attributes: Pick<EcoImageProps, 'width' | 'height'>; styles: [string, string][] } {
    const attributes: Pick<EcoImageProps, 'width' | 'height'> = {};
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

  private parseAspectRatio(value: string | undefined): number | undefined {
    if (!value) return undefined;

    if (value.includes('/')) {
      const [width, height] = value.split('/').map(Number);
      return width / height;
    }

    return Number(value);
  }

  private generateStyleString(styles: [string, string][]): string {
    const styleMap = new Map<string, string>();

    for (const [key, value] of styles) {
      const camelKey = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      styleMap.set(camelKey, value);
    }

    return Array.from(styleMap.entries())
      .map(([key, value]) => {
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `${cssKey}:${value}`;
      })
      .join(';');
  }

  private addLayoutStyles(
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

  private createCamelCaseKeysOnStyle(styles: [string, string][]): Record<string, string> {
    return Object.fromEntries(
      styles.map(([key, value]) => [key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]),
    );
  }
}

export const renderer = new ImageRenderer();
