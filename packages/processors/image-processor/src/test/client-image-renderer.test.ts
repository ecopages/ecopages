import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { ClientImageRenderer } from '../client/client-image-renderer';

const mockImageProps = {
  src: '/test/image.jpg',
  alt: 'Test image',
  width: 800,
  height: 600,
};

describe('ClientImageRenderer', () => {
  const configElement = {
    textContent: JSON.stringify({
      sizes: [
        { width: 1920, label: 'xl' },
        { width: 800, label: 'md' },
        { width: 400, label: 'sm' },
      ],
      format: 'webp',
      quality: 80,
      optimizedUrlPrefix: '/public/assets/optimized',
    }),
  } as HTMLElement;

  const getElementByIdMock = mock((id: string) => {
    if (id === 'eco-images-config') {
      return configElement;
    }
    return null;
  });

  beforeAll(() => {
    (global.document as any) = {
      getElementById: null,
    };
  });

  beforeEach(() => {
    document.getElementById = getElementByIdMock;
  });

  it('should generate correct attributes for constrained layout', () => {
    const renderer = new ClientImageRenderer('eco-images-config');
    const attributes = renderer.generateAttributes(mockImageProps);

    expect(attributes.src).toContain('/public/assets/optimized/image-xl.webp');
    expect(attributes.alt).toBe(mockImageProps.alt);
    expect(attributes.width).toBe(mockImageProps.width);
    expect(attributes.height).toBe(mockImageProps.height);
    expect(attributes.loading).toBe('lazy');
    expect(attributes.srcset).toContain('webp');
    expect(attributes.sizes).toContain('px');
  });

  it('should handle priority images', () => {
    const renderer = new ClientImageRenderer('eco-images-config');
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
    const renderer = new ClientImageRenderer('eco-images-config');
    const attributes = renderer.generateAttributes({
      ...mockImageProps,
      staticVariant: 'md',
    });

    expect(attributes.srcset).toBeUndefined();
    expect(attributes.sizes).toBeUndefined();
    expect(attributes.src).toContain('md');
  });

  it('should return the correct image rendered to string', () => {
    const renderer = new ClientImageRenderer('eco-images-config');
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
