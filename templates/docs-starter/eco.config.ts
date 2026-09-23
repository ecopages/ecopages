import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { compareDocsEntries, docsFrontmatterSchema } from './src/content/docs';
import { contentProcessorPlugin } from '@ecopages/content-processor/plugin';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';
import { docsMdxPluginOptions } from './src/lib/docs/mdx-plugin-options';
import { configuredSiteOrigin, DOCS_SITEMAP_EXTRA_URLS } from './src/lib/docs/site-meta';

const appRoot = path.resolve(import.meta.dirname);

export default defineConfig({
	rootDir: appRoot,
	baseUrl: configuredSiteOrigin(),
	sitemap: {
		enabled: true,
		extraUrls: [...DOCS_SITEMAP_EXTRA_URLS],
		exclude: ['/404', '/500'],
	},
	defaultMetadata: {
		title: 'Docs starter',
		description: 'An Ecopages docs template with MDX pages, sidebar navigation, and a theme toggle.',
		image: '/assets/images/default-og.png',
	},
	integrations: [
		ecopagesJsxPlugin({
			extensions: ['.tsx'],
			mdx: docsMdxPluginOptions,
		}),
	],
	additionalWatchPaths: ['src/content', 'src/lib/docs', 'src/layouts/docs-layout'],
	processors: [
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(appRoot, 'src/styles/tailwind.css'),
			}),
		),
		contentProcessorPlugin({
			options: {
				collections: {
					docs: {
						contentDir: 'content/docs',
						schema: docsFrontmatterSchema,
						orderBy: compareDocsEntries,
						entryType: './src/content/docs#DocsFrontmatter',
					},
				},
			},
		}),
	],
});
