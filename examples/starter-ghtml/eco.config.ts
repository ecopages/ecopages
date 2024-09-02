import type { EcoPagesConfig } from '@ecopages/core';
import { mdxPlugin } from '@ecopages/mdx';

const config: EcoPagesConfig = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECOPAGES_BASE_URL as string,
  integrations: [mdxPlugin()],
};

export default config;
