import type { ImageProcessorConfig } from '../server/image-processor';

/**
 * Deeply required type
 */
export type DeepRequired<T> = Required<{
  [K in keyof T]: T[K] extends Required<T[K]> ? T[K] : DeepRequired<T[K]>;
}>;

/**
 * Default configuration for the image processor
 */
export const DEFAULT_CONFIG: Omit<DeepRequired<ImageProcessorConfig>, 'importMeta' | 'initialImageMap'> = {
  quality: 80,
  format: 'webp' as const,
  sizes: [],
  acceptedFormats: ['webp', 'jpeg', 'png', 'avif'],
  paths: {
    sourceImages: '/src/public/assets/images',
    targetImages: '/src/public/assets/optimized',
    sourceUrlPrefix: '/public/assets/images',
    optimizedUrlPrefix: '/public/assets/optimized',
  },
};

/**
 * Custom attributes for the image element
 */
export const CUSTOM_IMAGE_ATTRIBUTES = {
  'data-optimize': 'data-optimize',
  'data-src': 'data-src',
  'data-static-variant': 'data-static-variant',
  'data-layout': 'data-layout',
  'data-priority': 'data-priority',
  'data-background': 'data-background',
  'data-processed': 'data-processed',
  'data-aspect-ratio': 'data-aspect-ratio',
  'data-unstyled': 'data-unstyled',
} as const;

/**
 * Image layout options
 */
export type ImageLayout = 'fixed' | 'constrained' | 'full-width';

export interface LayoutAttributes {
  layout: ImageLayout;
  width: number;
  height: number;
  priority?: boolean;
  aspectRatio?: string;
  style?: string;
}
/**
 * Custom attributes for the image element
 */
export type CustomImageAttributes = typeof CUSTOM_IMAGE_ATTRIBUTES;

export const DEFAULT_LAYOUT: ImageLayout = 'constrained';
