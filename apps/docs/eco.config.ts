import type { EcoPagesConfigInput } from '@ecopages/core';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';
import { mdxPlugin } from '@ecopages/mdx';

const config: EcoPagesConfigInput = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECO_PAGES_BASE_URL,
  integrations: [kitajsPlugin(), litPlugin(), mdxPlugin()],
  defaultMetadata: {
    title: 'Eco Pages | Docs',
    description: 'Eco Pages is a static site generator written in TypeScript, it supports Lit and Kita out of the box.',
    image: 'public/assets/images/default-og.png',
    keywords: ['typescript', 'framework', 'static'],
  },
};

export default config;
