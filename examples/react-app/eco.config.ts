import type { EcoPagesConfig } from '@ecopages/core';
import { mdxPlugin } from '@ecopages/mdx';
import { reactPlugin } from '@ecopages/react';

const config: EcoPagesConfig = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECOPAGES_BASE_URL as string,
  integrations: [reactPlugin(), mdxPlugin()],
  includesTemplates: {
    head: 'head.tsx',
    html: 'html.tsx',
    seo: 'seo.tsx',
  },
  error404Template: '404.tsx',
};

export default config;
