import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';
import { ghtmlPlugin } from '@ecopages/core/integrations/ghtml';

const appRoot = process.cwd();

const config = await new ConfigBuilder()
	.setRootDir(appRoot)
	.setBaseUrl(process.env.ECOPAGES_BASE_URL ?? 'http://localhost:3000')
	.setProcessors([
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(appRoot, 'src/styles/tailwind.css'),
			}),
		),
	])
	.setIntegrations([
		ghtmlPlugin({
			extensions: ['.ts'],
		}),
	])
	.build();

export default config;
