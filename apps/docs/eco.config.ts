import { ConfigBuilder } from '@ecopages/core';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';
import { mdxPlugin } from '@ecopages/mdx';

const config = await new ConfigBuilder()
  .setRootDir(import.meta.dir)
  .setBaseUrl(process.env.ECOPAGES_BASE_URL)
  .setIntegrations([kitajsPlugin(), litPlugin(), mdxPlugin()])
  .setDefaultMetadata({
    title: 'Eco Pages | Docs',
    description: 'Eco Pages is a static site generator written in TypeScript',
    image: 'public/assets/images/default-og.png',
    keywords: ['typescript', 'framework', 'static'],
  })
  .setIncludesTemplates({
    head: 'head.kita.tsx',
    html: 'html.kita.tsx',
    seo: 'seo.kita.tsx',
  })
  .setError404Template('404.kita.tsx')
  .build();

export default config;
