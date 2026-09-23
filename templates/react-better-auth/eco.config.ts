import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { imageProcessorPlugin } from '@ecopages/image-processor';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';
import { reactPlugin } from '@ecopages/react';
import { ecoRouter } from '@ecopages/react-router';
import rehypePrettyCode from 'rehype-pretty-code';
import remarkGfm from 'remark-gfm';

const appRoot = process.cwd();
const baseUrl = process.env.ECOPAGES_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
	rootDir: appRoot,
	baseUrl,
	defaultMetadata: {
		title: 'Ecopages Better Auth Playground',
		description: 'A minimal, high-performance starter template for Ecopages with Better Auth integration.',
	},
	integrations: [
		reactPlugin({
			router: ecoRouter(),
			mdx: {
				enabled: true,
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
				outputDir: path.resolve(appRoot, 'dist/images'),
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
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(appRoot, 'src/styles/app.css'),
			}),
		),
	],
});
