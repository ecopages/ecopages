import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';
import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';
import { suffixNesting } from '@ecopages/lightningcss-processor/plugins/suffix-nesting';
import { tailwindV4Preset } from '@ecopages/lightningcss-processor/presets/tailwind-v4';

export default defineConfig({
	baseUrl: process.env.ECOPAGES_BASE_URL ?? '/',
	integrations: [kitajsPlugin(), litPlugin()],
	processors: [
		lightningCssProcessorPlugin({
			...tailwindV4Preset({
				referencePath: path.resolve(import.meta.dirname, 'src/styles/global.css'),
			}),
			targets: ['chrome >= 111', 'safari >= 16.4', 'firefox >= 128'],
			plugins: [suffixNesting()],
		}),
	],
});
