import type { EcoPagesConfigInput } from '@eco-pages/core';
import { litPlugin } from '@eco-pages/lit';
import { mdxPlugin } from '@eco-pages/mdx';
import { reactPlugin } from '@eco-pages/react';

const config: EcoPagesConfigInput = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECO_PAGES_BASE_URL,
  integrations: [reactPlugin(), litPlugin(), mdxPlugin()],
  includesTemplates: {
    head: 'head.tsx',
    html: 'html.tsx',
    seo: 'seo.tsx',
  },
};

export default config;
