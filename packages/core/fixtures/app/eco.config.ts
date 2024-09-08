import type { EcoPagesConfig } from '@ecopages/core';

const config: EcoPagesConfig = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECOPAGES_BASE_URL,
};

export default config;
