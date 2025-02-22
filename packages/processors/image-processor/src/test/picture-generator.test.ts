import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import { ImageProcessor } from '../image-processor';
import { PictureGenerator } from '../picture-generator';

describe('PictureGenerator', () => {
  const testDir = path.resolve(__dirname);
  const cacheDir = path.join(testDir, 'cache');
  const outputDir = path.join(testDir, 'output');
  const imageDir = path.join(testDir, 'images');
  const testImage = path.join(imageDir, 'test.png');

  // 1x1 transparent PNG (base64)
  const PNG_1PX = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
    'base64',
  );

  beforeEach(() => {
    for (const dir of [cacheDir, outputDir, imageDir]) {
      FileUtils.rmSync(dir, { recursive: true, force: true });
      FileUtils.mkdirSync(dir, { recursive: true });
    }

    FileUtils.writeFileSync(testImage, PNG_1PX);
  });

  afterAll(() => {
    for (const dir of [cacheDir, outputDir, imageDir]) {
      FileUtils.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('generatePictureHtml with multiple formats and sizes', async () => {
    const processor = new ImageProcessor({
      imageDir,
      cacheDir,
      outputDir,
      publicPath: '/images',
    });

    const generator = new PictureGenerator(processor);
    await processor.processImage(testImage);

    const html = generator.generatePictureHtml(testImage, {
      className: 'hero-image',
      alt: 'Test image',
      lazy: true,
    });

    expect(html).toContain('class="hero-image"');
    expect(html).toContain('alt="Test image"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('<picture');
    expect(html).toContain('<source');
  });

  test('generatePictureHtml with basic options', async () => {
    const processor = new ImageProcessor({
      imageDir,
      cacheDir,
      outputDir,
      publicPath: '/images',
    });

    const generator = new PictureGenerator(processor);
    await processor.processImage(testImage);

    const html = generator.generatePictureHtml(testImage, {
      className: 'hero-image',
      alt: 'Test image',
      lazy: true,
    });

    expect(html).toContain('class="hero-image"');
    expect(html).toContain('alt="Test image"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('<picture');
    expect(html).toContain('<source');
  });

  test('generatePictureHtml with custom attributes', async () => {
    const processor = new ImageProcessor({
      imageDir,
      cacheDir,
      outputDir,
      publicPath: '/images',
    });

    const generator = new PictureGenerator(processor);
    await processor.processImage(testImage);

    const html = generator.generatePictureHtml(testImage, {
      imgAttributes: {
        'data-testid': 'hero',
        fetchpriority: 'high',
      },
      pictureAttributes: {
        'data-component': 'hero-section',
      },
    });

    expect(html).toContain('data-testid="hero"');
    expect(html).toContain('fetchpriority="high"');
    expect(html).toContain('data-component="hero-section"');
  });

  test('replaceImagesWithPictures handles multiple images', async () => {
    const processor = new ImageProcessor({
      imageDir,
      cacheDir,
      outputDir,
      publicPath: '/images',
    });

    const generator = new PictureGenerator(processor);
    await processor.processImage(testImage);

    const html = `
      <div>
        <img src="${testImage}" alt="First" class="img1">
        <p>Some text</p>
        <img src="${testImage}" alt="Second" class="img2">
      </div>
    `;

    const result = generator.replaceImagesWithPictures(html);

    expect(result).toMatch(/<picture[^>]*>[\s\S]*?<\/picture>/g);
    expect(result.match(/<picture/g)?.length).toBe(2);
    expect(result).toContain('alt="First"');
    expect(result).toContain('alt="Second"');
    expect(result).toContain('class="img1"');
    expect(result).toContain('class="img2"');
  });

  test('replaceImagesWithPictures preserves non-matching images', async () => {
    const processor = new ImageProcessor({
      imageDir,
      cacheDir,
      outputDir,
      publicPath: '/images',
    });

    const generator = new PictureGenerator(processor);
    await processor.processImage(testImage);

    const html = `
      <div>
        <img src="${testImage}" alt="Processed">
        <img src="nonexistent.jpg" alt="Keep original">
      </div>
    `;

    const result = generator.replaceImagesWithPictures(html);

    expect(result).toMatch(/<picture[^>]*>[\s\S]*?<\/picture>/);
    expect(result).toContain('<img src="nonexistent.jpg" alt="Keep original">');
  });

  test('generatePictureHtml returns empty string for non-existent image', async () => {
    const processor = new ImageProcessor({
      imageDir,
      cacheDir,
      outputDir,
      publicPath: '/images',
    });

    const generator = new PictureGenerator(processor);
    const html = generator.generatePictureHtml('nonexistent.jpg');

    expect(html).toBe('');
  });
});
