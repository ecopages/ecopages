import { type EcoPagesConfigInput, litPlugin, mdxPlugin, reactPlugin } from '@eco-pages/core';

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
