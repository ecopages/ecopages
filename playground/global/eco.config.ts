import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core';
import { ImageProcessor } from '@ecopages/image-processor';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';
import { mdxPlugin } from '@ecopages/mdx';

const imageProcessor = new ImageProcessor({
  importMeta: import.meta,
  quality: 80,
  format: 'webp',
  sizes: [
    { width: 320, label: 'sm' },
    { width: 768, label: 'md' },
    { width: 1024, label: 'lg' },
    { width: 1920, label: 'xl' },
  ],
  paths: {
    sourceImages: 'src/public/assets/images',
    targetImages: 'src/public/assets/optimized',
    sourceUrlPrefix: '/public/assets/images',
    optimizedUrlPrefix: '/public/assets/optimized',
    cache: '__cache__',
  },
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
