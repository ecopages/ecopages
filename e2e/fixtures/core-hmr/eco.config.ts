import { ConfigBuilder } from '@ecopages/core/config-builder';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor/plugin';
import { tailwindV3Preset } from '@ecopages/postcss-processor/presets/tailwind-v3';
import { createStringMarkupIntegration } from '@ecopages/testing';

const builder = new ConfigBuilder()
	.setRootDir(import.meta.dir)
	.setIntegrations([createStringMarkupIntegration({ extensions: ['.ts'] })]);

if (process.env.ECOPAGES_USE_POSTCSS_PROCESSOR === 'true') {
	builder.setProcessors([postcssProcessorPlugin(tailwindV3Preset())]);
}

const config = await builder.build();

export default config;
