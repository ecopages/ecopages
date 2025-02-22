import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import { ImageProcessor } from '../image-processor';
import { PictureGenerator } from '../picture-generator';
import { createTestImage } from './test-utils';

describe('Responsive Images', () => {
  const imgName = 'image_1024x768.jpg';
  const testDir = path.resolve(__dirname);
  const publicDir = 'fixtures';
  const cacheDir = path.join(testDir, 'cache');
  const outputDir = path.join(testDir, 'output');
  const fixturesDir = path.join(testDir, publicDir);
  const testImage = path.join(fixturesDir, imgName);

  beforeAll(async () => {
    // Create test directories
    for (const dir of [cacheDir, outputDir, fixturesDir]) {
      FileUtils.mkdirSync(dir, { recursive: true });
    }

    // Create a larger test image to accommodate all test sizes
    await createTestImage(testImage, 2048, 1536);
  });

  // Cleanup after tests
  afterAll(() => {
    for (const dir of [cacheDir, outputDir]) {
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
        { width: 320, suffix: '-sm', maxViewportWidth: 640 },
        { width: 768, suffix: '-md', maxViewportWidth: 1024 },
        { width: 1024, suffix: '-lg', maxViewportWidth: 1440 },
      ],
    });

    const generator = new PictureGenerator(processor);
    await processor.processImage(testImage);

    const normalizedPath = `/${publicDir}/image_1024x768.jpg`;
    const html = generator.replaceImagesWithPictures(`<img src="${normalizedPath}" alt="Test">`);

    expect(html).toContain('(max-width: 640px) 768px, 1024px');
  });

  test('preserves order of sizes from smallest to largest', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir,
      outputDir,
      publicPath: '/images',
      publicDir,
      sizes: [
        { width: 1024, suffix: '-lg' },
        { width: 320, suffix: '-sm' },
        { width: 768, suffix: '-md' },
      ],
    });

    await processor.processImage(testImage);
    const srcset = processor.generateSrcset(testImage);
    const widths = srcset.match(/\d+w/g)?.map((w) => Number.parseInt(w));

    expect(widths).toBeDefined();
    expect(widths).toEqual([1024, 768, 320].sort((a, b) => b - a));
  });

  test('handles viewport-specific sizes correctly', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir,
      outputDir,
      publicPath: '/images',
      publicDir,
      sizes: [
        { width: 320, suffix: '-sm', maxViewportWidth: 640 },
        { width: 768, suffix: '-md', maxViewportWidth: 1024 },
        { width: 1024, suffix: '-lg' },
      ],
    });

    await processor.processImage(testImage);
    const sizes = processor.generateSizes(testImage);

    const expectedSizes = ['(max-width: 640px) 768px', '1024px'].join(', ');

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
        { width: 320, suffix: '-sm', maxViewportWidth: 640 },
        { width: 768, suffix: '-md', maxViewportWidth: 1024 },
        { width: 1024, suffix: '-lg' },
      ],
    });

    const generator = new PictureGenerator(processor);
    await processor.processImage(testImage);

    const html = generator.generatePictureHtml(`/${imgName}`, {
      alt: 'Test image',
      lazy: true,
    });

    expect(html).toContain('<picture>');
    expect(html).toContain('<source');
    expect(html).toContain('<img');

    expect(html).toContain('srcset=');
    expect(html).toContain('sizes="(max-width: 640px) 768px, 1024px"');
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
        { width: 320, suffix: '-sm', maxViewportWidth: 640 },
        { width: 768, suffix: '-md', maxViewportWidth: 1024 },
        { width: 1024, suffix: '-lg' },
      ],
    });

    await processor.processImage(testImage);
    const sizes = processor.generateSizes(testImage);

    const expectedSizes = ['(max-width: 640px) 768px', '1024px'].join(', ');

    expect(sizes).toBe(expectedSizes);
  });
});
