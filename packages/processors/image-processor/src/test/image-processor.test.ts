import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import sharp from 'sharp';
import { ImageProcessor, type ImageProcessorConfig } from 'src/server/image-processor';
import { DEFAULT_CONFIG } from 'src/shared/constants';

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

const testImage = path.join(testDir, 'src/public/assets/images/test.jpg');

function createProcessor(config: Partial<ImageProcessorConfig> = {}): ImageProcessor {
  const paths: ImageProcessorConfig['paths'] = {
    sourceImages: path.join(testDir, 'src/public/assets/images'),
    targetImages: path.join(testDir, 'src/public/assets/optimized'),
    sourceUrlPrefix: '/public/assets',
    optimizedUrlPrefix: '/public/assets/optimized',
  };

  for (const dir of Object.values(paths)) {
    if (!dir.startsWith('/')) {
      FileUtils.ensureDirectoryExists(dir);
    }
  }

  return new ImageProcessor({
    importMeta: import.meta,
    paths,
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
    for (const dir of [...Object.values(DEFAULT_CONFIG.paths), testDir]) {
      if (FileUtils.existsSync(dir)) {
        FileUtils.rmSync(dir, { recursive: true });
      }
    }
  });

  test('uses default configuration', async () => {
    const processor = createProcessor();
    const variants = await processor.processImage(testImage);

    expect(variants).toHaveLength(1);
    expect(variants.map((v) => v.width)).toEqual([1920]);
    expect(variants[0].format).toBe('webp');
    expect(variants.map((v) => v.label)).toEqual(['original']);
  });

  test('respects image original size', async () => {
    await createTestImage(800, 600, testImage);
    const processor = createProcessor({
      sizes: [
        { width: 800, label: 'lg' },
        { width: 400, label: 'sm' },
      ],
    });
    const variants = await processor.processImage(testImage);

    expect(variants.map((v) => v.width)).toEqual([800, 400]);
    expect(variants.map((v) => v.label)).toEqual(['lg', 'sm']);
  });

  test('processes single image with custom configuration', async () => {
    const processor = createProcessor({
      quality: 60,
      format: 'jpeg',
      sizes: [{ width: 300, label: 'custom' }],
    });

    const variants = await processor.processImage(testImage);
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      width: 300,
      format: 'jpeg',
      label: 'custom',
    });
  });

  test('maintains aspect ratio across variants', async () => {
    const processor = createProcessor();
    const variants = await processor.processImage(testImage);

    const originalRatio = 1080 / 1920;
    for (const variant of variants) {
      const ratio = variant.height / variant.width;
      expect(Math.abs(ratio - originalRatio)).toBeLessThan(0.01);
    }
  });

  test('generates correct srcset and sizes', async () => {
    const processor = createProcessor({
      sizes: [
        { width: 1920, label: 'xl' },
        { width: 1200, label: 'lg' },
        { width: 400, label: 'sm' },
      ],
    });
    await processor.processImage(testImage);

    const srcset = processor.getSrcset('/public/assets/test.jpg');
    const sizes = processor.getSizes('/public/assets/test.jpg');

    expect(srcset).toMatch(/\/public\/assets\/optimized\/test-xl\.webp 1920w/);
    expect(srcset).toMatch(/\/public\/assets\/optimized\/test-lg\.webp 1200w/);
    expect(srcset).toMatch(/\/public\/assets\/optimized\/test-sm\.webp 400w/);
    expect(sizes).toMatch(/\(min-width: 1920px\) 1920px/);
  });

  test('caches processed images', async () => {
    const processor = createProcessor({
      sizes: [
        { width: 1920, label: 'xl' },
        { width: 800, label: 'md' },
        { width: 400, label: 'sm' },
      ],
    });
    await processor.processImage(testImage);

    const hash = FileUtils.getFileHash(testImage);
    const imageMap = processor.getImageMap();
    const entry = Object.values(imageMap)[0];

    expect(entry.hash).toBe(hash);
    expect(entry.variants).toHaveLength(3);
  });

  test('processes directory of images', async () => {
    const secondImage = path.join(path.dirname(testImage), 'test2.jpg');
    await createTestImage(800, 600, secondImage);

    const processor = createProcessor();
    await processor.processDirectory();

    const imageMap = processor.getImageMap();
    expect(Object.keys(imageMap)).toHaveLength(2);
  });

  test('resolves paths correctly', () => {
    const processor = createProcessor();
    const paths = processor.getResolvedPath();

    expect(paths.sourceImages).toMatch(/test-tmp\/src\/public\/assets\/images$/);
    expect(paths.targetImages).toMatch(/test-tmp\/src\/public\/assets\/optimized$/);
    expect(paths.sourceUrlPrefix).toBe('/public/assets');
    expect(paths.optimizedUrlPrefix).toBe('/public/assets/optimized');
  });

  test('handles empty sizes configuration', async () => {
    const processor = createProcessor({ sizes: [] });
    const variants = await processor.processImage(testImage);

    expect(variants).toHaveLength(1);
    expect(variants[0].width).toBe(1920);
    expect(variants[0].label).toBe('original');
  });

  test('deduplicates identical widths', async () => {
    const processor = createProcessor({
      sizes: [
        { width: 800, label: 'a' },
        { width: 800, label: 'b' },
        { width: 400, label: 'c' },
      ],
    });

    const variants = await processor.processImage(testImage);
    expect(variants).toHaveLength(2);
    expect(variants.map((v) => v.width)).toEqual([800, 400]);
  });
});
