import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { Logger } from '@ecopages/logger';
import { ImageHTMLRewriter } from '../image-html-rewriter';
import { ImageProcessor } from '../image-processor';
import { ImageRewriter } from '../image-rewriter';
import { cleanupTestContext, createTestContext, createTestImage, setupTestContext } from './test-utils';

const perfLogger = new Logger('➜');

describe('Image Rewriters Performance Comparison', () => {
  const context = createTestContext(path.resolve(__dirname), 'performance');
  let regexProcessor: ImageProcessor;
  let domProcessor: ImageProcessor;
  let imageRewriter: ImageRewriter;
  let htmlRewriter: ImageHTMLRewriter;
  let mainTestImage: string;

  const testImages = [
    { name: 'avatar-sm.jpg', width: 48, height: 48 },
    { name: 'thumb-sm.jpg', width: 150, height: 100 },
    { name: 'content-md.jpg', width: 800, height: 600 },
    { name: 'banner-md.jpg', width: 1200, height: 400 },
    { name: 'hero-lg.jpg', width: 2048, height: 1024 },
    { name: 'gallery-lg.jpg', width: 1920, height: 1080 },
    { name: 'portrait.jpg', width: 768, height: 1024 },
    { name: 'panorama.jpg', width: 2048, height: 512 },
    { name: 'square.jpg', width: 1000, height: 1000 },
  ];

  beforeAll(async () => {
    await setupTestContext(context);
    mainTestImage = path.join(context.imageDir, 'main-test.jpg');

    await createTestImage(mainTestImage, 1024, 768);

    await Promise.all(
      testImages.map((img) =>
        createTestImage(
          path.join(context.imageDir, img.name),
          img.width,
          img.height,
          `#${Math.floor(Math.random() * 16777215)
            .toString(16)
            .padStart(6, '0')}`,
        ),
      ),
    );

    regexProcessor = new ImageProcessor({
      imagesDir: context.imageDir,
      publicPath: '/images',
      cacheDir: path.join(context.cacheDir, 'regex'),
      outputDir: path.join(context.outputDir, 'regex'),
    });

    domProcessor = new ImageProcessor({
      imagesDir: context.imageDir,
      publicPath: '/images',
      cacheDir: path.join(context.cacheDir, 'dom'),
      outputDir: path.join(context.outputDir, 'dom'),
    });

    imageRewriter = new ImageRewriter(regexProcessor);
    htmlRewriter = new ImageHTMLRewriter(domProcessor);

    await Promise.all([regexProcessor.processDirectory(), domProcessor.processDirectory()]);
  });

  beforeEach(() => {
    imageRewriter.clearCaches();
    htmlRewriter.clearCache();
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

    return {
      avg: times.reduce((a, b) => a + b) / times.length,
      min: Math.min(...times),
      max: Math.max(...times),
      p95: times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)],
    };
  };

  const compareImplementations = async (html: string, name: string, iterations: number, validateOutput = true) => {
    console.log(`\n🧪 ${name}\n`);

    const regexResults = await measure(async () => {
      const result = imageRewriter.enhanceImages(html);
      if (validateOutput) {
        expect(result).toContain('srcset=');
        expect(result).toContain('sizes=');
      }
    }, iterations);

    const domResults = await measure(async () => {
      const result = htmlRewriter.enhanceImages(html);
      if (validateOutput) {
        expect(result).toContain('srcset=');
        expect(result).toContain('sizes=');
      }
    }, iterations);

    perfLogger.info('Regex-based implementation:');
    console.log(`  Avg: ${regexResults.avg.toFixed(3)}ms`);
    console.log(`  Min: ${regexResults.min.toFixed(3)}ms`);
    console.log(`  Max: ${regexResults.max.toFixed(3)}ms`);
    console.log(`  P95: ${regexResults.p95.toFixed(3)}ms`);

    perfLogger.info('HtmlRewriter-based implementation:');
    console.log(`  Avg: ${domResults.avg.toFixed(3)}ms`);
    console.log(`  Min: ${domResults.min.toFixed(3)}ms`);
    console.log(`  Max: ${domResults.max.toFixed(3)}ms`);
    console.log(`  P95: ${domResults.p95.toFixed(3)}ms\n`);

    const diff = (Math.abs(domResults.avg - regexResults.avg) / Math.max(domResults.avg, regexResults.avg)) * 100;
    const faster = regexResults.avg < domResults.avg ? 'Regex' : 'DOM';
    perfLogger.warn(`${faster} implementation is ${diff.toFixed(1)}% faster`);

    return { regexResults, domResults };
  };

  const generateRealisticHtml = (imagesCount: number) => {
    const sections = ['header', 'main', 'gallery', 'products', 'blog', 'footer'];
    return sections
      .map(
        (section) => `
        <section class="${section}">
          <h2>${section.charAt(0).toUpperCase() + section.slice(1)}</h2>
          ${Array(Math.ceil(imagesCount / sections.length))
            .fill(0)
            .map(() => {
              const img = testImages[Math.floor(Math.random() * testImages.length)];
              const loading = Math.random() > 0.5 ? ' loading="lazy"' : '';
              const className = `${section}-image`;
              const imgPath = path.join(context.imageDir, img.name);
              return `<img src="${imgPath}" alt="${img.name}" class="${className}"${loading}>`;
            })
            .join('\n')}
        </section>
      `,
      )
      .join('\n');
  };

  test('simple HTML performance comparison', async () => {
    const simpleHtml = `<img src="${mainTestImage}" alt="Test">`;
    const { regexResults, domResults } = await compareImplementations(simpleHtml, 'Simple HTML (single image)', 1000);
    expect(regexResults.avg).toBeLessThan(1);
    expect(domResults.avg).toBeLessThan(2);
  });

  test('complex HTML performance comparison', async () => {
    const complexHtml = `
      <div class="article">
        <h1>Test Article</h1>
        <img src="${mainTestImage}" alt="Hero" class="hero" loading="lazy">
        <p>Some text</p>
        <div class="gallery">
          ${Array(50)
            .fill(0)
            .map(
              (_, i) =>
                `<img src="${mainTestImage}" alt="Gallery ${i}" class="thumb" data-index="${i}" loading="lazy">`,
            )
            .join('\n')}
        </div>
      </div>
    `;
    const { regexResults, domResults } = await compareImplementations(
      complexHtml,
      'Complex HTML (50 images with attributes)',
      100,
    );
    expect(regexResults.avg).toBeLessThan(10);
    expect(domResults.avg).toBeLessThan(20);
  });

  test('large HTML performance comparison', async () => {
    const largeHtml = Array(100)
      .fill(0)
      .map(() => `<img src="${mainTestImage}" alt="Test">`)
      .join('\n');

    const { regexResults, domResults } = await compareImplementations(largeHtml, 'Large HTML (5000 images)', 10, false);

    const regexImagesPerSecond = 5000 / (regexResults.avg / 1000);
    const domImagesPerSecond = 5000 / (domResults.avg / 1000);

    perfLogger.info('\nImages processed per second:');
    console.log(`  Regex: ${Math.round(regexImagesPerSecond)}`);
    console.log(`  DOM: ${Math.round(domImagesPerSecond)}`);

    const maxExpectedTime = 200; // ms
    expect(regexResults.avg).toBeLessThan(maxExpectedTime);
    expect(domResults.avg).toBeLessThan(maxExpectedTime);
  });

  test('realistic small page', async () => {
    const html = generateRealisticHtml(10);
    const { regexResults, domResults } = await compareImplementations(html, 'Realistic page (10 images)', 100);
    expect(Math.max(regexResults.avg, domResults.avg)).toBeLessThan(5);
  });

  test('realistic medium page', async () => {
    const html = generateRealisticHtml(50);
    const { regexResults, domResults } = await compareImplementations(html, 'Realistic page (50 images)', 50);
    expect(Math.max(regexResults.avg, domResults.avg)).toBeLessThan(20);
  });

  test('realistic large page', async () => {
    const html = generateRealisticHtml(200);
    const { regexResults, domResults } = await compareImplementations(html, 'Realistic page (200 images)', 20);
    expect(Math.max(regexResults.avg, domResults.avg)).toBeLessThan(50);
  });
});
