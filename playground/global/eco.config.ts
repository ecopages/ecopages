import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core';
import { ImageProcessor } from '@ecopages/image-processor';
import { ImageRendererProvider } from '@ecopages/image-processor/image-renderer-provider';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';
import { mdxPlugin } from '@ecopages/mdx';

const imageProcessor = new ImageProcessor({
  imagesDir: path.resolve(import.meta.dir, 'src/public/assets/images'),
  cacheDir: path.resolve(import.meta.dir, '__cache__'),
  outputDir: path.resolve(import.meta.dir, 'src/public/assets/opt-images'),
  publicPath: '/public/assets/opt-images',
  publicDir: 'public',
  quality: 80,
  format: 'webp',
  sizes: [
    { width: 320, label: 'sm' },
    { width: 768, label: 'md' },
    { width: 1024, label: 'lg' },
    { width: 1920, label: 'xl' },
  ],
});

export const imageRenderer = ImageRendererProvider.createRenderer({
  type: 'server',
  imageMap: imageProcessor.getImageMap(),
});

const config = await new ConfigBuilder()
  .setRootDir(import.meta.dir)
  .setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
  .setIntegrations([kitajsPlugin(), litPlugin(), mdxPlugin()])
  .setImageOptimization({
    enabled: true,
    processor: imageProcessor,
  })
  .setError404Template('404.kita.tsx')
  .build();

export default config;
