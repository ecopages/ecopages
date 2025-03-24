/**
 * ImageRenderer
 * @module
 */

import { ImageUtils } from './image-utils';
import type { ImageSpecifications, ImageVariant } from './types';

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

export class LayoutAttributesManager {
  static shouldIncludeWidthHeight(layout: ImageLayout): boolean {
    return layout === 'fixed';
  }

  static filterDimensionAttributes(
    props: Pick<EcoImageProps, 'width' | 'height' | 'layout'>,
  ): Pick<EcoImageProps, 'width' | 'height'> {
    const layout = props.layout || 'constrained';

    if (!LayoutAttributesManager.shouldIncludeWidthHeight(layout)) {
      return {};
    }

    return {
      ...(props.width && { width: props.width }),
      ...(props.height && { height: props.height }),
    };
  }

  static getEffectiveDimensions(
    props: EcoImageProps,
    variants?: Array<{ width: number; height: number }>,
  ): { width?: number; height?: number } {
    const mainVariant = variants?.[0];

    const effectiveWidth = props.width || mainVariant?.width;
    let effectiveHeight = props.height || mainVariant?.height;

    if (props.aspectRatio && effectiveWidth) {
      const [aspectWidth, aspectHeight] = props.aspectRatio.split('/').map(Number);
      effectiveHeight = Math.round((effectiveWidth * aspectHeight) / aspectWidth);
    }

    return { width: effectiveWidth, height: effectiveHeight };
  }
}

/**
 * ImageRenderer
 * This class is responsible for generating the attributes for the image element
 */
export class ImageRenderer implements IImageRenderer {
  private originalProps?: EcoImageProps;

  private readonly internalProps = [
    'attributes',
    'variants',
    'layout',
    'staticVariant',
    'aspectRatio',
    'unstyled',
    'priority',
    'width',
    'height',
  ];

  generateAttributes(props: EcoImageProps): GenerateAttributesResult | null {
    this.originalProps = props;
    const collected = this.collectAttributes(props);
    if (!collected) return null;

    const { styles, width, height, ...rest } = collected;
    const dimensions = LayoutAttributesManager.filterDimensionAttributes({
      width,
      height,
      layout: props.layout,
    });

    const htmlAttributes = this.getHtmlAttributes(props);
    const generatedStyles = collected.styles ? this.generateStyleString(collected.styles) : '';
    const userStyles = props.style || '';

    return {
      ...htmlAttributes,
      ...rest,
      ...dimensions,
      style: userStyles ? `${generatedStyles};${userStyles}` : generatedStyles,
    };
  }

  private getHtmlAttributes(props: EcoImageProps): Record<string, any> {
    return Object.fromEntries(
      Object.entries(props).filter(
        ([key]) => !this.internalProps.includes(key) && key !== 'attributes' && key !== 'variants',
      ),
    );
  }

  generateAttributesJsx(props: EcoImageProps): GenerateAttributesResultJsx | null {
    this.originalProps = props;
    const collected = this.collectAttributes(props);
    if (!collected) return null;

    const { styles, fetchpriority, loading, decoding, src, srcset, sizes, width, height, ...rest } = collected;

    const dimensions = LayoutAttributesManager.filterDimensionAttributes({
      width,
      height,
      layout: props.layout,
    });

    const validHtmlAttributes = Object.fromEntries(
      Object.entries(props).filter(([key]) => !this.internalProps.includes(key)),
    );

    const generatedStyles = styles ? this.createCamelCaseKeysOnStyle(styles) : {};
    const userStyles = typeof props.style === 'object' ? props.style : {};

    return {
      fetchPriority: fetchpriority,
      loading,
      decoding,
      src,
      srcSet: srcset,
      sizes,
      ...dimensions,
      ...validHtmlAttributes,
      style: { ...generatedStyles, ...userStyles },
    };
  }

  renderToString({ attributes, variants, ...rest }: EcoImageProps): string {
    this.originalProps = { attributes, variants, ...rest };
    const derivedAttributes = this.generateAttributes(this.originalProps);

    if (!derivedAttributes) return '';

    const stringifiedAttributes = this.stringifyAttributes(derivedAttributes);

    return `<img ${stringifiedAttributes} />`;
  }

  private collectAttributes(props: EcoImageProps): CollectedAttributes | null {
    const { variants, priority, layout = DEFAULT_LAYOUT, unstyled, staticVariant } = props;

    const priorityAttributes = this.getPriorityAttributes(priority);

    if (!variants || variants.length === 0) {
      return this.handleNoVariants(props, priorityAttributes);
    }

    const mainVariant = this.getMainVariant(variants, staticVariant);
    if (!mainVariant) return null;

    const dimensions = this.calculateEffectiveDimensions(props, mainVariant);
    const styles = this.calculateStyles(dimensions, layout, unstyled);

    const imageAttributes = this.buildImageAttributes(mainVariant, dimensions, props, priorityAttributes, styles);

    return imageAttributes;
  }

  private getPriorityAttributes(
    priority?: boolean,
  ): Pick<GenerateAttributesResult, 'loading' | 'fetchpriority' | 'decoding'> {
    return {
      loading: priority ? 'eager' : 'lazy',
      fetchpriority: priority ? 'high' : 'auto',
      decoding: priority ? 'auto' : 'async',
    };
  }

  private getMainVariant(variants: ImageVariant[], staticVariant?: string): ImageVariant | null {
    if (staticVariant) {
      return variants.find((v) => v.label === staticVariant) || null;
    }

    return variants.sort((a, b) => b.width - a.width)[0] || null;
  }

  private calculateEffectiveDimensions(
    props: EcoImageProps,
    variant: ImageVariant,
  ): { width?: number; height?: number } {
    return LayoutAttributesManager.getEffectiveDimensions(props, [variant]);
  }

  private calculateStyles(
    dimensions: { width?: number; height?: number },
    layout: ImageLayout,
    unstyled?: boolean,
  ): [string, string][] {
    if (unstyled) return [];

    return ImageUtils.generateLayoutStyles({
      ...dimensions,
      layout,
      aspectRatio: this.originalProps?.aspectRatio,
    });
  }

  private buildImageAttributes(
    variant: ImageVariant,
    dimensions: { width?: number; height?: number },
    props: EcoImageProps,
    priorityAttributes: Pick<GenerateAttributesResult, 'loading' | 'fetchpriority' | 'decoding'>,
    styles: [string, string][],
  ): CollectedAttributes {
    const { staticVariant, attributes } = props;
    const useResponsiveImage = !staticVariant;

    return {
      ...dimensions,
      ...priorityAttributes,
      src: variant.src,
      ...(useResponsiveImage
        ? {
            srcset: attributes.srcset,
            sizes: attributes.sizes,
          }
        : {}),
      styles,
    };
  }

  private handleNoVariants(
    props: EcoImageProps,
    priorityAttributes: Pick<GenerateAttributesResult, 'loading' | 'fetchpriority' | 'decoding'>,
  ): CollectedAttributes {
    const { attributes, width, height, layout, unstyled } = props;

    const dimensions = {
      width: width || attributes.width,
      height: height || attributes.height,
    };

    const styles = this.calculateStyles(dimensions, layout || DEFAULT_LAYOUT, unstyled);

    return {
      ...dimensions,
      ...priorityAttributes,
      src: attributes.src,
      styles,
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

  private createCamelCaseKeysOnStyle(styles: [string, string][]): Record<string, string> {
    return Object.fromEntries(
      styles.map(([key, value]) => [key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]),
    );
  }
}

export const renderer = new ImageRenderer();
