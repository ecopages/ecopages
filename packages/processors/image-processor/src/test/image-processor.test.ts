import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import { ImageProcessor } from '../image-processor';
import { createTestImage } from './test-utils';

describe('ImageProcessor', () => {
  const testDir = path.resolve(__dirname);
  const publicDir = 'fixtures';
  const fixturesDir = path.join(testDir, publicDir);
  const cacheDir = path.join(testDir, 'cache');
  const outputDir = path.join(testDir, 'output');

  const testImages = {
    basic: {
      name: 'basic.jpg',
      width: 1024,
      height: 768,
    },
    large: {
      name: 'large.jpg',
      width: 2048,
      height: 1536,
    },
    small: {
      name: 'small.jpg',
      width: 400,
      height: 300,
    },
  };

  beforeAll(async () => {
    for (const dir of [cacheDir, outputDir, fixturesDir]) {
      FileUtils.rmSync(dir, { recursive: true, force: true });
      FileUtils.mkdirSync(dir, { recursive: true });
    }

    await Promise.all(
      Object.values(testImages).map((img) => createTestImage(path.join(fixturesDir, img.name), img.width, img.height)),
    );
  });

  beforeEach(() => {
    for (const dir of [cacheDir, outputDir]) {
      FileUtils.rmSync(dir, { recursive: true, force: true });
      FileUtils.mkdirSync(dir, { recursive: true });
    }
  });

  afterAll(() => {
    for (const dir of [cacheDir, outputDir, fixturesDir]) {
      FileUtils.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('processImage basic', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir,
      outputDir,
      quality: 80,
      publicDir,
      sizes: [{ width: 400, label: 'xl' }],
    });

    const imagePath = path.join(fixturesDir, testImages.basic.name);
    const variants = await processor.processImage(imagePath);

    expect(variants).toBeInstanceOf(Array);
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      path: path.join(outputDir, `basic-xl${ImageProcessor.OPTIMIZED_SUFFIX}webp`),
      width: 400,
      label: 'xl',
      format: 'webp',
    });
    expect(FileUtils.existsSync(variants[0].path)).toBe(true);
  });

  test('processImage with existing cache', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir,
      outputDir,
      quality: 80,
      publicDir,
      sizes: [{ width: 400, label: 'xl' }],
    });

    const imagePath = path.join(fixturesDir, testImages.basic.name);
    const variants = await processor.processImage(imagePath);
    const variants2 = await processor.processImage(imagePath);

    expect(variants2).toEqual(variants);
    expect(FileUtils.existsSync(variants[0].path)).toBe(true);
  });

  test('processImage with different format', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      quality: 80,
      format: 'jpeg',
      publicDir,
      sizes: [{ width: 400, label: 'xl' }],
    });

    const imagePath = path.join(fixturesDir, testImages.basic.name);
    const variants = await processor.processImage(imagePath);

    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      path: path.join(outputDir, `basic-xl${ImageProcessor.OPTIMIZED_SUFFIX}jpeg`),
      width: 400,
      label: 'xl',
      format: 'jpeg',
    });
  });

  test('processImage with different quality', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      quality: 50,
      publicDir,
      sizes: [{ width: 400, label: 'xl' }],
    });

    const imagePath = path.join(fixturesDir, testImages.basic.name);
    const variants = await processor.processImage(imagePath);

    expect(variants).toBeInstanceOf(Array);
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      path: path.join(outputDir, `basic-xl${ImageProcessor.OPTIMIZED_SUFFIX}webp`),
      width: 400,
      label: 'xl', // Updated to expect 'xl' as default label
      format: 'webp',
    });
    expect(FileUtils.existsSync(variants[0].path)).toBe(true);
  });

  test('processDirectory', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir,
      outputDir,
      quality: 80,
      publicDir,
      sizes: [{ width: 400, label: 'xl' }],
    });

    await processor.processDirectory();

    const processedFiles = await FileUtils.glob([`${outputDir}/**/*.{jpg,jpeg,png,webp}`]);
    expect(processedFiles.length).toBe(Object.keys(testImages).length); // One variant per test image
  });

  test('processImage with multiple sizes and viewport widths', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      publicPath: '/output',
      quality: 80,
      format: 'webp',
      publicDir,
      sizes: [
        { width: 320, label: 'sm' },
        { width: 768, label: 'md' },
        { width: 1024, label: 'lg' },
        { width: 1920, label: 'xl' },
      ],
    });

    const imagePath = path.join(fixturesDir, testImages.large.name);
    const variants = await processor.processImage(imagePath);

    expect(variants).toHaveLength(4);

    expect(variants[0]).toMatchObject({
      width: 1920,
      label: 'xl',
      format: 'webp',
    });

    expect(variants[1]).toMatchObject({
      width: 1024,
      label: 'lg',
      format: 'webp',
    });

    expect(variants[2]).toMatchObject({
      width: 768,
      label: 'md',
      format: 'webp',
    });

    expect(variants[3]).toMatchObject({
      width: 320,
      label: 'sm',
      format: 'webp',
    });

    const srcset = processor.generateSrcset(imagePath);

    expect(srcset).toBe(
      [
        `/output/large-xl${ImageProcessor.OPTIMIZED_SUFFIX}webp 1920w`,
        `/output/large-lg${ImageProcessor.OPTIMIZED_SUFFIX}webp 1024w`,
        `/output/large-md${ImageProcessor.OPTIMIZED_SUFFIX}webp 768w`,
        `/output/large-sm${ImageProcessor.OPTIMIZED_SUFFIX}webp 320w`,
      ].join(', '),
    );
  });

  test('processImage with custom public path', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      publicPath: '/assets/images',
      quality: 80,
      format: 'webp',
      publicDir,
      sizes: [
        { width: 320, label: 'sm' },
        { width: 768, label: 'md' },
      ],
    });

    const imagePath = path.join(fixturesDir, testImages.basic.name);
    const variants = await processor.processImage(imagePath);

    const srcset = processor.generateSrcset(imagePath);
    expect(srcset).toBe('/assets/images/basic-md.opt.webp 768w, /assets/images/basic-sm.opt.webp 320w');
  });

  test('generateSrcset with non-existent image', () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      publicDir,
    });

    const srcset = processor.generateSrcset('non-existent.jpg');
    expect(srcset).toBe('');
  });

  test('generateSizes with non-existent image', () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      publicDir,
    });

    const sizes = processor.generateSizes('non-existent.jpg');
    expect(sizes).toBe('');
  });

  test('respects original image dimensions', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      sizes: [
        { width: 2000, label: 'xl' }, // Should be capped at original width
        { width: 800, label: 'md' },
        { width: 400, label: 'sm' },
      ],
      quality: 80,
      format: 'webp',
      publicDir,
    });

    const imagePath = path.join(fixturesDir, testImages.basic.name);
    const variants = await processor.processImage(imagePath);

    expect(variants).toHaveLength(3);
    expect(variants[0]).toMatchObject({
      width: Math.min(2000, testImages.basic.width),
      label: 'xl',
      format: 'webp',
    });
    expect(variants[1]).toMatchObject({
      width: 800,
      label: 'md',
      format: 'webp',
    });
    expect(variants[2]).toMatchObject({
      width: 400,
      label: 'sm',
      format: 'webp',
    });

    const srcset = processor.generateSrcset(imagePath);
    expect(srcset).toBe(
      [
        `/output/basic-xl${ImageProcessor.OPTIMIZED_SUFFIX}webp 1024w`,
        `/output/basic-md${ImageProcessor.OPTIMIZED_SUFFIX}webp 800w`,
        `/output/basic-sm${ImageProcessor.OPTIMIZED_SUFFIX}webp 400w`,
      ].join(', '),
    );
  });

  test('maintains variant order by width in srcset', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      sizes: [
        { width: 400, label: 'sm' },
        { width: 1200, label: 'lg' },
        { width: 800, label: 'md' },
      ],
      quality: 80,
      format: 'webp',
      publicDir,
    });

    const imagePath = path.join(fixturesDir, testImages.basic.name);
    const variants = await processor.processImage(imagePath);

    expect(variants).toHaveLength(3);

    expect(variants.map((v) => v.width)).toEqual([1024, 800, 400]);

    const srcset = processor.generateSrcset(imagePath);
    expect(srcset).toBe(
      [
        `/output/basic-lg${ImageProcessor.OPTIMIZED_SUFFIX}webp 1024w`,
        `/output/basic-md${ImageProcessor.OPTIMIZED_SUFFIX}webp 800w`,
        `/output/basic-sm${ImageProcessor.OPTIMIZED_SUFFIX}webp 400w`,
      ].join(', '),
    );
  });

  test('prevents duplicate widths', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      sizes: [
        { width: 2000, label: '2k' }, // Will be capped at 1024
        { width: 1024, label: 'lg' }, // Will be skipped (duplicate of capped 2000)
        { width: 800, label: 'md' },
        { width: 400, label: 'sm' },
      ],
      quality: 80,
      format: 'webp',
      publicDir,
    });

    const imagePath = path.join(fixturesDir, testImages.basic.name);
    const variants = await processor.processImage(imagePath);

    expect(variants).toHaveLength(3);

    expect(variants.map((v) => v.width)).toEqual([1024, 800, 400]);
    expect(variants[0]).toMatchObject({
      width: 1024,
      label: '2k', // keeps first occurrence
    });
  });
});
