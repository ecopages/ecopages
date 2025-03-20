/**
 * ClientImageRenderer
 * @module
 */

import type { ImageProps } from 'src/shared/image-renderer-provider';
import type { ImageProcessorConfig } from '../server/image-processor';
import { BaseImageRenderer, type CollectedAttributes } from '../shared/base-image-renderer';
import type { ImageLayout } from '../shared/constants';
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
  constructor() {
    super();
    this.config = new ConfigLoader().load();
  }

  protected collectAttributes(props: ImageProps): CollectedAttributes {
    const layout = props.layout || 'constrained';
    const { attributes: dimensionsAttributes, styles } = this.getDimensionsAttributes(
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
          styles,
        };
      }
    }

    return {
      ...dimensionsAttributes,
      loading: props.priority ? 'eager' : 'lazy',
      fetchpriority: props.priority ? 'high' : 'auto',
      decoding: props.priority ? 'async' : 'auto',
      src: variants[0].displayPath,
      srcset: ImageUtils.generateSrcset(variants),
      sizes: ImageUtils.generateSizes(this.config.sizes ?? []),
      alt: props.alt,
      styles,
    };
  }

  private getConfigSizes(): number[] {
    if (!this.config.sizes) return [];

    return Object.entries(this.config.sizes).map(([_, size]) => size.width);
  }

  private getBiggestSize() {
    return Math.max(...this.getConfigSizes());
  }

  private generateVariants(src: string, dimensions: { width: number; height: number }, layout: ImageLayout) {
    const sortedSizes = [...(this.config.sizes ?? [])].sort((a, b) => b.width - a.width);

    sortedSizes.filter((size) => {
      if ((layout === 'fixed' || layout === 'constrained') && size.width > dimensions.width) {
        return false;
      }
      return true;
    });

    if (sortedSizes.length === 0 && this.config.sizes) {
      sortedSizes.push(this.config.sizes[0]);
    }

    const variants = [];

    const aspectRatio = dimensions.width / dimensions.height;

    for (const size of sortedSizes) {
      const variant = {
        width: size.width,
        height: Math.round(size.width / aspectRatio),
        displayPath: this.config.generateUrl(src, size.label, this.config.format as string),
        label: size.label,
      };

      variants.push(variant);
    }

    return variants;
  }
}
