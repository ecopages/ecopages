import { ConfigLoader } from './client-config-loader';
import type { ImageLayout, LayoutAttributes } from './constants';
import type { ImageProcessorConfig } from './image-processor';
import { ImageUtils } from './image-utils';

/**
 * ClientImageProcessorConfig
 * This interface represents the configuration that the client can provide to the image processor
 */
export interface ClientImageProcessorConfig {
  sizes: ImageProcessorConfig['sizes'];
  format: ImageProcessorConfig['format'];
  quality: ImageProcessorConfig['quality'];
  publicPath: ImageProcessorConfig['publicPath'];
  generateUrl: (path: string, size: string, format: string) => string;
}

/**
 * ImageProps
 * This interface represents the props that can be passed to the ImagePropsGenerator
 */
interface ImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  priority?: boolean;
  layout?: ImageLayout;
  unstyled?: boolean;
}

/**
 * GenerateAttributesResult
 * This interface represents the result of the generation of the attributes for the image element
 */
interface GenerateAttributesResult {
  fetchpriority: HTMLImageElement['fetchPriority'];
  loading: HTMLImageElement['loading'];
  decoding: HTMLImageElement['decoding'];
  src: string;
  srcset: string;
  sizes: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  style?: string;
}

/**
 * ImagePropsGenerator
 * This class is responsible for generating the attributes for the image element
 * It uses the provided props to generate the attributes
 * It also uses the configuration provided by the client to generate the srcset and sizes attributes
 */
export class ImagePropsGenerator {
  config: ClientImageProcessorConfig;
  constructor(configId: string) {
    this.config = new ConfigLoader(configId).load();
  }

  /**
   * It generates the attributes for the image element based on the provided props
   * This is the main method that should be used to generate the attributes for the image element
   * @param props
   * @returns
   */
  generateAttributes(props: ImageProps) {
    const attributes = {
      width: props.width,
      height: props.height,
      priority: props.priority,
      layout: props.layout || 'constrained',
      aspectRatio: props.aspectRatio,
      alt: props.alt,
      src: props.src,
    };

    return this.buildImageAttributes(attributes);
  }

  /**
   * Generates a stringified version of the attributes
   * @param props
   * @returns
   */
  stringifyImageAttributes(props: ImageProps) {
    const attributes = this.generateAttributes(props);
    return this.stringifyAttributes(attributes);
  }

  /**
   * Generates the image markup as an HTML string
   * @param props The image properties and additional HTML attributes
   * @returns An HTML string representation of the image element
   */
  renderImageToString({
    attributes,
    ...props
  }: ImageProps & { attributes?: { className?: string; [key: `data-${string}`]: string } }) {
    const derivedAttributes = this.generateAttributes(props);
    const stringifiedAttributes = this.stringifyAttributes({
      ...derivedAttributes,
      ...attributes,
    });
    return `<img ${stringifiedAttributes}  />`;
  }

  private getConfigSizes(): number[] {
    return Object.entries(this.config.sizes).map(([_, size]) => size.width);
  }

  private getBiggestSize() {
    return Math.max(...this.getConfigSizes());
  }

  private buildImageAttributes(props: ImageProps): GenerateAttributesResult {
    const layout = props.layout || 'constrained';
    const dimensionsAttributes = this.getDimensionsAttributes(
      props.width,
      props.height,
      props.aspectRatio,
      layout,
      props.unstyled,
    );

    const width = dimensionsAttributes.width || this.getBiggestSize();

    const height =
      !dimensionsAttributes.height && props.aspectRatio
        ? Math.round(width / (this.parseAspectRatio(props.aspectRatio) as number))
        : dimensionsAttributes.height;

    const variants = this.generateVariants(
      props.src,
      {
        width,
        height: height ?? this.getBiggestSize(),
      },
      layout,
    );

    return {
      ...dimensionsAttributes,
      loading: props.priority ? 'eager' : ('lazy' as HTMLImageElement['loading']),
      fetchpriority: props.priority ? 'high' : ('auto' as HTMLImageElement['fetchPriority']),
      decoding: props.priority ? 'async' : 'auto',
      src: variants[0].displayPath,
      srcset: ImageUtils.generateSrcset(variants),
      sizes: ImageUtils.generateSizes(this.config.sizes),
      alt: props.alt,
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

  private parseAspectRatio(value: string | undefined): number | undefined {
    if (!value) return undefined;

    if (value.includes('/')) {
      const [width, height] = value.split('/').map(Number);
      return width / height;
    }

    return Number(value);
  }

  private getDimensionsAttributes(
    width?: number,
    height?: number,
    aspectRatio?: string,
    layout: ImageLayout = 'constrained',
    unstyled?: boolean,
  ): Partial<LayoutAttributes> {
    const attributes: Partial<LayoutAttributes> = {};
    const styles: [string, string][] = [['object-fit', 'cover']];

    if (aspectRatio) {
      const ratio = this.parseAspectRatio(aspectRatio);
      if (ratio) {
        styles.push(['aspect-ratio', aspectRatio]);

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
        } else {
          styles.push(['width', '100%'], ['height', 'auto']);
        }

        attributes.style = this.generateStyleString(styles);
        return attributes;
      }
    }

    if (width || height) {
      attributes.width = width;
      attributes.height = height;
      this.addLayoutStyles(styles, layout, width, height, unstyled);
    }

    attributes.style = this.generateStyleString(styles);
    this.addLayoutStyles(styles, layout, width, height, unstyled);
    return attributes;
  }

  private addLayoutStyles(
    styles: [string, string][],
    layout: ImageLayout,
    width?: number,
    height?: number,
    unstyled?: boolean,
  ): void {
    if (unstyled) {
      return;
    }

    const layoutStyles = ImageUtils.generateLayoutStyles(layout, {
      width,
      height,
    });

    styles.push(...layoutStyles);
  }

  private generateStyleString(styles: [string, string][]): string {
    return styles.map(([key, value]) => `${key}:${value}`).join(';');
  }

  private generateVariants(src: string, dimensions: { width: number; height: number }, layout: ImageLayout) {
    const sortedSizes = [...this.config.sizes].sort((a, b) => b.width - a.width);

    sortedSizes.filter((size) => {
      if ((layout === 'fixed' || layout === 'constrained') && size.width > dimensions.width) {
        return false;
      }
      return true;
    });

    if (sortedSizes.length === 0) {
      sortedSizes.push(this.config.sizes[0]);
    }

    const variants = [];

    const aspectRatio = dimensions.width / dimensions.height;

    for (const size of sortedSizes) {
      const variant = {
        width: size.width,
        height: Math.round(size.width / aspectRatio),
        displayPath: this.config.generateUrl(src, size.label, this.config.format),
        label: size.label,
      };

      variants.push(variant);
    }

    return variants;
  }
}
