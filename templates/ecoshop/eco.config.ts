import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';
import { tailwindV4Preset } from '@ecopages/lightningcss-processor/presets/tailwind-v4';
import { siteOrigin } from './src/lib/site-origin';
import { storePaths } from './src/lib/store-urls';

const appRoot = process.cwd();

export default defineConfig({
	baseUrl: siteOrigin,
	robotsTxt: {
		preferences: { '*': [storePaths.cart, '/api/', storePaths.demoCheckout] },
	},
	integrations: [ecopagesJsxPlugin({ radiant: true })],
	processors: [
		lightningCssProcessorPlugin({
			...tailwindV4Preset({
				referencePath: path.resolve(appRoot, 'src/styles/tailwind.css'),
			}),
			targets: ['chrome >= 111', 'safari >= 16.4', 'firefox >= 128'],
		}),
	],
});
