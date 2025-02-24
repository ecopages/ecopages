import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import type { ImageProcessor } from '../image-processor';
import { ImageRewriter } from '../image-rewriter';
import {
  cleanUpBeforeTest,
  cleanupTestContext,
  createTestContext,
  createTestImage,
  createTestProcessor,
  setupTestContext,
} from './test-utils';

describe('ImageRewriter', () => {
  const context = createTestContext(path.resolve(__dirname), 'rewriter');
  let processor: ImageProcessor;
  let generator: ImageRewriter;

  beforeAll(async () => {
    await setupTestContext(context);
    await createTestImage(context.testImage, 1024, 768);

    processor = createTestProcessor(context, {
      imagesDir: path.dirname(context.testImage),
    });

    generator = new ImageRewriter(processor);
    await processor.processImage(context.testImage);
  });

  beforeEach(() => {
    cleanUpBeforeTest(context);
  });

  afterAll(() => {
    cleanupTestContext(context);
  });

  describe('Basic Functionality', () => {
    test('preserves all original attributes when replacing', async () => {
      const html = `<img src="${context.testImage}" alt="Alt text" class="test-class" loading="lazy" data-custom="value">`;
      const result = generator.enhanceImages(html);

      expect(result).toContain('class="test-class"');
      expect(result).toContain('alt="Alt text"');
      expect(result).toContain('loading="lazy"');
      expect(result).toContain('data-custom="value"');
      expect(result).toContain('srcset=');
      expect(result).toContain('sizes=');
    });

    test('handles multiple images with different attributes', async () => {
      const html = `
        <div>
          <img src="${context.testImage}" alt="First" class="img1" data-index="1">
          <img src="${context.testImage}" alt="Second" class="img2" data-index="2">
        </div>
      `;

      const result = generator.enhanceImages(html);

      expect(result).toContain('data-index="1"');
      expect(result).toContain('data-index="2"');
      expect(result).toContain('class="img1"');
      expect(result).toContain('class="img2"');
    });

    test('handles images without optional attributes', async () => {
      const html = `<img src="${context.testImage}">`;
      const result = generator.enhanceImages(html);

      expect(result).toContain('srcset=');
      expect(result).toContain('sizes=');
      expect(result).not.toContain('<picture');
    });
  });

  describe('HTML Handling', () => {
    test('preserves whitespace and newlines', async () => {
      const html = `
        <img
          src="${context.testImage}"
          alt="Multi
          line"
          class="spaced"
        >
      `;
      const result = generator.enhanceImages(html);

      expect(result).toContain('alt="Multi\n          line"');
      expect(result).toContain('class="spaced"');
    });

    test('handles complex HTML correctly', async () => {
      const html = `
        <div>
          <img src="${context.testImage}" class="first">
          <p>Text between images</p>
          <!-- Comment -->
          <img src="${context.testImage}" class="second">
        </div>
      `;
      const result = generator.enhanceImages(html);

      expect(result).toContain('class="first"');
      expect(result).toContain('class="second"');
      expect(result).toContain('<p>Text between images</p>');
      expect(result).toContain('<!-- Comment -->');
    });

    test('handles no images gracefully', async () => {
      const html = '<div>No images here</div>';
      const result = generator.enhanceImages(html);

      expect(result).toBe(html);
    });
  });

  describe('Responsive Images', () => {
    test('generates correct srcset and sizes for responsive images', async () => {
      const processor = createTestProcessor(context, {
        quality: 80,
        format: 'webp',
        sizes: [
          { width: 320, label: 'sm' },
          { width: 768, label: 'md' },
          { width: 1024, label: 'lg' },
        ],
      });

      const generator = new ImageRewriter(processor);
      await processor.processImage(context.testImages.large.path);

      const normalizedPath = `/${context.publicDir}/large.jpg`;
      const html = generator.enhanceImages(`<img src="${normalizedPath}" alt="Test">`);

      expect(html).toContain('(min-width: 1024px) 1024px, (min-width: 768px) 80vw, 100vw');
    });

    test('preserves order of sizes from smallest to largest', async () => {
      const processor = createTestProcessor(context, {
        sizes: [
          { width: 1024, label: 'lg' },
          { width: 320, label: 'sm' },
          { width: 768, label: 'md' },
        ],
      });

      await processor.processImage(context.testImages.large.path);
      const srcset = processor.generateSrcset(context.testImages.large.path);
      const widths = srcset.match(/\d+w/g)?.map((w) => Number.parseInt(w));

      expect(widths).toBeDefined();
      expect(widths).toEqual([1024, 768, 320].sort((a, b) => b - a));
    });
  });

  describe('Data Attributes', () => {
    test('handles data-static-variant attribute', () => {
      const html = `<img src="${context.testImage}" data-static-variant="md" alt="Fixed size test">`;
      const result = generator.enhanceImages(html);

      expect(result).toContain('src="/output/test-md.opt.webp"');
      expect(result).not.toContain('srcset=');
      expect(result).not.toContain('data-static-variant');
      expect(result).toContain('alt="Fixed size test"');
    });

    test('falls back to default behavior when no data attributes present', () => {
      const html = `<img src="${context.testImage}" alt="Default behavior">`;
      const result = generator.enhanceImages(html);

      expect(result).toContain('srcset=');
      expect(result).toContain('sizes=');
      expect(result).toContain('alt="Default behavior"');
    });
  });

  describe('Edge Cases', () => {
    test('handles empty string input', () => {
      const result = generator.enhanceImages('');
      expect(result).toBe('');
    });

    test('handles HTML with no img tags', () => {
      const html = '<div><p>Text only</p><span>More text</span></div>';
      const result = generator.enhanceImages(html);
      expect(result).toBe(html);
    });

    test('handles malformed HTML gracefully', () => {
      const cases = [
        '<img src=>',
        '<img >',
        '<img src=""/>',
        '<img src="/non-existent.jpg">',
        '<img src="data:image/png;base64,abc123">',
      ];

      for (const html of cases) {
        const result = generator.enhanceImages(html);
        expect(result).toBe(html);
      }
    });

    test('handles special characters in attributes', () => {
      const html = `<img src="${context.testImage}" alt="Quote's & ampersand" class="test&class">`;
      const result = generator.enhanceImages(html);

      expect(result).toContain('alt="Quote\'s & ampersand"');
      expect(result).toContain('class="test&class"');
    });
  });

  describe('Source Path Handling', () => {
    test('handles absolute paths', () => {
      const html = `<img src="/absolute${context.testImage}" alt="Test">`;
      const result = generator.enhanceImages(html);
      expect(result).toContain('srcset=');
    });

    test('handles relative paths', () => {
      const html = `<img src="./relative/${path.basename(context.testImage)}" alt="Test">`;
      const result = generator.enhanceImages(html);
      expect(result).toContain('srcset=');
    });

    test('handles URL paths', () => {
      const html = `<img src="http://example.com/image.jpg" alt="Test">`;
      const result = generator.enhanceImages(html);
      expect(result).toBe(html); // Should not process external URLs
    });
  });

  describe('Attribute Handling', () => {
    test('preserves boolean attributes', () => {
      const html = `<img src="${context.testImage}" loading alt="Test image">`;
      const result = generator.enhanceImages(html);

      expect(result).toContain('loading');
      expect(result).not.toContain('loading=""');
      expect(result).toContain('alt="Test image"');
    });

    test('handles boolean and valued attributes together', () => {
      const html = `<img src="${context.testImage}" loading="lazy" hidden alt="Test">`;
      const result = generator.enhanceImages(html);

      expect(result).toContain('loading="lazy"');
      expect(result).toContain('hidden');
      expect(result).toContain('alt="Test"');
    });

    test('handles custom data attributes', () => {
      const html = `<img src="${context.testImage}" data-custom-1="value1" data-custom-2="value2">`;
      const result = generator.enhanceImages(html);
      expect(result).toContain('data-custom-1="value1"');
      expect(result).toContain('data-custom-2="value2"');
    });
  });

  describe('Multiple Image Variants', () => {
    test('generates different variants based on size', async () => {
      const processor = createTestProcessor(context, {
        sizes: [
          { width: 320, label: 'sm' },
          { width: 768, label: 'md' },
          { width: 1024, label: 'lg' },
        ],
      });

      await processor.processImage(context.testImage);
      const html = `<img src="${context.testImage}" alt="Test">`;
      const result = new ImageRewriter(processor).enhanceImages(html);

      expect(result).toContain('-sm.opt.webp');
      expect(result).toContain('-md.opt.webp');
      expect(result).toContain('-lg.opt.webp');
    });

    test('handles art direction with picture element', async () => {
      const html = `
        <picture>
          <source media="(min-width: 800px)" srcset="${context.testImage}">
          <source media="(min-width: 400px)" srcset="${context.testImage}">
          <img src="${context.testImage}" alt="Test">
        </picture>
      `;
      const result = generator.enhanceImages(html);

      expect(result).toContain('<picture');
      expect(result).toContain('</picture>');
      expect(result).toMatch(/<source[^>]+srcset=/g);
    });
  });

  describe('Error Handling', () => {
    test('handles missing images gracefully', async () => {
      const html = '<img src="/non-existent/image.jpg">';
      const result = generator.enhanceImages(html);
      expect(result).toBe(html);
    });

    test('handles invalid image paths', async () => {
      const cases = [
        '<img src="../../../outside/root.jpg">',
        '<img src="\\invalid\\path.jpg">',
        '<img src="javascript:alert(1)">',
      ];

      for (const html of cases) {
        const result = generator.enhanceImages(html);
        expect(result).toBe(html);
      }
    });
  });
});
