import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';
import { tailwindV4Preset } from '@ecopages/lightningcss-processor/presets/tailwind-v4';

const appRoot = process.cwd();

export default defineConfig({
	processors: [
		lightningCssProcessorPlugin({
			...tailwindV4Preset({
				referencePath: path.resolve(appRoot, 'src/styles/tailwind.css'),
			}),
			targets: ['chrome >= 111', 'safari >= 16.4', 'firefox >= 128'],
		}),
	],
});
