import type { EcoPagesConfigInput } from '@eco-pages/core';
import { kitajsPlugin } from '../../../integrations/kitajs/src';
import { litPlugin } from '../../../integrations/lit/src';
import { mdxPlugin } from '../../../integrations/mdx/src';

const config: EcoPagesConfigInput = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECO_PAGES_BASE_URL,
  integrations: [kitajsPlugin(), litPlugin(), mdxPlugin()],
};

export default config;
