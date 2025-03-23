import { DEFAULT_LAYOUT, type EcoImageProps } from './image-renderer';

/**
 * ImageUtils
 * This class contains utility methods for working with images
 * It contains methods for generating srcset, sizes and styles attributes for the image element
 */
export class ImageUtils {
  private static readonly BREAKPOINTS = {
    desktop: 1024,
    tablet: 768,
  } as const;

  private static readonly VIEWPORT_SIZES = {
    desktop: '70vw',
    tablet: '80vw',
    mobile: '100vw',
  } as const;

  static readonly DEFAULT_LAYOUT = DEFAULT_LAYOUT;

  /**
   * Generates a srcset string from processed image variants using relative paths
   * @param {ImageVariant[]} variants - Array of processed image variants
   * @returns {string} srcset attribute string
   * @private
   */
  static generateSrcset(variants: Array<{ width: number; src: string }>): string {
    return variants
      .sort((a, b) => b.width - a.width)
      .map(({ src, width }) => `${src} ${width}w`)
      .join(', ');
  }

  /**
   * Generates sizes attribute based on image variants.
   * Sizes are generated based on the variant widths and breakpoints.
   * Here we use a smart approach to generate sizes based on the variant widths.
   * We start with the largest variant and set a min-width condition for its width.
   * Then we add conditions for each variant based on the viewport width.
   * Finally, we add a catch-all for the smallest screens.
   * This approach ensures that the browser will select the correct image variant based on the viewport width.
   * @see https://developer.mozilla.org/en-US/docs/Learn/HTML/Multimedia_and_embedding/Responsive_images#resolution_switching_different_sizes
   * @param {ImageVariant[]} variants - Array of processed image variants
   * @returns {string} sizes attribute string
   * @private
   */
  static generateSizes(variants: Array<{ width: number }>): string {
    if (!variants?.length) return '';

    const sortedVariants = [...variants].sort((a, b) => b.width - a.width);
    const [largest, ...rest] = sortedVariants;

    const conditions = [
      `(min-width: ${largest.width}px) ${largest.width}px`,
      ...rest
        .map((variant) => {
          if (variant.width >= ImageUtils.BREAKPOINTS.desktop) {
            return `(min-width: ${variant.width}px) ${ImageUtils.VIEWPORT_SIZES.desktop}`;
          }
          if (variant.width >= ImageUtils.BREAKPOINTS.tablet) {
            return `(min-width: ${variant.width}px) ${ImageUtils.VIEWPORT_SIZES.tablet}`;
          }
          return null;
        })
        .filter(Boolean),
      ImageUtils.VIEWPORT_SIZES.mobile,
    ];

    return conditions.join(', ');
  }

  /**
   * Generates a styles string based on image layout and config
   * @param {ImageLayout} layout - Image layout type
   * @param {LayoutAttributes} config - Image layout configuration
   * @returns {string} styles string
   * @private
   */
  static generateLayoutStyles(
    config: Pick<EcoImageProps, 'layout' | 'width' | 'height' | 'aspectRatio'>,
  ): [string, string][] {
    const layout = config.layout || ImageUtils.DEFAULT_LAYOUT;

    const styles: [string, string][] = [['object-fit', 'cover']];

    const aspectRatio =
      config.aspectRatio || (config.width && config.height ? `${config.width}/${config.height}` : undefined);

    if (aspectRatio) {
      styles.push(['aspect-ratio', aspectRatio]);
    }

    switch (layout) {
      case 'fixed':
        if (config.width) {
          styles.push(['width', `${config.width}px`], ['min-width', `${config.width}px`]);
        }
        if (config.height) {
          styles.push(['height', `${config.height}px`], ['min-height', `${config.height}px`]);
        }
        break;

      case 'constrained':
        if (config.width) {
          styles.push(['max-width', `${config.width}px`]);
        }
        if (config.height) {
          styles.push(['max-height', `${config.height}px`]);
        }
        styles.push(['width', '100%'], ['height', 'auto']);
        break;

      case 'full-width':
        if (config.height) {
          styles.push(['height', `${config.height}px`], ['min-height', `${config.height}px`]);
        }
        styles.push(['width', '100%']);
        break;
    }

    return styles;
  }

  static generateStyles(config: Pick<EcoImageProps, 'layout' | 'width' | 'height' | 'aspectRatio'>): string {
    const styles = ImageUtils.generateLayoutStyles(config);
    return styles.map(([key, value]) => `${key}:${value}`).join(';');
  }
}
