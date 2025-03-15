import { describe, expect, it } from 'bun:test';
import type { ImageMap } from '../server/image-processor';
import { ServerImageRenderer } from '../server/server-image-renderer';
import { mockImageProps } from './test-utils';

describe('ServerImageRenderer', () => {
  const mockImageMap = {
    [mockImageProps.src]: {
      hash: 'test-hash',
      variants: [
        {
          originalPath: '/test/output/image-xl.webp',
          displayPath: '/assets/images/image-xl.webp',
          width: 1920,
          height: 1080,
          label: 'xl',
          format: 'webp',
        },
      ],
      originalPath: mockImageProps.src,
      displayPath: '/assets/images/image.jpg',
      srcset: '/assets/images/image-xl.webp 1920w',
      sizes: '100vw',
    },
  } as ImageMap;

  it('should generate correct attributes from image map', () => {
    const renderer = new ServerImageRenderer(mockImageMap);
    const attributes = renderer.generateAttributes(mockImageProps);

    expect(attributes).toMatchObject({
      src: mockImageMap[mockImageProps.src].variants[0].displayPath,
      alt: mockImageProps.alt,
      srcset: mockImageMap[mockImageProps.src].srcset,
      sizes: mockImageMap[mockImageProps.src].sizes,
    });
  });

  it('should return null for non-existent images', () => {
    const renderer = new ServerImageRenderer(mockImageMap);
    const attributes = renderer.generateAttributes({
      ...mockImageProps,
      src: '/non-existent.jpg',
    });

    expect(attributes).toBeNull();
  });

  it('should handle priority images', () => {
    const renderer = new ServerImageRenderer(mockImageMap);
    const attributes = renderer.generateAttributes({
      ...mockImageProps,
      priority: true,
    });

    expect(attributes).toMatchObject({
      loading: 'eager',
      fetchpriority: 'high',
    });
  });

  it('should handle static variants', () => {
    const renderer = new ServerImageRenderer(mockImageMap);
    const attributes = renderer.generateAttributes({
      ...mockImageProps,
      staticVariant: 'xl',
    });

    if (!attributes) {
      throw new Error('Attributes should not be null');
    }

    expect(attributes.srcset).toBeUndefined();
    expect(attributes.sizes).toBeUndefined();
    expect(attributes.src).toContain('xl');
  });

  it('should return the correct image rendered to string', () => {
    const renderer = new ServerImageRenderer(mockImageMap);
    const rendered = renderer.renderToString(mockImageProps);

    expect(rendered).toContain('src');
    expect(rendered).toContain('alt');
    expect(rendered).toContain('width');
    expect(rendered).toContain('height');
    expect(rendered).toContain('loading');
    expect(rendered).toContain('srcset');
    expect(rendered).toContain('sizes');
  });
});
