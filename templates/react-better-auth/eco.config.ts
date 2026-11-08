import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { imageProcessorPlugin } from '@ecopages/image-processor';
import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';
import { tailwindV4Preset } from '@ecopages/lightningcss-processor/presets/tailwind-v4';
import { reactPlugin } from '@ecopages/react';
import { ecoRouter } from '@ecopages/react-router';
import rehypePrettyCode from 'rehype-pretty-code';
import remarkGfm from 'remark-gfm';
import { siteOrigin } from './src/lib/site-origin';

const appRoot = process.cwd();

export default defineConfig({
	baseUrl: siteOrigin,
	defaultMetadata: {
		title: 'Ecopages Better Auth Playground',
		description: 'A minimal, high-performance starter template for Ecopages with Better Auth integration.',
	},
	integrations: [
		reactPlugin({
			router: ecoRouter(),
			mdx: {
				remarkPlugins: [remarkGfm],
				rehypePlugins: [
					[
						rehypePrettyCode,
						{
							theme: {
								light: 'light-plus',
								dark: 'dark-plus',
							},
						},
					],
				],
			},
		}),
	],
	processors: [
		imageProcessorPlugin({
			options: {
				sourceDir: path.resolve(appRoot, 'src/images'),
				outputDir: path.resolve(appRoot, 'dist/client/images'),
				publicPath: '/images',
				acceptedFormats: ['jpg', 'jpeg', 'png', 'avif', 'webp', 'gif'],
				quality: 80,
				format: 'avif',
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
				referencePath: path.resolve(appRoot, 'src/styles/app.css'),
			}),
			targets: ['chrome >= 111', 'safari >= 16.4', 'firefox >= 128'],
		}),
	],
});
