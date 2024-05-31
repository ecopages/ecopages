import type { EcoPagesConfigInput } from '@ecopages/core';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit/src';
import { mdxPlugin } from '@ecopages/mdx/src';

const config: EcoPagesConfigInput = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECO_PAGES_BASE_URL,
  integrations: [kitajsPlugin(), litPlugin(), mdxPlugin()],
};

export default config;
