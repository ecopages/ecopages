import { ClientImageRenderer } from '../client/client-image-renderer';
import type { ImageProcessor } from '../server/image-processor';
import { ServerImageRenderer } from '../server/server-image-renderer';
import type { ImageLayout } from './constants';

/**
 * ImageProps
 * This interface represents the properties that can be passed to the image element
 */
export interface ImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
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
  alt: string;
  srcset?: string;
  sizes?: string;
  width?: number;
  height?: number;
  style?: string;
}

export interface GenerateAttributesResultJsx {
  fetchPriority: HTMLImageElement['fetchPriority'];
  loading: HTMLImageElement['loading'];
  decoding: HTMLImageElement['decoding'];
  src: string;
  alt: string;
  srcSet?: string;
  sizes?: string;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}

export type RenderImageToString = ImageProps & {
  class?: string;
  [key: `data-${string}`]: string;
};

const isServer = typeof window === 'undefined';

export class ImageRendererProvider {
  static createRenderer() {
    if (isServer) {
      const processor = globalThis.ecoConfig.processors.get('ecopages-image-processor');
      if (processor && 'getImageMap' in processor) {
        const imageMap = ((processor as any).getImageMap as () => ImageProcessor['imageMap'])();
        if (!imageMap) throw new Error('Looks like there is no image map available');

        return new ServerImageRenderer(imageMap);
      }

      throw new Error('Image processor is not defined in the eco config');
    }
    return new ClientImageRenderer();
  }
}

export const renderer = ImageRendererProvider.createRenderer();
