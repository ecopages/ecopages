import path from 'node:path';
import { defineConfig } from '@ecopages/core/config';
import { POSTS_CONTENT_DIR, comparePosts, postsFrontmatterSchema } from './src/content/posts';
import { blogMdxPluginOptions } from './src/lib/mdx-plugin-options';
import { contentProcessorPlugin } from '@ecopages/content-processor/plugin';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { imageProcessorPlugin } from '@ecopages/image-processor';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';

const appRoot = import.meta.dirname;

export default defineConfig({
	sitemap: {
		enabled: true,
		extraUrls: ['/rss.xml'],
		exclude: ['/404', '/500'],
	},
	integrations: [
		ecopagesJsxPlugin({
			radiant: true,
			mdx: blogMdxPluginOptions,
		}),
	],
	processors: [
		contentProcessorPlugin({
			options: {
				collections: {
					posts: {
						contentDir: POSTS_CONTENT_DIR,
						schema: postsFrontmatterSchema,
						orderBy: comparePosts,
						entryType: './src/content/posts#PostFrontmatter',
					},
				},
			},
		}),
		imageProcessorPlugin({
			options: {
				sourceDir: path.resolve(appRoot, 'src/images'),
				outputDir: path.resolve(appRoot, 'dist/images'),
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
				referencePath: path.resolve(appRoot, 'src/styles/tailwind.css'),
			}),
		),
	],
});
