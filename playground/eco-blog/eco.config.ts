import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { imageProcessorPlugin, type ImageProcessorConfig } from '@ecopages/image-processor';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';
import { tailwindV4Preset } from '@ecopages/lightningcss-processor/presets/tailwind-v4';

export const imageProcessorConfig: ImageProcessorConfig = {
	sourceDir: path.resolve(import.meta.dirname, 'src/images'),
	outputDir: path.resolve(import.meta.dirname, 'dist/client/images'),
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
};

export default defineConfig({
	integrations: [ecopagesJsxPlugin()],
	processors: [
		lightningCssProcessorPlugin({
			...tailwindV4Preset({
				referencePath: path.resolve(import.meta.dirname, 'src/styles/app.css'),
			}),
			targets: ['chrome >= 111', 'safari >= 16.4', 'firefox >= 128'],
		}),
		imageProcessorPlugin({ options: imageProcessorConfig }),
	],
});
