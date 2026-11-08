import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { contentProcessorPlugin } from '@ecopages/content-processor/plugin';
import { imageProcessorPlugin } from '@ecopages/image-processor';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';
import { suffixNesting } from '@ecopages/lightningcss-processor/plugins/suffix-nesting';
import { tailwindV4Preset } from '@ecopages/lightningcss-processor/presets/tailwind-v4';
import { compareDevEntries, devFrontmatterSchema, DEV_ROOT } from './src/content/dev';
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
					dev: {
						contentDir: 'content/dev',
						schema: devFrontmatterSchema,
						orderBy: compareDevEntries,
						entryType: './src/content/dev#DevFrontmatter',
						routePrefix: DEV_ROOT,
					},
				},
			},
		}),
		lightningCssProcessorPlugin({
			...tailwindV4Preset({
				referencePath: path.resolve(import.meta.dirname, 'src/styles/tailwind.css'),
			}),
			targets: ['>0.3%', 'not ie 11', 'not dead', 'not op_mini all'],
			plugins: [suffixNesting()],
		}),
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
	],
});
