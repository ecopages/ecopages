import { ConfigBuilder } from '@ecopages/core';

const config = await new ConfigBuilder()
  .setRootDir(import.meta.dir)
  .setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
  .build();

export default config;
