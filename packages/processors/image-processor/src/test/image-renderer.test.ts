import { describe, expect, it } from 'bun:test';
import { ImageRenderer } from '../image-renderer';

const mockImageProps = {
  attributes: {
    src: '/assets/images/test-123-800.webp',
    width: 800,
    height: 600,
    sizes: '(min-width: 800px) 800px, 100vw',
    srcset: '/assets/images/test-123-800.webp 800w, /assets/images/test-123-400.webp 400w',
  },
  variants: [
    {
      width: 800,
      height: 600,
      src: '/assets/images/test-123-800.webp',
      label: 'md',
    },
    {
      width: 400,
      height: 300,
      src: '/assets/images/test-123-400.webp',
      label: 'sm',
    },
  ],
  alt: 'Test image',
};

describe('ImageRenderer', () => {
  const renderer = new ImageRenderer();

  describe('generateAttributes', () => {
    it('should generate correct attributes for default layout', () => {
      const attributes = renderer.generateAttributes(mockImageProps);

      expect(attributes).toMatchObject({
        src: mockImageProps.attributes.src,
        width: mockImageProps.attributes.width,
        height: mockImageProps.attributes.height,
        loading: 'lazy',
        fetchpriority: 'auto',
        decoding: 'async',
        srcset: mockImageProps.attributes.srcset,
        sizes: mockImageProps.attributes.sizes,
      });
    });

    it('should handle priority images', () => {
      const attributes = renderer.generateAttributes({
        ...mockImageProps,
        priority: true,
      });

      expect(attributes).toMatchObject({
        loading: 'eager',
        fetchpriority: 'high',
        decoding: 'auto',
      });
    });

    it('should handle static variants', () => {
      const attributes = renderer.generateAttributes({
        ...mockImageProps,
        staticVariant: 'sm',
      });

      expect(attributes?.srcset).toBeUndefined();
      expect(attributes?.sizes).toBeUndefined();
      expect(attributes?.src).toBe('/assets/images/test-123-400.webp');
    });

    it('should handle aspect ratio', () => {
      const attributes = renderer.generateAttributes({
        ...mockImageProps,
        aspectRatio: '16/9',
        width: 1600,
      });

      expect(attributes?.style).toContain('aspect-ratio:1600/900');
      expect(attributes?.height).toBe(900);
    });
  });

  describe('generateAttributesJsx', () => {
    it('should generate correct JSX attributes', () => {
      const attributes = renderer.generateAttributesJsx(mockImageProps);

      expect(attributes).toMatchObject({
        src: mockImageProps.attributes.src,
        width: mockImageProps.attributes.width,
        height: mockImageProps.attributes.height,
        loading: 'lazy',
        fetchPriority: 'auto',
        decoding: 'async',
        srcSet: mockImageProps.attributes.srcset,
        sizes: mockImageProps.attributes.sizes,
      });
    });

    it('should handle unstyled prop', () => {
      const attributes = renderer.generateAttributesJsx({
        ...mockImageProps,
        unstyled: true,
      });

      expect(attributes?.style).toBeEmpty();
    });
  });

  describe('renderToString', () => {
    it('should render correct HTML string', () => {
      const html = renderer.renderToString(mockImageProps);

      expect(html).toContain('<img');
      expect(html).toContain(`src="${mockImageProps.attributes.src}"`);
      expect(html).toContain(`width="${mockImageProps.attributes.width}"`);
      expect(html).toContain(`height="${mockImageProps.attributes.height}"`);
      expect(html).toContain('loading="lazy"');
      expect(html).toContain(`srcset="${mockImageProps.attributes.srcset}"`);
      expect(html).toContain(`sizes="${mockImageProps.attributes.sizes}"`);
    });
  });
});
