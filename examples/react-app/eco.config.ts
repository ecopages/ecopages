import type { EcoPagesConfigInput } from '@ecopages/core';
import { litPlugin } from '@ecopages/lit';
import { mdxPlugin } from '@ecopages/mdx';
import { reactPlugin } from '@ecopages/react';

const config: EcoPagesConfigInput = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECO_PAGES_BASE_URL as string,
  integrations: [reactPlugin(), mdxPlugin()],
  includesTemplates: {
    head: 'head.tsx',
    html: 'html.tsx',
    seo: 'seo.tsx',
  },
};

export default config;
