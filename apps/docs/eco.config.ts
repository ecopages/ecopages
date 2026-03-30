import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { imageProcessorPlugin } from '@ecopages/image-processor';
import { kitajsPlugin } from '@ecopages/kitajs';
import { mdxPlugin } from '@ecopages/mdx';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';
import remarkGfm from 'remark-gfm';
import rehypePrettyCode from 'rehype-pretty-code';
import { rehypeSimpleTableWrapper } from './src/plugins/rehype-simple-table-wrapper';
import { transformerEscapeHtml } from './src/plugins/transformer-escape-html';
import { remarkEscapeInlineCodeHtml } from '@/plugins/remark-escape-inline-code-html';

const config = await new ConfigBuilder()
	.setRootDir(import.meta.dirname)
	.setBaseUrl(process.env.ECOPAGES_BASE_URL)
	.setIntegrations([
		kitajsPlugin(),
		mdxPlugin({
			compilerOptions: {
				jsxImportSource: '@kitajs/html',
				remarkPlugins: [remarkGfm, remarkEscapeInlineCodeHtml],
				rehypePlugins: [
					[
						rehypePrettyCode,
						{
							theme: {
								light: 'light-plus',
								dark: 'dark-plus',
							},
							transformers: [transformerEscapeHtml],
						},
					],
					rehypeSimpleTableWrapper,
				],
			},
		}),
	])
	.setDefaultMetadata({
		title: 'Ecopages | Docs',
		description: 'Ecopages is a static site generator written in TypeScript',
		image: 'public/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static'],
	})
	.setAdditionalWatchPaths(['src/data'])
	.setProcessors([
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(import.meta.dirname, 'src/styles/tailwind.css'),
			}),
		),
		imageProcessorPlugin({
			options: {
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
			},
		}),
	])
	.build();

export default config;
