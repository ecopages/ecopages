import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import { ImageProcessor } from '../image-processor';
import { createTestImage } from './test-utils';

const image_1024x768 = 'image_1024x768.jpg';

describe('ImageProcessor', () => {
  const publicDir = 'fixtures';
  const testDir = path.resolve(__dirname);
  const fixturesDir = path.join(testDir, publicDir);
  const cacheDir = path.join(testDir, 'cache');
  const outputDir = path.join(testDir, 'output');

  beforeEach(() => {
    FileUtils.rmSync(cacheDir, { recursive: true, force: true });
    FileUtils.rmSync(outputDir, { recursive: true, force: true });
    FileUtils.mkdirSync(cacheDir, { recursive: true });
    FileUtils.mkdirSync(outputDir, { recursive: true });
  });

  afterAll(() => {
    FileUtils.rmSync(cacheDir, { recursive: true, force: true });
    FileUtils.rmSync(outputDir, { recursive: true, force: true });
  });

  test('processImage basic', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      maxWidth: 400,
      quality: 80,
      publicDir,
    });

    const imagePath = path.join(fixturesDir, image_1024x768);
    const variants = await processor.processImage(imagePath);

    expect(variants).toBeInstanceOf(Array);
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      path: path.join(outputDir, `image_1024x768${ImageProcessor.OPTIMIZED_SUFFIX}webp`),
      width: 400,
      suffix: '',
    });
    expect(FileUtils.existsSync(variants[0].path)).toBe(true);
  });

  test('processImage with existing cache', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      maxWidth: 400,
      quality: 80,
      publicDir,
    });

    const imagePath = path.join(fixturesDir, image_1024x768);
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
      maxWidth: 400,
      quality: 80,
      format: 'jpeg',
      publicDir,
    });

    const imagePath = path.join(fixturesDir, image_1024x768);
    const variants = await processor.processImage(imagePath);

    expect(variants[0]).toMatchObject({
      path: path.join(outputDir, `image_1024x768${ImageProcessor.OPTIMIZED_SUFFIX}jpeg`),
      width: 400,
      suffix: '',
    });
  });

  test('processImage with different quality', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      maxWidth: 400,
      quality: 50,
      publicDir,
    });

    const imagePath = path.join(fixturesDir, image_1024x768);
    const variants = await processor.processImage(imagePath);

    expect(variants).toBeInstanceOf(Array);
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      path: path.join(outputDir, `image_1024x768${ImageProcessor.OPTIMIZED_SUFFIX}webp`),
      width: 400,
      suffix: '',
    });
    expect(FileUtils.existsSync(variants[0].path)).toBe(true);
  });

  test('processImage with different maxWidth', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      maxWidth: 200,
      quality: 80,
      publicDir,
    });

    const imagePath = path.join(fixturesDir, image_1024x768);
    const variants = await processor.processImage(imagePath);

    expect(variants).toBeInstanceOf(Array);
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      path: path.join(outputDir, `image_1024x768${ImageProcessor.OPTIMIZED_SUFFIX}webp`),
      width: 200,
      suffix: '',
    });
    expect(FileUtils.existsSync(variants[0].path)).toBe(true);
  });

  test('processDirectory', async () => {
    await createTestImage(path.join(fixturesDir, 'test1.jpg'), 800, 600);
    await createTestImage(path.join(fixturesDir, 'test2.jpg'), 800, 600);
    await createTestImage(path.join(fixturesDir, 'test3.jpg'), 800, 600);

    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir,
      outputDir,
      maxWidth: 400,
      quality: 80,
      publicDir,
    });

    await processor.processDirectory();

    const processedFiles = await FileUtils.glob([`${outputDir}/**/*.{jpg,jpeg,png,webp}`]);
    expect(processedFiles.length).toBe(7);
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
        { width: 320, suffix: '-sm', maxViewportWidth: 640 },
        { width: 768, suffix: '-md', maxViewportWidth: 1024 },
        { width: 1024, suffix: '-lg', maxViewportWidth: 1440 },
        { width: 1920, suffix: '-xl' }, // Will be capped at 1024
      ],
    });

    const imagePath = path.join(fixturesDir, image_1024x768);
    const variants = await processor.processImage(imagePath);

    // Should have 4 variants with specific widths and viewport constraints
    expect(variants).toHaveLength(4);

    // Test each variant individually to make matching more flexible
    expect(variants[0]).toMatchObject({
      width: 1920,
      suffix: '-xl',
      format: 'webp',
    });

    expect(variants[1]).toMatchObject({
      width: 1024,
      suffix: '-lg',
      format: 'webp',
    });

    expect(variants[2]).toMatchObject({
      width: 768,
      suffix: '-md',
      format: 'webp',
    });

    expect(variants[3]).toMatchObject({
      width: 320,
      suffix: '-sm',
      format: 'webp',
    });

    // Verify srcset contains all variants with correct paths
    const srcset = processor.generateSrcset(imagePath);
    expect(srcset).toBe(
      [
        `/output/image_1024x768-xl${ImageProcessor.OPTIMIZED_SUFFIX}webp 1920w`,
        `/output/image_1024x768-lg${ImageProcessor.OPTIMIZED_SUFFIX}webp 1024w`,
        `/output/image_1024x768-md${ImageProcessor.OPTIMIZED_SUFFIX}webp 768w`,
        `/output/image_1024x768-sm${ImageProcessor.OPTIMIZED_SUFFIX}webp 320w`,
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
        { width: 320, suffix: '-sm' },
        { width: 768, suffix: '-md' },
      ],
    });

    const imagePath = path.join(fixturesDir, image_1024x768);
    const variants = await processor.processImage(imagePath);

    const srcset = processor.generateSrcset(imagePath);
    expect(srcset).toBe(
      '/assets/images/image_1024x768-md.opt.webp 768w, /assets/images/image_1024x768-sm.opt.webp 320w',
    );
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
    // Create a test image with known dimensions
    await createTestImage(path.join(fixturesDir, image_1024x768), 1024, 768);

    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      sizes: [
        { width: 2000, suffix: '-xl' }, // Should be capped at 1024
        { width: 800, suffix: '-md' },
        { width: 400, suffix: '-sm' },
      ],
      quality: 80,
      format: 'webp',
      publicDir,
    });

    const imagePath = path.join(fixturesDir, image_1024x768);
    const variants = await processor.processImage(imagePath);

    // Verify variants are correctly sized and sorted
    expect(variants).toHaveLength(3);
    expect(variants[0]).toMatchObject({
      width: 1024,
      suffix: '-xl',
      format: 'webp',
    });
    expect(variants[1]).toMatchObject({
      width: 800,
      suffix: '-md',
      format: 'webp',
    });
    expect(variants[2]).toMatchObject({
      width: 400,
      suffix: '-sm',
      format: 'webp',
    });

    const srcset = processor.generateSrcset(imagePath);
    expect(srcset).toBe(
      [
        `/output/image_1024x768-xl${ImageProcessor.OPTIMIZED_SUFFIX}webp 1024w`,
        `/output/image_1024x768-md${ImageProcessor.OPTIMIZED_SUFFIX}webp 800w`,
        `/output/image_1024x768-sm${ImageProcessor.OPTIMIZED_SUFFIX}webp 400w`,
      ].join(', '),
    );
  });

  test('maintains variant order by width in srcset', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      sizes: [
        { width: 400, suffix: '-sm' },
        { width: 1200, suffix: '-lg' }, // Will be capped at original width (1024)
        { width: 800, suffix: '-md' },
      ],
      quality: 80,
      format: 'webp',
      publicDir,
    });

    const imagePath = path.join(fixturesDir, image_1024x768);
    const variants = await processor.processImage(imagePath);

    // Verify variants are sorted by width descending
    expect(variants).toHaveLength(3);
    expect(variants.map((v) => v.width)).toEqual([1024, 800, 400]); // 1200 capped at 1024

    const srcset = processor.generateSrcset(imagePath);
    expect(srcset).toBe(
      [
        `/output/image_1024x768-lg${ImageProcessor.OPTIMIZED_SUFFIX}webp 1024w`,
        `/output/image_1024x768-md${ImageProcessor.OPTIMIZED_SUFFIX}webp 800w`,
        `/output/image_1024x768-sm${ImageProcessor.OPTIMIZED_SUFFIX}webp 400w`,
      ].join(', '),
    );
  });

  test('prevents duplicate widths', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      sizes: [
        { width: 2000, suffix: '-2k' }, // Will be capped at 1024
        { width: 1024, suffix: '-lg' }, // Will be skipped (duplicate of capped 2000)
        { width: 800, suffix: '-md' },
        { width: 400, suffix: '-sm' },
      ],
      quality: 80,
      format: 'webp',
      publicDir,
    });

    const imagePath = path.join(fixturesDir, image_1024x768);
    const variants = await processor.processImage(imagePath);

    // Should only have 3 variants, skipping the duplicate 1024 width
    expect(variants).toHaveLength(3);
    expect(variants.map((v) => v.width)).toEqual([1024, 800, 400]);
    expect(variants[0]).toMatchObject({
      width: 1024,
      suffix: '-2k', // keeps first occurrence
    });
  });
});
