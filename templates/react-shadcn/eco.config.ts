import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { imageProcessorPlugin } from '@ecopages/image-processor';
import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';
import { tailwindV4Preset } from '@ecopages/lightningcss-processor/presets/tailwind-v4';
import { reactPlugin } from '@ecopages/react';
import { ecoRouter } from '@ecopages/react-router';
import { siteOrigin } from './src/lib/site-origin';

export default defineConfig({
	baseUrl: siteOrigin,
	integrations: [reactPlugin({ router: ecoRouter(), mdx: {} })],
	processors: [
		imageProcessorPlugin({
			options: {
				sourceDir: path.resolve(process.cwd(), 'src/images'),
				outputDir: path.resolve(process.cwd(), 'dist/client/images'),
				publicPath: '/images',
				acceptedFormats: ['jpg', 'jpeg', 'png', 'webp'],
				quality: 80,
				format: 'webp',
				sizes: [
					{ width: 320, label: 'sm' },
					{ width: 768, label: 'md' },
					{ width: 1024, label: 'lg' },
					{ width: 1920, label: 'xl' },
				],
			},
		}),
		lightningCssProcessorPlugin({
			...tailwindV4Preset({
				referencePath: path.resolve(process.cwd(), 'src/styles/tailwind.css'),
			}),
			targets: ['chrome >= 111', 'safari >= 16.4', 'firefox >= 128'],
		}),
	],
});
