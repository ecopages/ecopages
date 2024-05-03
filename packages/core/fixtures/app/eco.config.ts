import { type EcoPagesConfigInput, kitaPlugin, litPlugin, mdxPlugin } from '@eco-pages/core';

const config: EcoPagesConfigInput = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECO_PAGES_BASE_URL,
  integrations: [kitaPlugin(), litPlugin(), mdxPlugin()],
};

export default config;
