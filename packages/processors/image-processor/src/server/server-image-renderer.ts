/**
 * ServerImageRenderer
 * @module
 */

import { Logger } from '@ecopages/logger';
import { BaseImageRenderer, type CollectedAttributes } from '../shared/base-image-renderer';
import type { ImageProps } from '../shared/image-renderer-provider';
import type { ImageMap, ImageVariant } from './image-processor';

const appLogger = new Logger('[@ecopages/image-processor/server-image-renderer]');

/**
 * ServerImageRenderer
 * This class is responsible for generating the attributes for the image element
 * It uses the provided props to generate the attributes
 * It also uses the image map provided by the server to generate the srcset and sizes attributes
 */
export class ServerImageRenderer extends BaseImageRenderer {
  constructor(private imageMap: ImageMap) {
    super();
  }

  protected collectAttributes(props: ImageProps): CollectedAttributes | null {
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

    const { attributes: dimensionsAttributes, styles } = this.getDimensionsAttributes(
      props.width,
      props.height,
      derivedAspectRatio,
      layout,
      props.unstyled,
    );

    return {
      ...dimensionsAttributes,
      width: mainVariant.width,
      height: mainVariant.height,
      loading: props.priority ? 'eager' : 'lazy',
      fetchpriority: props.priority ? 'high' : 'auto',
      decoding: props.priority ? 'auto' : 'async',
      src: mainVariant.displayPath,
      alt: props.alt,
      ...(useResponsiveImage ? { srcset, sizes } : {}),
      styles,
    };
  }
}
