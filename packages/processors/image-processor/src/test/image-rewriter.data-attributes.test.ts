import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import { ImageProcessor } from '../image-processor';
import { ImageRewriter } from '../image-rewriter';
import { createTestImage } from './test-utils';

describe('Data Attributes', () => {
  const testDir = path.resolve(__dirname);
  const cacheDir = path.join(testDir, 'cache');
  const outputDir = path.join(testDir, 'output');
  const imageDir = path.join(testDir, 'images');
  const testImage = path.join(imageDir, 'test.png');

  let processor: ImageProcessor;
  let generator: ImageRewriter;

  beforeEach(async () => {
    // Setup test directories
    for (const dir of [cacheDir, outputDir, imageDir]) {
      FileUtils.mkdirSync(dir, { recursive: true });
    }

    // Create test image
    await createTestImage(testImage, 2048, 1536);

    processor = new ImageProcessor({
      imageDir,
      cacheDir,
      outputDir,
      publicPath: '/images',
      sizes: [
        { width: 320, label: 'sm' },
        { width: 768, label: 'md' },
        { width: 1024, label: 'lg' },
        { width: 1920, label: 'xl' },
      ],
    });

    generator = new ImageRewriter(processor);
    await processor.processImage(testImage);
  });

  afterAll(() => {
    for (const dir of [cacheDir, outputDir, imageDir]) {
      FileUtils.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('handles data-fixed-size attribute', () => {
    const html = `<img src="${testImage}" data-fixed-size="md" alt="Fixed size test">`;
    const result = generator.enhanceImages(html);

    expect(result).toContain('src="/images/test-md.opt.webp"');
    expect(result).not.toContain('srcset=');
    expect(result).not.toContain('data-fixed-size');
    expect(result).toContain('alt="Fixed size test"');
  });

  test('handles data-custom-srcset attribute', () => {
    const html = `<img src="${testImage}" data-custom-srcset="(max-width: 320px) 320px, (max-width: 768px) 768px" alt="Custom srcset">`;
    const result = generator.enhanceImages(html);

    expect(result).toContain('srcset="(max-width: 320px) 320px, (max-width: 768px) 768px"');
    expect(result).not.toContain('data-custom-srcset');
    expect(result).toContain('alt="Custom srcset"');
  });

  test('falls back to default behavior when no data attributes present', () => {
    const html = `<img src="${testImage}" alt="Default behavior">`;
    const result = generator.enhanceImages(html);

    expect(result).toContain('srcset=');
    expect(result).toContain('sizes=');
    expect(result).toContain('alt="Default behavior"');
  });
});
