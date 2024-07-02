import type { EcoPagesConfig } from '@ecopages/core';
import { kitajsPlugin } from '@ecopages/kitajs';

const config: EcoPagesConfig = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECOPAGES_BASE_URL as string,
  integrations: [
    kitajsPlugin({
      extensions: ['.tsx'],
    }),
  ],
  includesTemplates: {
    head: 'head.tsx',
    html: 'html.tsx',
    seo: 'seo.tsx',
  },
  error404Template: '404.tsx',
};

export default config;
