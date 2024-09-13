import { ConfigBuilder, ghtmlPlugin } from '@ecopages/core';

const config = await new ConfigBuilder()
  .setRootDir(import.meta.dir)
  .setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
  .setIntegrations([
    ghtmlPlugin({
      extensions: ['.ts'],
    }),
  ])
  .setError404Template('404.ts')
  .setIncludesTemplates({
    head: 'head.ts',
    html: 'html.ts',
    seo: 'seo.ts',
  })
  .build();

export default config;
