import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import { ImageProcessor, ImageVariant } from '../image-processor';

describe('ImageProcessor', () => {
  const testDir = path.resolve(__dirname);
  const fixturesDir = path.join(testDir, 'fixtures');
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
    });

    const imagePath = path.join(fixturesDir, 'image.png');
    const variants = await processor.processImage(imagePath);

    expect(variants).toBeInstanceOf(Array);
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      path: path.join(outputDir, `image${ImageProcessor.OPTIMIZED_SUFFIX}webp`),
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
    });

    const imagePath = path.join(fixturesDir, 'image.png');
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
    });

    const imagePath = path.join(fixturesDir, 'image.png');
    const variants = await processor.processImage(imagePath);

    expect(variants[0]).toMatchObject({
      path: path.join(outputDir, `image${ImageProcessor.OPTIMIZED_SUFFIX}jpeg`),
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
    });

    const imagePath = path.join(fixturesDir, 'image.png');
    const variants = await processor.processImage(imagePath);

    expect(variants).toBeInstanceOf(Array);
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      path: path.join(outputDir, `image${ImageProcessor.OPTIMIZED_SUFFIX}webp`),
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
    });

    const imagePath = path.join(fixturesDir, 'image.png');
    const variants = await processor.processImage(imagePath);

    expect(variants).toBeInstanceOf(Array);
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      path: path.join(outputDir, `image${ImageProcessor.OPTIMIZED_SUFFIX}webp`),
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
    });

    await processor.processDirectory();

    const images = await FileUtils.glob([`${outputDir}/**/*.{jpg,jpeg,png,webp}`]);

    expect(images.length).toBe(2);
  });

  test('processImage with multiple sizes and viewport widths', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      publicPath: '/output',
      quality: 80,
      format: 'webp',
      sizes: [
        { width: 320, suffix: '-sm', maxViewportWidth: 640 },
        { width: 768, suffix: '-md', maxViewportWidth: 1024 },
        { width: 1024, suffix: '-lg', maxViewportWidth: 1440 },
        { width: 1920, suffix: '-xl' },
      ],
    });

    const imagePath = path.join(fixturesDir, 'image.png');
    const variants = await processor.processImage(imagePath);

    expect(variants).toHaveLength(4);
    expect(variants[0]).toMatchObject({
      path: path.join(outputDir, `image-sm${ImageProcessor.OPTIMIZED_SUFFIX}webp`),
      width: 320,
      suffix: '-sm',
      maxViewportWidth: 640,
    });

    const srcset = processor.generateSrcset(imagePath);
    expect(srcset).toBe(
      [
        `/output/image-sm${ImageProcessor.OPTIMIZED_SUFFIX}webp 320w`,
        `/output/image-md${ImageProcessor.OPTIMIZED_SUFFIX}webp 768w`,
        `/output/image-lg${ImageProcessor.OPTIMIZED_SUFFIX}webp 1024w`,
        `/output/image-xl${ImageProcessor.OPTIMIZED_SUFFIX}webp 1920w`,
      ].join(', '),
    );

    const sizes = processor.generateSizes(imagePath);
    expect(sizes).toBe(
      ['(max-width: 1440px) 1024px', '(max-width: 1024px) 768px', '(max-width: 640px) 320px', '1920px'].join(', '),
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
      sizes: [
        { width: 320, suffix: '-sm' },
        { width: 768, suffix: '-md' },
      ],
    });

    const imagePath = path.join(fixturesDir, 'image.png');
    const variants = await processor.processImage(imagePath);

    const srcset = processor.generateSrcset(imagePath);
    expect(srcset).toBe(
      [
        `/assets/images/image-sm${ImageProcessor.OPTIMIZED_SUFFIX}webp 320w`,
        `/assets/images/image-md${ImageProcessor.OPTIMIZED_SUFFIX}webp 768w`,
      ].join(', '),
    );
  });

  test('generateSrcset with non-existent image', () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
    });

    const srcset = processor.generateSrcset('non-existent.jpg');
    expect(srcset).toBe('');
  });

  test('generateSizes with non-existent image', () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
    });

    const sizes = processor.generateSizes('non-existent.jpg');
    expect(sizes).toBe('');
  });
});
