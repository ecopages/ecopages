import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import { ImageProcessor } from 'src/image-processor';
import {
  cleanUpBeforeTest,
  cleanupTestContext,
  createTestContext,
  createTestProcessor,
  setupTestContext,
} from './test-utils';

describe('ImageProcessor', () => {
  const context = createTestContext(path.resolve(__dirname));

  beforeAll(async () => {
    await setupTestContext(context);
  });

  beforeEach(() => {
    cleanUpBeforeTest(context);
  });

  afterAll(() => {
    cleanupTestContext(context);
  });

  test('processImage basic', async () => {
    const processor = createTestProcessor(context, {
      quality: 80,
      sizes: [{ width: 400, label: 'xl' }],
    });

    const variants = await processor.processImage(context.testImages.basic.path);

    expect(variants).toBeInstanceOf(Array);
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      path: path.join(context.outputDir, `basic-xl${ImageProcessor.OPTIMIZED_SUFFIX}webp`),
      width: 400,
      label: 'xl',
      format: 'webp',
    });
    expect(FileUtils.existsSync(variants[0].path)).toBe(true);
  });

  test('processImage with existing cache', async () => {
    const processor = createTestProcessor(context, {
      quality: 80,
      sizes: [{ width: 400, label: 'xl' }],
    });

    const variants = await processor.processImage(context.testImages.basic.path);
    const variants2 = await processor.processImage(context.testImages.basic.path);

    expect(variants2).toEqual(variants);
    expect(FileUtils.existsSync(variants[0].path)).toBe(true);
  });

  test('processImage with different format', async () => {
    const processor = createTestProcessor(context, {
      quality: 80,
      format: 'jpeg',
      sizes: [{ width: 400, label: 'xl' }],
    });

    const variants = await processor.processImage(context.testImages.basic.path);

    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      path: path.join(context.outputDir, `basic-xl${ImageProcessor.OPTIMIZED_SUFFIX}jpeg`),
      width: 400,
      label: 'xl',
      format: 'jpeg',
    });
  });

  test('processImage with different quality', async () => {
    const processor = createTestProcessor(context, {
      quality: 50,
      sizes: [{ width: 400, label: 'xl' }],
    });

    const variants = await processor.processImage(context.testImages.basic.path);

    expect(variants).toBeInstanceOf(Array);
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      path: path.join(context.outputDir, `basic-xl${ImageProcessor.OPTIMIZED_SUFFIX}webp`),
      width: 400,
      label: 'xl', // Updated to expect 'xl' as default label
      format: 'webp',
    });
    expect(FileUtils.existsSync(variants[0].path)).toBe(true);
  });

  test('processDirectory', async () => {
    const processor = createTestProcessor(context, {
      quality: 80,
      sizes: [{ width: 400, label: 'xl' }],
    });

    await processor.processDirectory();

    const processedFiles = await FileUtils.glob([`${context.outputDir}/**/*.{jpg,jpeg,png,webp}`]);
    expect(processedFiles.length).toBe(Object.keys(context.testImages).length); // One variant per test image
  });

  test('processImage with multiple sizes and viewport widths', async () => {
    const processor = createTestProcessor(context, {
      publicPath: '/output',
      quality: 80,
      format: 'webp',
      sizes: [
        { width: 320, label: 'sm' },
        { width: 768, label: 'md' },
        { width: 1024, label: 'lg' },
        { width: 1920, label: 'xl' },
      ],
    });

    const variants = await processor.processImage(context.testImages.large.path);

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

    const srcset = processor.generateSrcset(context.testImages.large.path);

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
    const processor = createTestProcessor(context, {
      publicPath: '/assets/images',
      quality: 80,
      format: 'webp',
      sizes: [
        { width: 320, label: 'sm' },
        { width: 768, label: 'md' },
      ],
    });

    const variants = await processor.processImage(context.testImages.basic.path);

    const srcset = processor.generateSrcset(context.testImages.basic.path);
    expect(srcset).toBe('/assets/images/basic-md.opt.webp 768w, /assets/images/basic-sm.opt.webp 320w');
  });

  test('generateSrcset with non-existent image', () => {
    const processor = createTestProcessor(context);

    const srcset = processor.generateSrcset('non-existent.jpg');
    expect(srcset).toBe('');
  });

  test('generateSizes with non-existent image', () => {
    const processor = createTestProcessor(context);

    const sizes = processor.generateSizes('non-existent.jpg');
    expect(sizes).toBe('');
  });

  test('respects original image dimensions', async () => {
    const processor = createTestProcessor(context, {
      sizes: [
        { width: 2000, label: 'xl' }, // Should be capped at original width
        { width: 800, label: 'md' },
        { width: 400, label: 'sm' },
      ],
      quality: 80,
      format: 'webp',
    });

    const variants = await processor.processImage(context.testImages.basic.path);

    expect(variants).toHaveLength(3);
    expect(variants[0]).toMatchObject({
      width: Math.min(2000, context.testImages.basic.width),
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

    const srcset = processor.generateSrcset(context.testImages.basic.path);
    expect(srcset).toBe(
      [
        `/output/basic-xl${ImageProcessor.OPTIMIZED_SUFFIX}webp 1024w`,
        `/output/basic-md${ImageProcessor.OPTIMIZED_SUFFIX}webp 800w`,
        `/output/basic-sm${ImageProcessor.OPTIMIZED_SUFFIX}webp 400w`,
      ].join(', '),
    );
  });

  test('maintains variant order by width in srcset', async () => {
    const processor = createTestProcessor(context, {
      sizes: [
        { width: 400, label: 'sm' },
        { width: 1200, label: 'lg' },
        { width: 800, label: 'md' },
      ],
      quality: 80,
      format: 'webp',
    });

    const variants = await processor.processImage(context.testImages.basic.path);

    expect(variants).toHaveLength(3);

    expect(variants.map((v) => v.width)).toEqual([1024, 800, 400]);

    const srcset = processor.generateSrcset(context.testImages.basic.path);
    expect(srcset).toBe(
      [
        `/output/basic-lg${ImageProcessor.OPTIMIZED_SUFFIX}webp 1024w`,
        `/output/basic-md${ImageProcessor.OPTIMIZED_SUFFIX}webp 800w`,
        `/output/basic-sm${ImageProcessor.OPTIMIZED_SUFFIX}webp 400w`,
      ].join(', '),
    );
  });

  test('prevents duplicate widths', async () => {
    const processor = createTestProcessor(context, {
      sizes: [
        { width: 2000, label: '2k' }, // Will be capped at 1024
        { width: 1024, label: 'lg' }, // Will be skipped (duplicate of capped 2000)
        { width: 800, label: 'md' },
        { width: 400, label: 'sm' },
      ],
      quality: 80,
      format: 'webp',
    });

    const variants = await processor.processImage(context.testImages.basic.path);

    expect(variants).toHaveLength(3);

    expect(variants.map((v) => v.width)).toEqual([1024, 800, 400]);
    expect(variants[0]).toMatchObject({
      width: 1024,
      label: '2k', // keeps first occurrence
    });
  });
});
