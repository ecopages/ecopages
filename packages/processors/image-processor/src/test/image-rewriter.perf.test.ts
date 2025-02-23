import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import type { ImageProcessor } from '../image-processor';
import { ImageRewriter } from '../image-rewriter';
import {
  cleanUpBeforeTest,
  cleanupTestContext,
  createTestContext,
  createTestImage,
  createTestProcessor,
  setupTestContext,
} from './test-utils';

describe('ImageRewriter Performance', () => {
  const context = createTestContext(path.resolve(__dirname), 'performance');
  let processor: ImageProcessor;
  let generator: ImageRewriter;

  // Update HTML templates to use the correct path
  const simpleHtml = `<img src="${context.testImage}" alt="Test">`;
  const complexHtml = `
    <div class="article">
      <h1>Test Article</h1>
      <img src="${context.testImage}" alt="Hero" class="hero" loading="lazy">
      <p>Some text</p>
      <div class="gallery">
        ${Array(50)
          .fill(0)
          .map(
            (_, i) =>
              `<img src="${context.testImage}" alt="Gallery ${i}" class="thumb" data-index="${i}" loading="lazy">`,
          )
          .join('\n')}
      </div>
    </div>
  `;

  const largeHtml = Array(100).fill(complexHtml).join('\n');

  beforeAll(async () => {
    // First, create all required directories
    for (const dir of [context.cacheDir, context.outputDir, context.imageDir]) {
      FileUtils.rmSync(dir, { recursive: true, force: true });
      FileUtils.mkdirSync(dir, { recursive: true });
    }

    // Create the test image before initializing the processor
    await createTestImage(context.testImage, 1024, 768);

    // Now initialize processor and process the image
    processor = createTestProcessor(context);
    generator = new ImageRewriter(processor);
    await processor.processImage(context.testImage);
  });

  beforeEach(() => {
    cleanUpBeforeTest(context);
  });

  afterAll(() => {
    cleanupTestContext(context);
  });

  const measure = async (fn: () => Promise<void> | void, iterations = 100) => {
    const times: number[] = [];

    // Warm up
    for (let i = 0; i < 5; i++) await fn();

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      times.push(performance.now() - start);
    }

    const avg = times.reduce((a, b) => a + b) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    return { avg, min, max };
  };

  test('performance with simple HTML', async () => {
    const { avg, min, max } = await measure(() => {
      const result = generator.enhanceImages(simpleHtml);
      expect(result).toContain('srcset=');
      expect(result).not.toContain('<picture');
    });

    console.log('\nSimple HTML (single image):');
    console.log(`Avg: ${avg.toFixed(3)}ms`);
    console.log(`Min: ${min.toFixed(3)}ms`);
    console.log(`Max: ${max.toFixed(3)}ms`);

    expect(avg).toBeLessThan(1); // Should be very fast for simple cases
  });

  test('performance with complex HTML', async () => {
    const { avg, min, max } = await measure(() => {
      generator.enhanceImages(complexHtml);
    });

    console.log('\nComplex HTML (50 images with attributes):');
    console.log(`Avg: ${avg.toFixed(3)}ms`);
    console.log(`Min: ${min.toFixed(3)}ms`);
    console.log(`Max: ${max.toFixed(3)}ms`);

    expect(avg).toBeLessThan(10); // Should handle complex cases efficiently
  });

  test('performance with large HTML', async () => {
    const { avg, min, max } = await measure(() => {
      generator.enhanceImages(largeHtml);
    }, 10); // Fewer iterations for large HTML

    console.log('\nLarge HTML (5000 images):');
    console.log(`Avg: ${avg.toFixed(3)}ms`);
    console.log(`Min: ${min.toFixed(3)}ms`);
    console.log(`Max: ${max.toFixed(3)}ms`);

    const imagesPerSecond = 5000 / (avg / 1000);
    console.log(`Images processed per second: ${Math.round(imagesPerSecond)}`);

    expect(avg).toBeLessThan(100); // Should process large documents in reasonable time
  });
});
