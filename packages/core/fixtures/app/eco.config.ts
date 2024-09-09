import type { EcoPagesConfig } from '@ecopages/core';

const config: EcoPagesConfig = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECOPAGES_BASE_URL || 'http://localhost:3000',
};

export default config;
