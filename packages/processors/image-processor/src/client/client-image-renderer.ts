/**
 * ClientImageRenderer
 * @module
 */

import type { GenerateAttributesResult, ImageProps } from 'src/shared/image-renderer-provider';
import type { ImageProcessorConfig } from '../server/image-processor';
import { BaseImageRenderer } from '../shared/base-image-renderer';
import type { ImageLayout, LayoutAttributes } from '../shared/constants';
import { ImageUtils } from '../shared/image-utils';
import { ConfigLoader } from './client-config-loader';

/**
 * ClientImageRendererConfig
 * This interface represents the configuration that the client can provide to the image processor
 */
export interface ClientImageRendererConfig {
  sizes: ImageProcessorConfig['sizes'];
  format: ImageProcessorConfig['format'];
  quality: ImageProcessorConfig['quality'];
  publicPath: ImageProcessorConfig['publicPath'];
  generateUrl: (path: string, size: string, format: string) => string;
}

/**
 * ClientImageRenderer
 * This class is responsible for generating the attributes for the image element
 * It uses the provided props to generate the attributes
 * It also uses the configuration provided by the client to generate the srcset and sizes attributes
 */
export class ClientImageRenderer extends BaseImageRenderer {
  config: ClientImageRendererConfig;
  constructor(configId: string) {
    super();
    this.config = new ConfigLoader(configId).load();
  }

  /**
   * It generates the attributes for the image element based on the provided props
   * This is the main method that should be used to generate the attributes for the image element
   * @param props
   * @returns
   */
  generateAttributes(props: ImageProps): GenerateAttributesResult {
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

    if (props.staticVariant) {
      const variant = variants.find((v) => v.label === props.staticVariant);
      if (variant) {
        return {
          ...dimensionsAttributes,
          loading: props.priority ? 'eager' : 'lazy',
          fetchpriority: props.priority ? 'high' : 'auto',
          decoding: props.priority ? 'auto' : 'async',
          src: variant.displayPath,
          alt: props.alt,
        };
      }
    }

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

  private getConfigSizes(): number[] {
    return Object.entries(this.config.sizes).map(([_, size]) => size.width);
  }

  private getBiggestSize() {
    return Math.max(...this.getConfigSizes());
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
