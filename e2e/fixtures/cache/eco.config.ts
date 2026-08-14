import { ConfigBuilder } from '@ecopages/core/config-builder';
import { createStringMarkupIntegration } from '@ecopages/testing';

const config = await new ConfigBuilder()
	.setRootDir(import.meta.dir)
	.setIntegrations([createStringMarkupIntegration({ extensions: ['.ts'] })])
	.build();

export default config;
