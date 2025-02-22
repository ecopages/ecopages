import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import { ImageProcessor } from '../image-processor';

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
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      maxWidth: 400,
      quality: 80,
      publicDir,
    });

    await processor.processDirectory();

    const images = await FileUtils.glob([`${outputDir}/**/*.{jpg,jpeg,png,webp}`]);

    expect(images.length).toBe(3);
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
        { width: 1920, suffix: '-xl' },
      ],
    });

    const imagePath = path.join(fixturesDir, image_1024x768);
    const variants = await processor.processImage(imagePath);

    // Should have 3 variants because:
    // - 1920px (-xl) is capped at 1024px and has no viewport width
    // - 1024px (-lg) is kept because it has viewport width
    // - 768px (-md) is kept
    // - 320px (-sm) is kept
    expect(variants).toHaveLength(3);
    expect(variants).toEqual([
      expect.objectContaining({
        width: 1024,
        suffix: '-lg', // Keep the variant with viewport width
        maxViewportWidth: 1440,
        format: 'webp',
        path: path.join(outputDir, `image_1024x768-lg${ImageProcessor.OPTIMIZED_SUFFIX}webp`),
      }),
      expect.objectContaining({
        width: 768,
        suffix: '-md',
        maxViewportWidth: 1024,
        format: 'webp',
        path: path.join(outputDir, `image_1024x768-md${ImageProcessor.OPTIMIZED_SUFFIX}webp`),
      }),
      expect.objectContaining({
        width: 320,
        suffix: '-sm',
        maxViewportWidth: 640,
        format: 'webp',
        path: path.join(outputDir, `image_1024x768-sm${ImageProcessor.OPTIMIZED_SUFFIX}webp`),
      }),
    ]);

    const srcset = processor.generateSrcset(imagePath);
    expect(srcset).toBe(
      [
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
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      sizes: [
        { width: 2000, suffix: '-xl' }, // Larger than original
        { width: 800, suffix: '-md' }, // Smaller than original
        { width: 400, suffix: '-sm' }, // Smallest
      ],
      quality: 80,
      format: 'webp',
      publicDir,
    });

    const imagePath = path.join(fixturesDir, image_1024x768);
    const variants = await processor.processImage(imagePath);

    // Verify variants are correctly sized and sorted
    expect(variants).toHaveLength(3);
    expect(variants[0]).toMatchObject({ width: 1024, suffix: '-xl' }); // Capped at original
    expect(variants[1]).toMatchObject({ width: 800, suffix: '-md' });
    expect(variants[2]).toMatchObject({ width: 400, suffix: '-sm' });

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
        { width: 1200, suffix: '-lg' }, // Will be capped at 1024
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
    expect(variants.map((v) => v.width)).toEqual([1024, 800, 400]);

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
