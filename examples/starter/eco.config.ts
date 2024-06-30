import type { EcoPagesConfigInput } from '@ecopages/core';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';
import { mdxPlugin } from '@ecopages/mdx';

const config: EcoPagesConfigInput = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECOPAGES_BASE_URL as string,
  integrations: [kitajsPlugin(), litPlugin(), mdxPlugin()],
};

export default config;
