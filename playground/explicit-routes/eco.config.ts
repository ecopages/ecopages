import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { kitajsPlugin } from '@ecopages/kitajs';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';

const config = await new ConfigBuilder()
	.setRootDir(import.meta.dirname)
	.setBaseUrl('http://localhost:3000')
	.setIntegrations([kitajsPlugin()])
	.setProcessors([
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(import.meta.dirname, 'src/styles/tailwind.css'),
			}),
		),
	])
	.build();

export default config;
