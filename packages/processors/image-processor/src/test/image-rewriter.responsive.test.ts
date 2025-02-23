import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { ImageRewriter } from '../image-rewriter';
import {
  cleanUpBeforeTest,
  cleanupTestContext,
  createTestContext,
  createTestProcessor,
  setupTestContext,
} from './test-utils';

describe('Responsive Images', () => {
  const context = createTestContext(path.resolve(__dirname), 'processor');

  beforeAll(async () => {
    await setupTestContext(context);
  });

  beforeEach(() => {
    cleanUpBeforeTest(context);
  });

  afterAll(() => {
    cleanupTestContext(context);
  });

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

  test('handles multiple sizes correctly', async () => {
    const processor = createTestProcessor(context, {
      sizes: [
        { width: 320, label: 'sm' },
        { width: 768, label: 'md' },
        { width: 1024, label: 'lg' },
        { width: 1920, label: 'xl' },
      ],
    });

    await processor.processImage(context.testImages.large.path);
    const sizes = processor.generateSizes(context.testImages.large.path);
    const expectedSizes = [
      '(min-width: 1920px) 1920px',
      '(min-width: 1024px) 70vw',
      '(min-width: 768px) 80vw',
      '100vw',
    ].join(', ');
    expect(sizes).toBe(expectedSizes);
  });

  test('generates correct HTML structure with all variants', async () => {
    const processor = createTestProcessor(context, {
      sizes: [
        { width: 320, label: 'sm' },
        { width: 768, label: 'md' },
        { width: 1024, label: 'lg' },
      ],
    });

    const generator = new ImageRewriter(processor);
    await processor.processImage(context.testImages.large.path);

    const html = generator.enhanceImages(
      `<img src="${context.testImages.large.path}" alt="Test image" loading="lazy">`,
    );

    expect(html).toContain('<img');
    expect(html).toContain('srcset=');
    expect(html).toContain('sizes="(min-width: 1024px) 1024px, (min-width: 768px) 80vw, 100vw"');
    expect(html).toContain('alt="Test image"');
    expect(html).toContain('loading="lazy"');
  });

  test('uses next larger size for each viewport width', async () => {
    const processor = createTestProcessor(context, {
      sizes: [
        { width: 320, label: 'sm' },
        { width: 768, label: 'md' },
        { width: 1024, label: 'lg' },
      ],
    });

    await processor.processImage(context.testImages.large.path);
    const sizes = processor.generateSizes(context.testImages.large.path);

    const expectedSizes = '(min-width: 1024px) 1024px, (min-width: 768px) 80vw, 100vw';

    expect(sizes).toBe(expectedSizes);
  });
});
