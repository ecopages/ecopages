import type { EcoPagesConfigInput } from '@ecopages/core';
import { kitajsPlugin } from '@ecopages/kitajs';

const config: EcoPagesConfigInput = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECO_PAGES_BASE_URL as string,
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
};

export default config;
