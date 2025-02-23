import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { ImageProcessor } from '../image-processor';
import { ImageRewriter } from '../image-rewriter';
import {
  cleanUpBeforeTest,
  cleanupTestContext,
  createTestContext,
  createTestImage,
  createTestProcessor,
  setupTestContext,
} from './test-utils';

describe('ImageRewriter', () => {
  const context = createTestContext(path.resolve(__dirname), 'rewriter');
  let processor: ImageProcessor;
  let generator: ImageRewriter;

  beforeAll(async () => {
    setupTestContext(context);
    await createTestImage(context.testImage, 1024, 768);

    processor = createTestProcessor(context, {
      imageDir: path.dirname(context.testImage), // Use the directory containing the test image
    });

    generator = new ImageRewriter(processor);
    await processor.processImage(context.testImage);
  });

  beforeEach(async () => {
    cleanUpBeforeTest(context);
    await processor.processImage(context.testImage);
  });

  afterAll(() => {
    cleanupTestContext(context);
  });

  describe('.enhanceImages', () => {
    test('preserves all original attributes when replacing', async () => {
      const html = `<img src="${context.testImage}" alt="Alt text" class="test-class" loading="lazy" data-custom="value">`;

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
          <img src="${context.testImage}" alt="First" class="img1" data-index="1">
          <img src="${context.testImage}" alt="Second" class="img2" data-index="2">
        </div>
      `;

      const result = generator.enhanceImages(html);

      expect(result).toContain('data-index="1"');
      expect(result).toContain('data-index="2"');
      expect(result).toContain('class="img1"');
      expect(result).toContain('class="img2"');
    });

    test('handles images without optional attributes', async () => {
      const html = `<img src="${context.testImage}">`;

      const result = generator.enhanceImages(html);

      expect(result).toContain('srcset=');
      expect(result).toContain('sizes=');
      expect(result).not.toContain('<picture');
    });

    test('skips malformed img tags', async () => {
      const html = `
        <img src="${context.testImage}" alt="Valid">
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
    test('preserves data attributes', async () => {
      const html = `<img src="${context.testImage}" data-test="value" data-other="123">`;
      const result = generator.enhanceImages(html);

      expect(result).toContain('data-test="value"');
      expect(result).toContain('data-other="123"');
    });

    test('handles complex HTML correctly', async () => {
      const html = `
        <div>
          <img src="${context.testImage}" class="first">
          <p>Text between images</p>
          <!-- Comment -->
          <img src="${context.testImage}" class="second">
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
          src="${context.testImage}"
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
        <img src="${context.testImage}" >
        <img src="${context.testImage}">
      `;
      const result = generator.enhanceImages(html);

      expect(result).toContain('<img>');
      expect(result).toContain('<img src="">');
      expect(result).toContain('srcset=');
    });

    test('handles multiple images with identical sources', async () => {
      const html = `
        <img src="${context.testImage}" class="first">
        <img src="${context.testImage}" class="second">
      `;
      const result = generator.enhanceImages(html);

      expect(result.match(/<img[^>]+srcset=/g)?.length).toBe(2);
      expect(result).toContain('class="first"');
      expect(result).toContain('class="second"');
    });
  });

  test('enhanceImages with multiple formats and sizes', async () => {
    const processor = new ImageProcessor({
      imageDir: context.imageDir,
      cacheDir: context.cacheDir,
      outputDir: context.outputDir,
      publicPath: '/images',
    });

    const generator = new ImageRewriter(processor);
    await processor.processImage(context.testImage);

    const html = generator.enhanceImages(`<img src="${context.testImage}" alt="Test image" class="hero-image">`);

    expect(html).toContain('class="hero-image"');
    expect(html).toContain('alt="Test image"');
    expect(html).toContain('srcset=');
    expect(html).toContain('sizes=');
  });

  test('enhanceImages with basic options', async () => {
    const processor = new ImageProcessor({
      imageDir: context.imageDir,
      cacheDir: context.cacheDir,
      outputDir: context.outputDir,
      publicPath: '/images',
    });

    const generator = new ImageRewriter(processor);
    await processor.processImage(context.testImage);

    const html = generator.enhanceImages(`<img src="${context.testImage}" alt="Test image" class="hero-image">`);

    expect(html).toContain('class="hero-image"');
    expect(html).toContain('alt="Test image"');
    expect(html).toContain('srcset=');
    expect(html).toContain('sizes=');
  });

  test('.enhanceImages handles multiple images', async () => {
    const processor = new ImageProcessor({
      imageDir: context.imageDir,
      cacheDir: context.cacheDir,
      outputDir: context.outputDir,
      publicPath: '/images',
    });

    const generator = new ImageRewriter(processor);
    await processor.processImage(context.testImage);

    const html = `
      <div>
        <img src="${context.testImage}" alt="First" class="img1">
        <p>Some text</p>
        <img src="${context.testImage}" alt="Second" class="img2">
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
      imageDir: context.imageDir,
      cacheDir: context.cacheDir,
      outputDir: context.outputDir,
      publicPath: '/images',
    });

    const generator = new ImageRewriter(processor);
    await processor.processImage(context.testImage);

    const html = `
      <div>
        <img src="${context.testImage}" alt="Processed">
        <img src="nonexistent.jpg" alt="Keep original">
      </div>
    `;

    const result = generator.enhanceImages(html);

    expect(result).toMatch(/<img[^>]+srcset=/);
    expect(result).toContain('<img src="nonexistent.jpg" alt="Keep original">');
  });
});
