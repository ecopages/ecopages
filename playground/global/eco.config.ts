import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core';
import { ImageProcessorPlugin } from '@ecopages/image-processor';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';
import { mdxPlugin } from '@ecopages/mdx';

const imageProcessor = new ImageProcessorPlugin({
  options: {
    watch: true,
    autoOptimize: true,
    quality: 80,
    format: 'webp',
    sizes: [
      { width: 320, label: 'sm' },
      { width: 768, label: 'md' },
      { width: 1024, label: 'lg' },
      { width: 1920, label: 'xl' },
    ],
  },
});

const config = await new ConfigBuilder()
  .setRootDir(import.meta.dir)
  .setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
  .setIntegrations([kitajsPlugin(), litPlugin(), mdxPlugin()])
  .addProcessor(imageProcessor)
  .setError404Template('404.kita.tsx')
  .build();

export default config;
