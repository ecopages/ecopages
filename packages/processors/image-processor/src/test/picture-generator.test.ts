import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import { ImageProcessor } from '../image-processor';
import { PictureGenerator } from '../picture-generator';

describe('PictureGenerator', () => {
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

  test('generatePictureHtml with multiple formats and sizes', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      publicPath: '/assets/images',
      quality: 80,
      format: 'webp',
      sizes: [
        { width: 320, suffix: '-sm', maxViewportWidth: 640 },
        { width: 768, suffix: '-md', maxViewportWidth: 1024 },
      ],
    });

    const generator = new PictureGenerator(processor);
    const imagePath = path.join(fixturesDir, 'image.png');
    await processor.processImage(imagePath);

    const pictureHtml = generator.generatePictureHtml(imagePath, {
      className: 'hero-image',
      alt: 'A test image',
      lazy: true,
      imgAttributes: {
        'data-test': 'test',
      },
    });

    expect(pictureHtml).toContain('class="hero-image"');
    expect(pictureHtml).toContain('alt="A test image"');
    expect(pictureHtml).toContain('loading="lazy"');
    expect(pictureHtml).toContain('data-test="test"');
  });

  test('replaceImagesWithPictures', async () => {
    const processor = new ImageProcessor({
      imageDir: fixturesDir,
      cacheDir: cacheDir,
      outputDir: outputDir,
      publicPath: '/assets/images',
    });

    const generator = new PictureGenerator(processor);
    const imagePath = path.join(fixturesDir, 'image.png');
    await processor.processImage(imagePath);

    const html = `
      <div>
        <img src="${imagePath}" alt="Original alt" class="original-class">
        <img src="nonexistent.jpg" alt="Keep me">
      </div>
    `;

    const result = generator.replaceImagesWithPictures(html);

    expect(result).toContain('<picture');
    expect(result).toContain('alt="Original alt"');
    expect(result).toContain('class="original-class"');
    expect(result).toContain('Keep me');
  });
});
