import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import { DEFAULT_CONFIG } from 'src/constants';
import type { ImageVariant } from 'src/image-processor';
import {
  PUBLIC_PATH,
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
      displayPath: path.join(PUBLIC_PATH, 'basic-xl.webp'),
      originalPath: path.join(context.outputDir, 'basic-xl.webp'),
      width: 400,
      height: 300,
      label: 'xl',
      format: 'webp',
    });
    expect(FileUtils.existsSync(variants[0].originalPath)).toBe(true);
  });

  test('processImage with existing cache', async () => {
    const processor = createTestProcessor(context, {
      quality: 80,
      sizes: [{ width: 400, label: 'xl' }],
    });

    const variants = await processor.processImage(context.testImages.basic.path);
    const variants2 = await processor.processImage(context.testImages.basic.path);

    expect(variants2).toEqual(variants);
    expect(FileUtils.existsSync(variants[0].originalPath)).toBe(true);
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
      displayPath: path.join(PUBLIC_PATH, 'basic-xl.jpeg'),
      originalPath: path.join(context.outputDir, 'basic-xl.jpeg'),
      width: 400,
      height: 300,
      label: 'xl',
      format: 'jpeg',
    } as ImageVariant);
  });

  test('processDirectory', async () => {
    const processor = createTestProcessor(context, {
      quality: 80,
      sizes: [{ width: 400, label: 'xl' }],
    });

    await processor.processDirectory();

    const processedFiles = await FileUtils.glob([`${context.outputDir}/**/*.{jpg,jpeg,png,webp}`]);
    expect(processedFiles.length).toBe(Object.keys(context.testImages).length);
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

    await processor.processDirectory();

    const imageMap = processor.getImageMap();

    const entry = imageMap[context.testImages.large.path.split('/test').pop() as string];

    expect(entry.variants).toHaveLength(4);

    expect(entry.variants[0]).toMatchObject({
      width: 1920,
      label: 'xl',
      format: 'webp',
    });

    expect(entry.variants[1]).toMatchObject({
      width: 1024,
      label: 'lg',
      format: 'webp',
    });

    expect(entry.variants[2]).toMatchObject({
      width: 768,
      label: 'md',
      format: 'webp',
    });

    expect(entry.variants[3]).toMatchObject({
      width: 320,
      label: 'sm',
      format: 'webp',
    });

    expect(entry.srcset).toBe(
      [
        '/output/large-xl.webp 1920w',
        '/output/large-lg.webp 1024w',
        '/output/large-md.webp 768w',
        '/output/large-sm.webp 320w',
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

    await processor.processDirectory();

    const imageMap = processor.getImageMap();

    const entry = imageMap[context.testImages.basic.path.split('/test').pop() as string];

    expect(entry.srcset).toBe('/assets/images/basic-md.webp 768w, /assets/images/basic-sm.webp 320w');
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
        { width: 2000, label: 'xl' },
        { width: 800, label: 'md' },
        { width: 400, label: 'sm' },
      ],
      quality: 80,
      format: 'webp',
    });

    await processor.processDirectory();

    const imageMap = processor.getImageMap();

    const entry = imageMap[context.testImages.basic.path.split('/test').pop() as string];

    expect(entry.variants[0]).toMatchObject({
      width: Math.min(2000, context.testImages.basic.width),
      label: 'xl',
      format: 'webp',
    });
    expect(entry.variants[1]).toMatchObject({
      width: 800,
      label: 'md',
      format: 'webp',
    });
    expect(entry.variants[2]).toMatchObject({
      width: 400,
      label: 'sm',
      format: 'webp',
    });

    expect(entry.srcset).toBe(
      ['/output/basic-xl.webp 1024w', '/output/basic-md.webp 800w', '/output/basic-sm.webp 400w'].join(', '),
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

    await processor.processDirectory();

    const imageMap = processor.getImageMap();

    const entry = imageMap[context.testImages.basic.path.split('/test').pop() as string];

    expect(entry.variants).toHaveLength(3);

    expect(entry.variants.map((v) => v.width)).toEqual([1024, 800, 400]);

    expect(entry.srcset).toBe(
      ['/output/basic-lg.webp 1024w', '/output/basic-md.webp 800w', '/output/basic-sm.webp 400w'].join(', '),
    );
  });

  test('prevents duplicate widths', async () => {
    const processor = createTestProcessor(context, {
      sizes: [
        { width: 2000, label: '2k' },
        { width: 1024, label: 'lg' },
        { width: 800, label: 'md' },
        { width: 400, label: 'sm' },
      ],
      quality: 80,
      format: 'webp',
    });

    await processor.processDirectory();

    const imageMap = processor.getImageMap();

    const entry = imageMap[context.testImages.basic.path.split('/test').pop() as string];

    expect(entry.variants).toHaveLength(3);

    expect(entry.variants.map((v) => v.width)).toEqual([1024, 800, 400]);
    expect(entry.variants[0]).toMatchObject({
      width: 1024,
      label: '2k',
    });
  });

  test('handles invalid image file', async () => {
    const processor = createTestProcessor(context);
    const invalidPath = path.join(context.imagesDir, 'invalid.jpg');

    FileUtils.writeFileSync(invalidPath, 'not an image');

    expect(processor.processImage(invalidPath)).rejects.toThrow();
  });

  test('processes image with default sizes if not specified', async () => {
    const processor = createTestProcessor(context, {
      quality: 80,
      format: 'webp',
    });

    const variants = await processor.processImage(context.testImages.large.path);

    expect(variants).toHaveLength(3);
    expect(variants[0].width).toBe(DEFAULT_CONFIG.sizes[0].width);
    expect(variants[1].width).toBe(DEFAULT_CONFIG.sizes[1].width);
    expect(variants[2].width).toBe(DEFAULT_CONFIG.sizes[2].width);
  });

  test('processes image in AVIF format', async () => {
    const processor = createTestProcessor(context, {
      quality: 80,
      format: 'avif',
      sizes: [{ width: 400, label: 'sm' }],
    });

    const variants = await processor.processImage(context.testImages.basic.path);

    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      format: 'avif',
      displayPath: expect.stringContaining('avif'),
    });
  });

  test('preserves aspect ratio when resizing', async () => {
    const processor = createTestProcessor(context, {
      quality: 80,
      sizes: [{ width: 200, label: 'tiny' }],
    });

    const variants = await processor.processImage(context.testImages.basic.path);
    const originalAspectRatio = context.testImages.basic.height / context.testImages.basic.width;
    const variantAspectRatio = variants[0].height / variants[0].width;

    expect(Math.abs(originalAspectRatio - variantAspectRatio)).toBeLessThan(0.01);
  });
});
