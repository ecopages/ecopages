/**
 * Single source of truth for the kitchen-sink app configuration.
 *
 * Used by `eco.config.ts`, benchmarks, and tests so every path exercises the
 * same integration/processor set against the real `playground/kitchen-sink`
 * source tree.
 */

import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { contentProcessorPlugin } from '@ecopages/content-processor/plugin';
import { withContentMdxPlugins } from '@ecopages/content-processor/mdx';
import { devToolbar } from '@ecopages/dev-toolbar/config';
import { imageProcessorPlugin } from '@ecopages/image-processor';
import { kitajsPlugin } from '@ecopages/kitajs';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { litPlugin } from '@ecopages/lit';
import { mdxPlugin } from '@ecopages/mdx';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';
import { reactPlugin } from '@ecopages/react';
import { ecoRouter } from '@ecopages/react-router';
import { comparePosts, POSTS_CONTENT_DIR, postFrontmatterSchema } from './src/content/posts.ts';

export interface KitchenSinkConfigOptions {
	rootDir: string;
	distDir?: string;
	workDir?: string;
	baseUrl?: string;
}

/**
 * Builds the kitchen-sink config: Kita, React (+ MDX), Lit, Ecopages-JSX, MDX,
 * image processor, and Tailwind/PostCSS.
 */
export async function createKitchenSinkConfig(options: KitchenSinkConfigOptions) {
	const rootDir = options.rootDir;
	const distDir = options.distDir ?? 'dist';
	const workDir = options.workDir ?? '.eco';
	const baseUrl = options.baseUrl ?? 'http://localhost:3000';

	return new ConfigBuilder()
		.setRootDir(rootDir)
		.setBaseUrl(baseUrl)
		.setDistDir(distDir)
		.setWorkDir(workDir)
		.setIntegrations([
			kitajsPlugin(),
			ecopagesJsxPlugin({ extensions: ['.eco.tsx'] }),
			litPlugin(),
			reactPlugin({
				router: ecoRouter(),
				extensions: ['.react.tsx'],
				mdx: {
					enabled: true,
					...withContentMdxPlugins(),
				},
				runtimeModules: ['zod'],
			}),
			mdxPlugin({
				extensions: ['.md'],
				compilerOptions: {
					jsxImportSource: '@kitajs/html',
				},
			}),
		])
		.setProcessors([
			contentProcessorPlugin({
				options: {
					collections: {
						posts: {
							contentDir: POSTS_CONTENT_DIR,
							schema: postFrontmatterSchema,
							orderBy: comparePosts,
							entryType: './src/content/posts#PostFrontmatter',
						},
					},
				},
			}),
			imageProcessorPlugin({
				options: {
					sourceDir: path.resolve(rootDir, 'src/images'),
					outputDir: path.resolve(rootDir, distDir, 'images'),
					publicPath: '/images',
					acceptedFormats: ['jpg', 'jpeg', 'png', 'webp'],
					quality: 80,
					format: 'webp',
					sizes: [
						{ width: 320, label: 'sm' },
						{ width: 768, label: 'md' },
						{ width: 1024, label: 'lg' },
						{ width: 1600, label: 'xl' },
					],
				},
			}),
			postcssProcessorPlugin(
				tailwindV4Preset({
					referencePath: path.resolve(rootDir, 'src/styles/tailwind.css'),
				}),
			),
		])
		.setDevToolbar(devToolbar())
		.build();
}
