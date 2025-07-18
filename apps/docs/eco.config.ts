import '@ecopages/bun-mdx-kitajs-loader';
import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core';
import { imageProcessorPlugin } from '@ecopages/image-processor';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';
import { mdxPlugin } from '@ecopages/mdx';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';

const config = await new ConfigBuilder()
	.setRootDir(import.meta.dir)
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([kitajsPlugin(), litPlugin(), mdxPlugin()])
	.setDefaultMetadata({
		title: 'Ecopages | Docs',
		description: 'Ecopages is a static site generator written in TypeScript',
		image: 'public/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static'],
	})
	.setIncludesTemplates({
		head: 'head.kita.tsx',
		html: 'html.kita.tsx',
		seo: 'seo.kita.tsx',
	})
	.setError404Template('404.kita.tsx')
	.setAdditionalWatchPaths(['src/data'])
	.setProcessors([
		postcssProcessorPlugin(),
		imageProcessorPlugin({
			options: {
				sourceDir: path.resolve(import.meta.dir, 'src/images'),
				outputDir: path.resolve(import.meta.dir, '.eco/public/images'),
				publicPath: '/public/images',
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
	])
	.build();

export default config;
