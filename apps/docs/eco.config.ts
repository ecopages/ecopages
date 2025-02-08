import { ConfigBuilder } from '@ecopages/core';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit/lit.plugin';
import { mdxPlugin } from '@ecopages/mdx';

const config = await new ConfigBuilder()
  .setRootDir(import.meta.dir)
  .setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
  .setIntegrations([kitajsPlugin(), litPlugin(), mdxPlugin()])
  .setDefaultMetadata({
    title: 'Ecopages | Docs',
    description: 'Ecopages is a static site generator written in TypeScript',
    image: 'public/assets/images/default-og.png',
    keywords: ['typescript', 'framework', 'static'],
  })
  .setIncludesTemplates({
    head: 'head.kita.tsx',
    html: 'html.kita.tsx',
    seo: 'seo.kita.tsx',
  })
  .setError404Template('404.kita.tsx')
  .setAdditionalWatchPaths(['src/data'])
  .build();

export default config;
