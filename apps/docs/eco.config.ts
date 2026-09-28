import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { contentProcessorPlugin } from '@ecopages/content-processor/plugin';
import { imageProcessorPlugin } from '@ecopages/image-processor';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';
import { compareDocsEntries, docsFrontmatterSchema, DOCS_ROOT } from './src/content/docs';
import { docsMdxPluginOptions } from './src/lib/docs/mdx-plugin-options';
import { configuredSiteOrigin, DOCS_SITEMAP_EXTRA_URLS } from './src/lib/docs/site-meta';

export default defineConfig({
	rootDir: import.meta.dirname,
	baseUrl: configuredSiteOrigin(),
	sitemap: {
		enabled: true,
		extraUrls: [...DOCS_SITEMAP_EXTRA_URLS],
		exclude: ['/404', '/500'],
	},
	integrations: [
		ecopagesJsxPlugin({
			extensions: ['.tsx', '.kita.tsx'],
			mdx: docsMdxPluginOptions,
		}),
	],
	defaultMetadata: {
		title: 'Ecopages | Docs',
		description: 'Ecopages is a static site generator written in TypeScript',
		image: '/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static'],
	},
	additionalWatchPaths: ['src/content', 'src/homepage', 'src/lib/plugins', 'src/data'],
	processors: [
		contentProcessorPlugin({
			options: {
				collections: {
					docs: {
						contentDir: 'content/docs',
						schema: docsFrontmatterSchema,
						orderBy: compareDocsEntries,
						entryType: './src/content/docs#DocsFrontmatter',
						routePrefix: DOCS_ROOT,
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
	],
});
