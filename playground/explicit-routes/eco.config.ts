import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { kitajsPlugin } from '@ecopages/kitajs';
import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';
import { tailwindV4Preset } from '@ecopages/lightningcss-processor/presets/tailwind-v4';

export default defineConfig({
	integrations: [kitajsPlugin()],
	processors: [
		lightningCssProcessorPlugin({
			...tailwindV4Preset({
				referencePath: path.resolve(import.meta.dirname, 'src/styles/tailwind.css'),
			}),
			targets: ['chrome >= 111', 'safari >= 16.4', 'firefox >= 128'],
		}),
	],
});
