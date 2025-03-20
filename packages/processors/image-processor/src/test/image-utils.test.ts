import { describe, expect, it } from 'bun:test';
import { ImageUtils } from '../shared/image-utils';

describe('ImageUtils', () => {
  const mockVariants = [
    { width: 1920, displayPath: '/test/xl.webp' },
    { width: 1280, displayPath: '/test/lg.webp' },
    { width: 640, displayPath: '/test/md.webp' },
  ];

  it('should generate correct srcset', () => {
    const srcset = ImageUtils.generateSrcset(mockVariants);
    expect(srcset).toBe('/test/xl.webp 1920w, /test/lg.webp 1280w, /test/md.webp 640w');
  });

  it('should generate correct sizes', () => {
    const sizes = ImageUtils.generateSizes(mockVariants);
    expect(sizes).toContain('(min-width:');
    expect(sizes).toContain('px)');
    expect(sizes).toContain('vw');
  });

  it('should generate correct layout styles', () => {
    const styles = ImageUtils.generateLayoutStyles({
      layout: 'constrained',
      width: 800,
      height: 600,
    });

    const styleMap = new Map(styles);
    expect(styleMap.get('max-width')).toBe('800px');
    expect(styleMap.get('width')).toBe('100%');
  });
});
