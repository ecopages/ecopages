import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { contentProcessorPlugin } from '@ecopages/content-processor/plugin';
import { imageProcessorPlugin } from '@ecopages/image-processor';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';
import { compareDocsEntries, docsFrontmatterSchema, DOCS_ROOT } from './src/content/docs';
import { docsMdxPluginOptions } from './src/lib/docs/mdx-plugin-options';

const config = await new ConfigBuilder()
	.setRootDir(import.meta.dirname)
	.setBaseUrl(process.env.ECOPAGES_BASE_URL)
	.setIntegrations([
		ecopagesJsxPlugin({
			extensions: ['.tsx', '.kita.tsx'],
			mdx: docsMdxPluginOptions,
		}),
	])
	.setDefaultMetadata({
		title: 'Ecopages | Docs',
		description: 'Ecopages is a static site generator written in TypeScript',
		image: 'public/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static'],
	})
	.setAdditionalWatchPaths(['src/content', 'src/homepage', 'src/lib/plugins', 'src/data'])
	.setProcessors([
		contentProcessorPlugin({
			options: {
				collections: {
					docs: {
						contentDir: 'content/docs',
						schema: docsFrontmatterSchema,
						orderBy: compareDocsEntries,
						entryType: './src/content/docs#DocsFrontmatter',
						routePrefix: DOCS_ROOT,
						devPrewarm: 'all',
						devPrewarmReadiness: 'beforeReady',
					},
				},
			},
		}),
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
