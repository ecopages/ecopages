import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';
import { tailwindV4Preset } from '@ecopages/lightningcss-processor/presets/tailwind-v4';
import { reactPlugin } from '@ecopages/react';

export default defineConfig({
	baseUrl: process.env.ECOPAGES_BASE_URL ?? '/',
	integrations: [reactPlugin()],
	processors: [
		lightningCssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(import.meta.dirname, 'src/styles/tailwind.css'),
			}),
		),
	],
});
