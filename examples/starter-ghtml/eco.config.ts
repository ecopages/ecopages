import type { EcoPagesConfig } from '@ecopages/core';
import { mdxPlugin } from '@ecopages/mdx';

const config: EcoPagesConfig = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECOPAGES_BASE_URL as string,
  integrations: [mdxPlugin()],
  error404Template: '404.ghtml.ts',
  includesTemplates: {
    head: 'head.ghtml.ts',
    html: 'html.ghtml.ts',
    seo: 'seo.ghtml.ts',
  },
};

export default config;
