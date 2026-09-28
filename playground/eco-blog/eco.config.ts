import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { imageProcessorPlugin, type ImageProcessorConfig } from '@ecopages/image-processor';
import { kitajsPlugin } from '@ecopages/kitajs';
import { mdxPlugin } from '@ecopages/mdx';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';

export const imageProcessorConfig: ImageProcessorConfig = {
	sourceDir: path.resolve(import.meta.dirname, 'src/images'),
	outputDir: path.resolve(import.meta.dirname, 'dist/images'),
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
	integrations: [
		kitajsPlugin(),
		mdxPlugin({
			compilerOptions: {
				jsxImportSource: '@kitajs/html',
			},
		}),
	],
	processors: [
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(import.meta.dirname, 'src/styles/tailwind.css'),
			}),
		),
		imageProcessorPlugin({ options: imageProcessorConfig }),
	],
});
