import { ConfigBuilder } from '@ecopages/core/config-builder';

const config = await new ConfigBuilder().setRootDir(import.meta.dir).build();

export default config;
