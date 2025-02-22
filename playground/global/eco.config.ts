import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';
import { mdxPlugin } from '@ecopages/mdx';

const config = await new ConfigBuilder()
  .setRootDir(import.meta.dir)
  .setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
  .setIntegrations([kitajsPlugin(), litPlugin(), mdxPlugin()])
  .setImageOptimization({
    imageDir: path.resolve(import.meta.dir, 'src/public/assets/images'),
    cacheDir: path.resolve(import.meta.dir, '__cache__'),
    outputDir: path.resolve(import.meta.dir, 'src/public/assets/opt-images'),
    publicPath: '/public/assets/opt-images',
    quality: 80,
    format: 'webp',
    sizes: [
      { width: 320, suffix: '-sm' },
      { width: 768, suffix: '-md' },
      { width: 1024, suffix: '-lg' },
      { width: 1920, suffix: '-xl' },
    ],
  })
  .setError404Template('404.kita.tsx')
  .build();

export default config;
