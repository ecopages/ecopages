import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import type { ImageProcessor } from '../image-processor';
import { ImageRewriter } from '../image-rewriter';
import { cleanupTestContext, createTestContext, createTestProcessor, setupTestContext } from './test-utils';

describe('ImageRewriter', () => {
  const context = createTestContext(path.resolve(__dirname));
  let processor: ImageProcessor;
  let rewriter: ImageRewriter;
  let imagesMap: ImageProcessor['imageMap'];
  let imagesPath: string[];

  beforeAll(async () => {
    await setupTestContext(context);

    processor = createTestProcessor(context, {
      quality: 80,
      sizes: [
        { width: 320, label: 'sm' },
        { width: 768, label: 'md' },
        { width: 1024, label: 'lg' },
      ],
    });

    await processor.processDirectory();

    imagesMap = processor.getImageMap();

    imagesPath = Object.values(imagesMap).map((image) => image.displayPath);

    rewriter = new ImageRewriter(processor);
  });

  afterAll(() => {
    cleanupTestContext(context);
  });

  describe('String Input', () => {
    test('enhances a single image correctly', async () => {
      const html = `<img src="${imagesPath[0]}" alt="Test">`;
      const result = await rewriter.enhanceImages(html);

      expect(result).toContain('srcset=');
      expect(result).toContain('sizes=');
      expect(result).toContain('alt="Test"');
      expect(result).toContain('width=');
      expect(result).toContain('height=');
    });
  });

  describe('Response Input', () => {
    test('handles Response objects', async () => {
      const html = `<img src="${imagesPath[0]}" alt="Test">`;
      const response = new Response(html, {
        headers: { 'Content-Type': 'text/html' },
      });

      const result = await rewriter.enhanceImages(response);
      expect(result).toBeInstanceOf(Response);

      const text = await result.text();
      expect(text).toContain('srcset=');
      expect(text).toContain('alt="Test"');
    });

    test('preserves Response headers', async () => {
      const html = `<img src="${imagesPath[0]}">`;
      const response = new Response(html, {
        headers: {
          'Content-Type': 'text/html',
          'Custom-Header': 'test-value',
        },
      });

      const result = await rewriter.enhanceImages(response);
      expect(result.headers.get('Content-Type')).toBe('text/html');
      expect(result.headers.get('Custom-Header')).toBe('test-value');
    });

    test('preserves Response status and statusText', async () => {
      const html = `<img src="${imagesPath[0]}">`;
      const response = new Response(html, {
        status: 201,
        statusText: 'Created',
        headers: { 'Content-Type': 'text/html' },
      });

      const result = await rewriter.enhanceImages(response);
      expect(result.status).toBe(201);
      expect(result.statusText).toBe('Created');
    });
  });

  describe('Multiple Images', () => {
    test('processes multiple images in one HTML string', async () => {
      const html = `
				<img src="${imagesPath[0]}" alt="First">
				<div><img src="${imagesPath[1]}" alt="Second"></div>
			`;
      const result = await rewriter.enhanceImages(html);

      const occurrences = (result as string).match(/srcset=/g)?.length || 0;
      expect(occurrences).toBe(2);
    });
  });

  describe('Error Handling', () => {
    test('handles invalid HTML gracefully', () => {
      const cases = ['<img>', '<img src>', '<img src=>', "<img src=''>"];

      for (const html of cases) {
        expect(() => rewriter.enhanceImages(html)).not.toThrow();
      }
    });

    test('handles non-existing images gracefully', async () => {
      const html = '<img src="/non-existent.jpg">';
      const result = await rewriter.enhanceImages(html);
      expect(result).toBe(html);
    });
  });

  describe('Static Variant Handling', () => {
    test('correctly processes static variants', async () => {
      const html = `<img src="${imagesPath[0]}" data-static-variant="md">`;
      const result = await rewriter.enhanceImages(html);

      expect(result).toContain('-md.opt.webp');
      expect(result).not.toContain('srcset=');
      expect(result).not.toContain('data-static-variant');
    });

    test('falls back to responsive image when static variant not found', async () => {
      const html = `<img src="${imagesPath[0]}" data-static-variant="non-existent">`;
      const result = await rewriter.enhanceImages(html);

      expect(result).toContain('srcset=');
      expect(result).toContain('sizes=');
    });

    test('handles invalid static variant values', async () => {
      const html = `<img src="${imagesPath[0]}" data-static-variant="">`;
      const result = await rewriter.enhanceImages(html);

      expect(result).toContain('srcset=');
      expect(result).not.toContain('data-static-variant');
    });

    test('preserves other attributes when processing static variant', async () => {
      const html = `<img src="${imagesPath[0]}" data-static-variant="md" class="test" alt="Test">`;
      const result = await rewriter.enhanceImages(html);

      expect(result).toContain('class="test"');
      expect(result).toContain('alt="Test"');
    });
  });

  describe('Public Path Handling', () => {
    test('correctly prepends public path to image URLs', async () => {
      const html = `<img src="${imagesPath[0]}">`;
      const result = await rewriter.enhanceImages(html);

      const publicPath = processor.getPublicPath();
      expect(result).toContain(`src="${publicPath}/`);
      expect(result).toContain(
        `${publicPath}/${path.basename(
          imagesMap[imagesPath[0]].variants[imagesMap[imagesPath[0]].variants.length - 1].displayPath,
        )}`,
      );
    });
  });
});
