/**
 * Single source of truth for the kitchen-sink app configuration.
 *
 * Used by `eco.config.ts`, benchmarks, and tests so every path exercises the
 * same integration/processor set against the real `playground/kitchen-sink`
 * source tree.
 */

import path from 'node:path';
import type { EcoPagesUserConfig } from '@ecopages/core/config';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
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
	rootDir?: string;
	distDir?: string;
	workDir?: string;
	baseUrl?: string;
}

/**
 * User-owned kitchen-sink configuration shared by `eco.config.ts` and tests.
 */
export function createKitchenSinkUserConfig(options: KitchenSinkConfigOptions): EcoPagesUserConfig {
	const projectRoot = options.rootDir ?? process.cwd();
	const distDir = options.distDir ?? 'dist';
	const workDir = options.workDir ?? '.eco';

	const userConfig: EcoPagesUserConfig = {
		distDir,
		workDir,
		integrations: [
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
		],
		processors: [
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
					sourceDir: path.resolve(projectRoot, 'src/images'),
					outputDir: path.resolve(projectRoot, distDir, 'images'),
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
					referencePath: path.resolve(projectRoot, 'src/styles/tailwind.css'),
				}),
			),
		],
		devToolbar: devToolbar(),
	};

	if (options.rootDir !== undefined) {
		userConfig.rootDir = options.rootDir;
	}
	if (options.baseUrl !== undefined) {
		userConfig.baseUrl = options.baseUrl;
	}

	return userConfig;
}

/**
 * Finalizes the kitchen-sink config for tests and benchmarks that need a built app config.
 */
export async function createKitchenSinkConfig(options: KitchenSinkConfigOptions) {
	const projectRoot = options.rootDir ?? process.cwd();
	const configFilePath = path.join(projectRoot, 'eco.config.ts');
	return finalizeEcoPagesConfig(
		{
			config: createKitchenSinkUserConfig(options),
			configFilePath,
		},
		{ cwd: projectRoot },
	);
}
