import type { EcoPagesConfig } from '@ecopages/core';
import { kitajsPlugin } from '@ecopages/kitajs';
import { mdxPlugin } from '@ecopages/mdx';

const config: EcoPagesConfig = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECOPAGES_BASE_URL as string,
  integrations: [kitajsPlugin(), mdxPlugin()],
  defaultMetadata: {
    title: 'Radiant | Docs',
    description: 'Radiant is a minimalist web component library designed for simplicity and flexibility.',
    image: 'public/assets/images/default-og.png',
    keywords: ['typescript', 'framework', 'static'],
  },
};

export default config;
