import type { EcoPagesConfigInput } from '@eco-pages/core';

const config: EcoPagesConfigInput = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECO_PAGES_BASE_URL,
};

export default config;
