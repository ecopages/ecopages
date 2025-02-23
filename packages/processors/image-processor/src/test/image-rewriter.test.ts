import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import { ImageProcessor } from '../image-processor';
import { ImageRewriter } from '../image-rewriter';
import { createTestImage } from './test-utils';

describe('ImageRewriter', () => {
  const testDir = path.resolve(__dirname);
  const cacheDir = path.join(testDir, 'cache');
  const outputDir = path.join(testDir, 'output');
  const imageDir = path.join(testDir, 'images');
  const testImage = path.join(imageDir, 'test.jpg');

  beforeAll(async () => {
    for (const dir of [cacheDir, outputDir, imageDir]) {
      FileUtils.mkdirSync(dir, { recursive: true });
    }

    await createTestImage(testImage, 1024, 768);
  });

  afterAll(() => {
    for (const dir of [cacheDir, outputDir, imageDir]) {
      FileUtils.rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('.enhanceImages', () => {
    let processor: ImageProcessor;
    let generator: ImageRewriter;

    beforeEach(async () => {
      processor = new ImageProcessor({
        imageDir,
        cacheDir,
        outputDir,
        publicPath: '/images',
      });
      generator = new ImageRewriter(processor);
      await processor.processImage(testImage);
    });

    test('preserves all original attributes when replacing', async () => {
      const html = `<img src="${testImage}" alt="Alt text" class="test-class" loading="lazy" data-custom="value">`;

      const result = generator.enhanceImages(html);

      expect(result).toContain('class="test-class"');
      expect(result).toContain('alt="Alt text"');
      expect(result).toContain('loading="lazy"');
      expect(result).toContain('data-custom="value"');
      expect(result).toContain('srcset=');
      expect(result).toContain('sizes=');
    });

    test('handles multiple images with different attributes', async () => {
      const html = `
        <div>
          <img src="${testImage}" alt="First" class="img1" data-index="1">
          <img src="${testImage}" alt="Second" class="img2" data-index="2">
        </div>
      `;

      const result = generator.enhanceImages(html);

      expect(result).toContain('data-index="1"');
      expect(result).toContain('data-index="2"');
      expect(result).toContain('class="img1"');
      expect(result).toContain('class="img2"');
    });

    test('handles images without optional attributes', async () => {
      const html = `<img src="${testImage}">`;

      const result = generator.enhanceImages(html);

      expect(result).toContain('srcset=');
      expect(result).toContain('sizes=');
      expect(result).not.toContain('<picture');
    });

    test('skips malformed img tags', async () => {
      const html = `
        <img src="${testImage}" alt="Valid">
        <img src= alt="Invalid">
        <img alt="No src">
      `;

      const result = generator.enhanceImages(html);

      expect(result).toContain('alt="Valid"');
      expect(result).toContain('<img src= alt="Invalid">');
      expect(result).toContain('<img alt="No src">');
    });
  });

  describe('.enhanceImages', () => {
    let processor: ImageProcessor;
    let generator: ImageRewriter;

    beforeEach(async () => {
      processor = new ImageProcessor({
        imageDir,
        cacheDir,
        outputDir,
        publicPath: '/images',
      });
      generator = new ImageRewriter(processor);
      await processor.processImage(testImage);
    });

    test('preserves data attributes', async () => {
      const html = `<img src="${testImage}" data-test="value" data-other="123">`;
      const result = generator.enhanceImages(html);

      expect(result).toContain('data-test="value"');
      expect(result).toContain('data-other="123"');
    });

    test('handles complex HTML correctly', async () => {
      const html = `
        <div>
          <img src="${testImage}" class="first">
          <p>Text between images</p>
          <!-- Comment -->
          <img src="${testImage}" class="second">
        </div>
      `;
      const result = generator.enhanceImages(html);

      expect(result).toContain('class="first"');
      expect(result).toContain('class="second"');
      expect(result).toContain('<p>Text between images</p>');
      expect(result).toContain('<!-- Comment -->');
    });

    test('preserves whitespace and newlines', async () => {
      const html = `
        <img
          src="${testImage}"
          alt="Multi
          line"
          class="spaced"
        >
      `;
      const result = generator.enhanceImages(html);

      expect(result).toContain('alt="Multi\n          line"');
      expect(result).toContain('class="spaced"');
    });

    test('handles no images gracefully', async () => {
      const html = '<div>No images here</div>';
      const result = generator.enhanceImages(html);

      expect(result).toBe(html);
    });

    test('handles malformed img tags', async () => {
      const html = `
        <img>
        <img src="">
        <img src="${testImage}" >
        <img src="${testImage}">
      `;
      const result = generator.enhanceImages(html);

      expect(result).toContain('<img>');
      expect(result).toContain('<img src="">');
      expect(result).toContain('srcset=');
    });

    test('handles multiple images with identical sources', async () => {
      const html = `
        <img src="${testImage}" class="first">
        <img src="${testImage}" class="second">
      `;
      const result = generator.enhanceImages(html);

      expect(result.match(/<img[^>]+srcset=/g)?.length).toBe(2);
      expect(result).toContain('class="first"');
      expect(result).toContain('class="second"');
    });
  });

  test('enhanceImages with multiple formats and sizes', async () => {
    const processor = new ImageProcessor({
      imageDir,
      cacheDir,
      outputDir,
      publicPath: '/images',
    });

    const generator = new ImageRewriter(processor);
    await processor.processImage(testImage);

    const html = generator.enhanceImages(`<img src="${testImage}" alt="Test image" class="hero-image">`);

    expect(html).toContain('class="hero-image"');
    expect(html).toContain('alt="Test image"');
    expect(html).toContain('srcset=');
    expect(html).toContain('sizes=');
  });

  test('enhanceImages with basic options', async () => {
    const processor = new ImageProcessor({
      imageDir,
      cacheDir,
      outputDir,
      publicPath: '/images',
    });

    const generator = new ImageRewriter(processor);
    await processor.processImage(testImage);

    const html = generator.enhanceImages(`<img src="${testImage}" alt="Test image" class="hero-image">`);

    expect(html).toContain('class="hero-image"');
    expect(html).toContain('alt="Test image"');
    expect(html).toContain('srcset=');
    expect(html).toContain('sizes=');
  });

  test('.enhanceImages handles multiple images', async () => {
    const processor = new ImageProcessor({
      imageDir,
      cacheDir,
      outputDir,
      publicPath: '/images',
    });

    const generator = new ImageRewriter(processor);
    await processor.processImage(testImage);

    const html = `
      <div>
        <img src="${testImage}" alt="First" class="img1">
        <p>Some text</p>
        <img src="${testImage}" alt="Second" class="img2">
      </div>
    `;

    const result = generator.enhanceImages(html);

    expect(result).toMatch(/<img[^>]+srcset=/g);
    expect(result.match(/<img[^>]+srcset=/g)?.length).toBe(2);
    expect(result).toContain('alt="First"');
    expect(result).toContain('alt="Second"');
    expect(result).toContain('class="img1"');
    expect(result).toContain('class="img2"');
  });

  test('.enhanceImages preserves non-matching images', async () => {
    const processor = new ImageProcessor({
      imageDir,
      cacheDir,
      outputDir,
      publicPath: '/images',
    });

    const generator = new ImageRewriter(processor);
    await processor.processImage(testImage);

    const html = `
      <div>
        <img src="${testImage}" alt="Processed">
        <img src="nonexistent.jpg" alt="Keep original">
      </div>
    `;

    const result = generator.enhanceImages(html);

    expect(result).toMatch(/<img[^>]+srcset=/);
    expect(result).toContain('<img src="nonexistent.jpg" alt="Keep original">');
  });
});
