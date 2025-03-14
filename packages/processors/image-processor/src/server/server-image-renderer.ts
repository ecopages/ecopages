/**
 * ServerImageRenderer
 * @module
 */

import { Logger } from '@ecopages/logger';
import type { GenerateAttributesResult, ImageProps, RenderImageToString } from 'src/shared/image-renderer-provider';
import type { ImageLayout, LayoutAttributes } from '../shared/constants';
import { ImageUtils } from '../shared/image-utils';
import type { ImageMap, ImageVariant } from './image-processor';

const appLogger = new Logger('[@ecopages/image-processor/server-image-renderer]');

/**
 * ServerImageRenderer
 * This class is responsible for generating the attributes for the image element
 * It uses the provided props to generate the attributes
 * It also uses the image map provided by the server to generate the srcset and sizes attributes
 */
export class ServerImageRenderer {
  constructor(private imageMap: ImageMap) {}

  /**
   * It generates the attributes for the image element based on the provided props
   * This is the main method that should be used to generate the attributes for the image element
   * On the contrary to the client image renderer, this method generates the attributes based on the image map provided by the server
   * @param props
   * @returns
   */
  generateAttributes(props: ImageProps): GenerateAttributesResult | null {
    const entry = this.imageMap[props.src];
    if (!entry) return null;

    const staticVariant = props.staticVariant;

    const layout = props.layout || 'constrained';

    const { variants, srcset, sizes } = entry;

    const useResponsiveImage = !props.staticVariant || !variants.some((v) => v.label === props.staticVariant);

    if (props.staticVariant && useResponsiveImage) {
      appLogger.warn(`The static variant ${staticVariant} is not found in the image map for ${props.src}`);
    }

    const mainVariant = useResponsiveImage
      ? variants[0]
      : (variants.find((v) => v.label === staticVariant) as ImageVariant);

    const derivedAspectRatio =
      props.aspectRatio || (mainVariant.width && mainVariant.height)
        ? `${mainVariant.width}/${mainVariant.height}`
        : undefined;

    const dimensionsAttributes = this.getDimensionsAttributes(
      props.width,
      props.height,
      derivedAspectRatio,
      layout,
      props.unstyled,
    );

    return {
      ...dimensionsAttributes,
      loading: props.priority ? 'eager' : 'lazy',
      fetchpriority: props.priority ? 'high' : 'auto',
      decoding: props.priority ? 'auto' : 'async',
      src: mainVariant.displayPath,
      alt: props.alt,
      ...(useResponsiveImage ? { srcset, sizes } : {}),
    };
  }

  /**
   * Generates a stringified version of the attributes
   * @param props
   * @returns
   */
  stringifyImageAttributes(props: ImageProps): string {
    const attributes = this.generateAttributes(props);
    if (!attributes) return '';
    return this.stringifyAttributes(attributes);
  }

  /**
   * Generates a stringified version of the image element
   * @param props
   * @returns
   */
  renderImageToString({
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
  ): Partial<LayoutAttributes> {
    const attributes: Partial<LayoutAttributes> = {};
    const styles: [string, string][] = [];

    if (!unstyled) {
      styles.push(['object-fit', 'cover']);
    }

    if (aspectRatio) {
      const ratio = this.parseAspectRatio(aspectRatio);
      if (ratio) {
        if (!unstyled) {
          styles.push(['aspect-ratio', aspectRatio]);
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
    }

    if (styles.length > 0 && !unstyled) {
      attributes.style = this.generateStyleString(styles);
    }

    return attributes;
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
    return styles.map(([key, value]) => `${key}:${value}`).join(';');
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
}
