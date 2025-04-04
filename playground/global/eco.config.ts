import path from 'node:path';
import { bunMdxLoader } from '@ecopages/bun-mdx-kitajs-loader';
import { bunPostCssLoader } from '@ecopages/bun-postcss-loader';
import { ConfigBuilder } from '@ecopages/core';
import { imageProcessorPlugin } from '@ecopages/image-processor';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';
import { mdxPlugin } from '@ecopages/mdx';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';

const postcssOptions = {
  inputHeader: `@reference "${path.resolve(import.meta.dir, 'src/styles/tailwind.css')}";`,
};
bunPostCssLoader(postcssOptions);
export default await new ConfigBuilder()
  .setRootDir(import.meta.dir)
  .setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
  .setIntegrations([kitajsPlugin(), litPlugin(), mdxPlugin()])
  .setError404Template('404.kita.tsx')
  .setLoaders([bunPostCssLoader(postcssOptions), bunMdxLoader()])
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
    postcssProcessorPlugin(postcssOptions),
  ])
  .build();
