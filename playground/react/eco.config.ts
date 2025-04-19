import '@ecopages/bun-mdx-kitajs-loader';
import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core';
import { imageProcessorPlugin } from '@ecopages/image-processor';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { reactPlugin } from '@ecopages/react';

const config = await new ConfigBuilder()
  .setRootDir(import.meta.dir)
  .setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
  .setIntegrations([reactPlugin()])
  .setProcessors([
    imageProcessorPlugin({
      options: {
        sourceDir: path.resolve(import.meta.dir, 'src/images'),
        outputDir: path.resolve(import.meta.dir, '.eco/public/images'),
        publicPath: '/public/images',
        acceptedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        quality: 80,
        format: 'webp',
        sizes: [
          { width: 320, label: 'sm' },
          { width: 768, label: 'md' },
          { width: 1024, label: 'lg' },
          { width: 1920, label: 'xl' },
        ],
      },
    }),
    postcssProcessorPlugin(),
  ])
  .setError404Template('404.tsx')
  .setIncludesTemplates({
    head: 'head.tsx',
    html: 'html.tsx',
    seo: 'seo.tsx',
  })
  .build();

export default config;
