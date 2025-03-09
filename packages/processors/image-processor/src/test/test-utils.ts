import path from 'node:path';
import { FileUtils } from '@ecopages/core';
import sharp, { type Sharp } from 'sharp';
import { ImageProcessor, type ImageProcessorConfig } from '../image-processor';

export interface TestImage {
  name: string;
  width: number;
  height: number;
  path: string;
}

export interface TestContext {
  testDir: string;
  publicDir: string;
  fixturesDir: string;
  cacheDir: string;
  outputDir: string;
  imagesDir: string;
  testImages: Record<'small' | 'basic' | 'large', TestImage>;
  testImage: string;
}

export async function createTestImage(path: string, width: number, height: number, color = '#ffffff'): Promise<Sharp> {
  const image = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: color,
    },
  });
  await image.toFile(path);
  return image;
}

export function createTestContext(testDir: string): TestContext {
  const publicDir = 'fixtures-temp';
  const fixturesDir = path.join(testDir, publicDir);
  const cacheDir = path.join(testDir, 'cache');
  const outputDir = path.join(testDir, 'output');
  const imageDir = path.join(testDir, 'images');

  const testImages: Record<'small' | 'basic' | 'large', TestImage> = {
    basic: {
      name: 'basic.jpg',
      width: 1024,
      height: 768,
      path: '',
    },
    large: {
      name: 'large.jpg',
      width: 2048,
      height: 1536,
      path: '',
    },
    small: {
      name: 'small.jpg',
      width: 400,
      height: 300,
      path: '',
    },
  };

  for (const img of Object.values(testImages)) {
    img.path = path.join(fixturesDir, img.name);
  }

  const context: TestContext = {
    testDir,
    publicDir,
    fixturesDir,
    cacheDir,
    outputDir,
    imagesDir: imageDir,
    testImages,
    testImage: path.join(imageDir, 'test.jpg'),
  };

  return context;
}

export async function setupTestContext(context: TestContext): Promise<void> {
  for (const dir of [context.cacheDir, context.outputDir, context.fixturesDir, context.imagesDir]) {
    FileUtils.mkdirSync(dir, { recursive: true });
  }

  await Promise.all(Object.values(context.testImages).map((img) => createTestImage(img.path, img.width, img.height)));

  await createTestImage(context.testImage, 800, 600);
}

export function cleanupTestContext(context: TestContext): void {
  for (const dir of [context.cacheDir, context.outputDir, context.fixturesDir, context.imagesDir]) {
    FileUtils.rmSync(dir, { recursive: true, force: true });
  }
}

export function cleanUpBeforeTest(context: TestContext): void {
  for (const dir of [context.cacheDir, context.outputDir]) {
    FileUtils.rmSync(dir, { recursive: true, force: true });
    FileUtils.mkdirSync(dir, { recursive: true });
  }
}

export const PUBLIC_PATH = '/output';

export function createTestProcessor(context: TestContext, config: Partial<ImageProcessorConfig> = {}): ImageProcessor {
  return new ImageProcessor({
    imagesDir: context.fixturesDir,
    cacheDir: context.cacheDir,
    outputDir: context.outputDir,
    publicDir: context.publicDir,
    publicPath: PUBLIC_PATH,
    ...config,
  });
}
