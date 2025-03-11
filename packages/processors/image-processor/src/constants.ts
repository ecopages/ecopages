import type { ImageProcessorConfig } from './image-processor';

/**
 * Default configuration for the image processor
 */
export const DEFAULT_CONFIG: Partial<ImageProcessorConfig> &
  Required<Pick<ImageProcessorConfig, 'publicDir' | 'publicPath' | 'sizes' | 'quality' | 'format'>> = {
  quality: 80,
  format: 'webp' as const,
  sizes: [
    { width: 2000, label: 'xl' },
    { width: 1200, label: 'lg' },
    { width: 400, label: 'sm' },
  ],
  publicDir: 'public',
  publicPath: '/output',
} as const;

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
