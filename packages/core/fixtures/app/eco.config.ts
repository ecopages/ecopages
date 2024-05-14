import type { EcoPagesConfigInput } from '@eco-pages/core';
import { kitajsPlugin } from '@eco-pages/kitajs';
import { litPlugin } from '@eco-pages/lit/src';
import { mdxPlugin } from '@eco-pages/mdx/src';

const config: EcoPagesConfigInput = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECO_PAGES_BASE_URL,
  integrations: [kitajsPlugin(), litPlugin(), mdxPlugin()],
};

export default config;
