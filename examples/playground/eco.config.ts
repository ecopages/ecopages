import type { EcoPagesConfig } from '@ecopages/core';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';
import { mdxPlugin } from '@ecopages/mdx';

const config: EcoPagesConfig = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECOPAGES_BASE_URL as string,
  integrations: [kitajsPlugin(), litPlugin(), mdxPlugin()],
  includesTemplates: {
    head: 'head.ghtml.ts',
    html: 'html.ghtml.ts',
    seo: 'seo.ghtml.ts',
  },
};

export default config;
