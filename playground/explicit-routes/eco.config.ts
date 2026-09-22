import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { kitajsPlugin } from '@ecopages/kitajs';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';

export default defineConfig({
	rootDir: import.meta.dirname,
	baseUrl: 'http://localhost:3000',
	integrations: [kitajsPlugin()],
	processors: [
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(import.meta.dirname, 'src/styles/tailwind.css'),
			}),
		),
	],
});
