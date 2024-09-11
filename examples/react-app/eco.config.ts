import { ConfigBuilder } from '@ecopages/core';
import { mdxPlugin } from '@ecopages/mdx';
import { reactPlugin } from '@ecopages/react';

const config = await new ConfigBuilder()
  .setRootDir(import.meta.dir)
  .setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
  .setIntegrations([reactPlugin(), mdxPlugin()])
  .setError404Template('404.tsx')
  .setIncludesTemplates({
    head: 'head.tsx',
    html: 'html.tsx',
    seo: 'seo.tsx',
  })
  .build();

export default config;
