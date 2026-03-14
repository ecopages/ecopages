import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';

export default await new ConfigBuilder()
	.setRootDir(import.meta.dirname)
	.setBaseUrl(process.env.ECOPAGES_BASE_URL ?? '/')
	.setIntegrations([kitajsPlugin(), litPlugin()])
	.setProcessors([
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(import.meta.dirname, 'src/styles/global.css'),
			}),
		),
	])
	.build();
