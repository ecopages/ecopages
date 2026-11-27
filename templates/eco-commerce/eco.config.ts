import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';
import { tailwindV4Preset } from '@ecopages/lightningcss-processor/presets/tailwind-v4';
import { siteOrigin } from './src/lib/site-origin';
import { STORE_NAME } from './src/lib/store';

const appRoot = process.cwd();

export default defineConfig({
	baseUrl: siteOrigin,
	defaultMetadata: {
		title: STORE_NAME,
		description: 'A self-hosted storefront built with Ecopages.',
	},
	integrations: [ecopagesJsxPlugin({ radiant: true })],
	processors: [
		lightningCssProcessorPlugin({
			...tailwindV4Preset({
				referencePath: path.resolve(appRoot, 'src/styles/app.css'),
			}),
			targets: ['chrome >= 111', 'safari >= 16.4', 'firefox >= 128'],
		}),
	],
});
