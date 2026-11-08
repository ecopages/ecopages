import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { kitajsPlugin } from '@ecopages/kitajs';
import { mdxPlugin } from '@ecopages/mdx';
import { imageProcessorPlugin } from '@ecopages/image-processor';
import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';
import { tailwindV4Preset } from '@ecopages/lightningcss-processor/presets/tailwind-v4';

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
		imageProcessorPlugin({
			options: {
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
			},
		}),
		lightningCssProcessorPlugin({
			...tailwindV4Preset({
				referencePath: path.resolve(import.meta.dirname, 'src/styles/tailwind.css'),
			}),
			targets: ['chrome >= 111', 'safari >= 16.4', 'firefox >= 128'],
		}),
	],
});
