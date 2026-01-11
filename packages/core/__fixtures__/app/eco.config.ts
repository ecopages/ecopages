import { ConfigBuilder } from '@ecopages/core';

const config = await new ConfigBuilder().setRootDir(import.meta.dir).build();

export default config;
