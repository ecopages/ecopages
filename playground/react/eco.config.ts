import { ConfigBuilder } from '@ecopages/core';
import { ImageProcessorPlugin } from '@ecopages/image-processor';
import { reactPlugin } from '@ecopages/react';

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
  .setIntegrations([reactPlugin()])
  .addProcessor(imageProcessor)
  .setError404Template('404.tsx')
  .setIncludesTemplates({
    head: 'head.tsx',
    html: 'html.tsx',
    seo: 'seo.tsx',
  })
  .build();

export default config;
