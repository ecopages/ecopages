import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import sharp from 'sharp';
import { ImageProcessor, type ImageProcessorConfig } from '../image-processor';

async function createTestImage(width: number, height: number, path: string): Promise<void> {
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#ffffff',
    },
  }).toFile(path);
}

const testDir = path.join(process.cwd(), 'test-tmp');
const testImage = path.join(testDir, 'images/test.jpg');

function createProcessor(config: Partial<ImageProcessorConfig> = {}): ImageProcessor {
  const defaultConfig: ImageProcessorConfig = {
    sourceDir: path.join(testDir, 'images'),
    outputDir: path.join(testDir, 'optimized'),
    publicPath: '/assets/optimized',
    sizes: [],
    quality: 80,
    format: 'webp',
  };

  FileUtils.ensureDirectoryExists(defaultConfig.sourceDir);
  FileUtils.ensureDirectoryExists(defaultConfig.outputDir);

  return new ImageProcessor({
    ...defaultConfig,
    ...config,
  });
}

describe('ImageProcessor', () => {
  beforeEach(async () => {
    if (FileUtils.existsSync(testDir)) {
      FileUtils.rmSync(testDir, { recursive: true });
    }
    FileUtils.ensureDirectoryExists(path.dirname(testImage));
    await createTestImage(1920, 1080, testImage);
  });

  afterAll(() => {
    if (FileUtils.existsSync(testDir)) {
      FileUtils.rmSync(testDir, { recursive: true });
    }
  });

  test('processes single image with default configuration', async () => {
    const processor = createProcessor();
    const result = await processor.processImage(testImage);

    expect(result).not.toBeNull();
    expect(result?.variants).toHaveLength(0);
    expect(result?.attributes.src).toContain('/assets/optimized');
    expect(result?.attributes.width).toBe(1920);
    expect(result?.attributes.height).toBe(1080);
  });

  test('respects image original size', async () => {
    await createTestImage(800, 600, testImage);
    const processor = createProcessor({
      sizes: [
        { width: 800, label: 'lg' },
        { width: 400, label: 'sm' },
      ],
    });
    const result = await processor.processImage(testImage);

    expect(result?.variants).toHaveLength(2);
    expect(result?.variants.map((v) => v.width)).toEqual([800, 400]);
    expect(result?.variants.map((v) => v.label)).toEqual(['lg', 'sm']);
  });

  test('processes single image with custom configuration', async () => {
    const processor = createProcessor({
      quality: 60,
      format: 'jpeg',
      sizes: [{ width: 300, label: 'custom' }],
    });

    const result = await processor.processImage(testImage);
    expect(result?.variants).toHaveLength(1);
    expect(result?.variants[0]).toMatchObject({
      width: 300,
      label: 'custom',
    });
  });

  test('maintains aspect ratio across variants', async () => {
    const processor = createProcessor({
      sizes: [
        { width: 1920, label: 'xl' },
        { width: 800, label: 'md' },
      ],
    });
    const result = await processor.processImage(testImage);

    const originalRatio = 1080 / 1920;
    for (const variant of result?.variants || []) {
      const ratio = variant.height / variant.width;
      expect(Math.abs(ratio - originalRatio)).toBeLessThan(0.01);
    }
  });

  test('processes directory of images', async () => {
    const secondImage = path.join(path.dirname(testImage), 'test2.jpg');
    await createTestImage(800, 600, secondImage);

    const processor = createProcessor();
    const imageMap = await processor.processDirectory();

    expect(Object.keys(imageMap)).toHaveLength(2);
    expect(imageMap['test.jpg']).toBeDefined();
    expect(imageMap['test2.jpg']).toBeDefined();
  });

  test('handles empty sizes configuration', async () => {
    const processor = createProcessor({ sizes: [] });
    const result = await processor.processImage(testImage);

    expect(result?.variants).toHaveLength(0);
    expect(result?.attributes.width).toBe(1920);
  });

  test('handles invalid image gracefully', async () => {
    const invalidImage = path.join(testDir, 'invalid.jpg');
    FileUtils.write(invalidImage, 'invalid content');

    const processor = createProcessor();
    const result = await processor.processImage(invalidImage);

    expect(result).toBeNull();
  });
});
