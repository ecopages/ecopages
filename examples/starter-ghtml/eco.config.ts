import { type EcoPagesConfig, ghtmlPlugin } from '@ecopages/core';

const config: EcoPagesConfig = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECOPAGES_BASE_URL as string,
  integrations: [
    ghtmlPlugin({
      extensions: ['.ts'],
    }),
  ],
  includesTemplates: {
    head: 'head.ts',
    html: 'html.ts',
    seo: 'seo.ts',
  },
  error404Template: '404.ts',
};

export default config;
