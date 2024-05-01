import type { EcoPagesConfigInput } from '@eco-pages/core';

const config: EcoPagesConfigInput = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECO_PAGES_BASE_URL,
  defaultMetadata: {
    title: 'Eco Pages | Docs',
    description: 'Eco Pages is a static site generator written in TypeScript, it supports Lit and Kita out of the box.',
    image: 'public/assets/images/default-og.png',
    keywords: ['typescript', 'framework', 'static'],
  },
};

export default config;
