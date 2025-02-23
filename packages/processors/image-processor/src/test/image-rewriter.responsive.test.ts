import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import { ImageProcessor } from '../image-processor';
import { ImageRewriter } from '../image-rewriter';
import { createTestImage } from './test-utils';

describe('Responsive Images', () => {
  const testDir = path.resolve(__dirname);
  const publicDir = 'fixtures';
  const cacheDir = path.join(testDir, 'cache');
  const outputDir = path.join(testDir, 'output');
  const fixturesDir = path.join(testDir, publicDir);

  // Use multiple test images with different dimensions
  const testImages = {
    small: {
      path: path.join(fixturesDir, 'small.jpg'),
      width: 800,
      height: 600,
    },
    medium: {
      path: path.join(fixturesDir, 'medium.jpg'),
      width: 1024,
      height: 768,
    },
    large: {
      path: path.join(fixturesDir, 'large.jpg'),
      width: 2048,
      height: 1536,
    },
  };

  beforeAll(async () => {
    // Create test directories
    for (const dir of [cacheDir, outputDir, fixturesDir]) {
      FileUtils.mkdirSync(dir, { recursive: true });
    }

    // Create all test images
    await Promise.all([
      createTestImage(testImages.small.path, testImages.small.width, testImages.small.height),
      createTestImage(testImages.medium.path, testImages.medium.width, testImages.medium.height),
      createTestImage(testImages.large.path, testImages.large.width, testImages.large.height),
    ]);
  });

  afterAll(() => {
    // Clean up all directories including fixtures
    for (const dir of [cacheDir, outputDir, fixturesDir]) {
      FileUtils.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('generates correct srcset and sizes for responsive images', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir,
      outputDir,
      publicPath: '/images',
      publicDir,
      quality: 80,
      format: 'webp',
      sizes: [
        { width: 320, label: 'sm' },
        { width: 768, label: 'md' },
        { width: 1024, label: 'lg' },
      ],
    });

    const generator = new ImageRewriter(processor);
    await processor.processImage(testImages.large.path);

    const normalizedPath = `/${publicDir}/large.jpg`;
    const html = generator.enhanceImages(`<img src="${normalizedPath}" alt="Test">`);

    expect(html).toContain('(min-width: 1024px) 1024px, (min-width: 768px) 80vw, 100vw');
  });

  test('preserves order of sizes from smallest to largest', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir,
      outputDir,
      publicPath: '/images',
      publicDir,
      sizes: [
        { width: 1024, label: 'lg' },
        { width: 320, label: 'sm' },
        { width: 768, label: 'md' },
      ],
    });

    await processor.processImage(testImages.large.path);
    const srcset = processor.generateSrcset(testImages.large.path);
    const widths = srcset.match(/\d+w/g)?.map((w) => Number.parseInt(w));

    expect(widths).toBeDefined();
    expect(widths).toEqual([1024, 768, 320].sort((a, b) => b - a));
  });

  test('handles multiple sizes correctly', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir,
      outputDir,
      publicPath: '/images',
      publicDir,
      sizes: [
        { width: 320, label: 'sm' },
        { width: 768, label: 'md' },
        { width: 1024, label: 'lg' },
        { width: 1920, label: 'xl' },
      ],
    });

    await processor.processImage(testImages.large.path);
    const sizes = processor.generateSizes(testImages.large.path);
    const expectedSizes = '(min-width: 1024px) 1024px, (min-width: 768px) 80vw, 100vw';
    expect(sizes).toBe(expectedSizes);
  });

  test('generates correct HTML structure with all variants', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir,
      outputDir,
      publicPath: '/images',
      publicDir,
      sizes: [
        { width: 320, label: 'sm' },
        { width: 768, label: 'md' },
        { width: 1024, label: 'lg' },
      ],
    });

    const generator = new ImageRewriter(processor);
    await processor.processImage(testImages.large.path);

    const html = generator.enhanceImages(`<img src="${testImages.large.path}" alt="Test image" loading="lazy">`);

    expect(html).toContain('<img');
    expect(html).toContain('srcset=');
    expect(html).toContain('sizes="(min-width: 1024px) 1024px, (min-width: 768px) 80vw, 100vw"');
    expect(html).toContain('alt="Test image"');
    expect(html).toContain('loading="lazy"');
  });

  test('uses next larger size for each viewport width', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir,
      outputDir,
      publicPath: '/images',
      publicDir,
      sizes: [
        { width: 320, label: 'sm' },
        { width: 768, label: 'md' },
        { width: 1024, label: 'lg' },
      ],
    });

    await processor.processImage(testImages.large.path);
    const sizes = processor.generateSizes(testImages.large.path);

    const expectedSizes = '(min-width: 1024px) 1024px, (min-width: 768px) 80vw, 100vw';

    expect(sizes).toBe(expectedSizes);
  });
});
