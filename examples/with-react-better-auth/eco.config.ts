import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { imageProcessorPlugin } from '@ecopages/image-processor';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';
import { reactPlugin } from '@ecopages/react';
import { ecoRouter } from '@ecopages/react-router';
import rehypePrettyCode from 'rehype-pretty-code';
import remarkGfm from 'remark-gfm';

const baseUrl = import.meta.env?.ECOPAGES_BASE_URL ?? 'http://localhost:3000';

const config = await new ConfigBuilder()
	.setRootDir(import.meta.dir)
	.setBaseUrl(baseUrl)
	.setDefaultMetadata({
		title: 'Ecopages + Better Auth Starter',
		description: 'A minimal, high-performance starter template for Ecopages with Better Auth integration.',
	})
	.setIntegrations([
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
	])
	.setProcessors([
		imageProcessorPlugin({
			options: {
				sourceDir: path.resolve(import.meta.dir, 'src/images'),
				outputDir: path.resolve(import.meta.dir, '.eco/images'),
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
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(import.meta.dir, 'src/styles/app.css'),
			}),
		),
	])
	.setError404Template('404.tsx')
	.setIncludesTemplates({
		head: 'head.tsx',
		html: 'html.tsx',
		seo: 'seo.tsx',
	})
	.build();

export default config;
