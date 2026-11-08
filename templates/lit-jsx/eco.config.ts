import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { imageProcessorPlugin } from '@ecopages/image-processor';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';
import { mdxPlugin } from '@ecopages/mdx';
import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';
import { tailwindV4Preset } from '@ecopages/lightningcss-processor/presets/tailwind-v4';
import { siteOrigin } from './src/lib/site-origin';

const appRoot = process.cwd();

export default defineConfig({
	baseUrl: siteOrigin,
	integrations: [
		kitajsPlugin(),
		litPlugin(),
		mdxPlugin({
			compilerOptions: {
				jsxImportSource: '@kitajs/html',
			},
		}),
	],
	processors: [
		lightningCssProcessorPlugin({
			...tailwindV4Preset({
				referencePath: path.resolve(appRoot, 'src/styles/tailwind.css'),
			}),
			targets: ['chrome >= 111', 'safari >= 16.4', 'firefox >= 128'],
		}),
		imageProcessorPlugin({
			options: {
				sourceDir: path.resolve(appRoot, 'src/images'),
				outputDir: path.resolve(appRoot, 'dist/client/images'),
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
	],
});
