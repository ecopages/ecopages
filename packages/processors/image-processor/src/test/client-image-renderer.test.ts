import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { ClientImageRenderer } from '../client/client-image-renderer';
import { mockConfig, mockImageProps } from './test-utils';

describe('ClientImageRenderer', () => {
  const configElement = {
    textContent: JSON.stringify(mockConfig),
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

    expect(attributes.src).toContain('/assets/images/image-xl.webp');
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
