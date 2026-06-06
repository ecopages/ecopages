/**
 * Kitchen-sink fixture for benchmark tests.
 *
 * Replicates the integration/processor set of `playground/kitchen-sink/eco.config.ts`
 * via the public `ConfigBuilder` API, rooted at the kitchen-sink directory so
 * the bundler operates on the real source tree the framework is used with.
 *
 * The bench deliberately uses `ConfigBuilder` (not hand-rolled config objects)
 * so any future plugin additions in the kitchen-sink config flow through here
 * automatically when the kitchen-sink is updated.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigBuilder } from '../../../packages/core/src/config/config-builder';
import { kitajsPlugin } from '@ecopages/kitajs';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { litPlugin } from '@ecopages/lit';
import { reactPlugin } from '@ecopages/react';
import { mdxPlugin } from '@ecopages/mdx';
import { ecoRouter } from '@ecopages/react-router';
import { imageProcessorPlugin } from '@ecopages/image-processor';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';

const KITCHEN_SINK_DIR = fileURLToPath(new URL('..', import.meta.url));

let cachedConfig: Awaited<ReturnType<ConfigBuilder['build']>> | undefined;

/**
 * Build (once, cached) the kitchen-sink `EcoPagesAppConfig`.
 *
 * The image processor is included to keep the asset pipeline wired; tailwind
 * preset is included for parity with the live config.
 */
export async function loadKitchenSinkConfig() {
	if (cachedConfig) return cachedConfig;

	const distDir = 'dist';

	const config = await new ConfigBuilder()
		.setRootDir(KITCHEN_SINK_DIR)
		.setBaseUrl('http://localhost:3000')
		.setDistDir(distDir)
		.setIntegrations([
			kitajsPlugin(),
			ecopagesJsxPlugin({ extensions: ['.eco.tsx'] }),
			litPlugin(),
			reactPlugin({
				router: ecoRouter(),
				extensions: ['.react.tsx'],
				mdx: { enabled: true },
			}),
			mdxPlugin({
				extensions: ['.md'],
				compilerOptions: { jsxImportSource: '@kitajs/html' },
			}),
		])
		.setProcessors([
			imageProcessorPlugin({
				options: {
					sourceDir: path.resolve(KITCHEN_SINK_DIR, 'src/images'),
					outputDir: path.resolve(KITCHEN_SINK_DIR, distDir, 'images'),
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
					referencePath: path.resolve(KITCHEN_SINK_DIR, 'src/styles/tailwind.css'),
				}),
			),
		])
		.build();

	cachedConfig = config;
	return config;
}

export const KITCHEN_SINK_PATHS = {
	root: KITCHEN_SINK_DIR,
	src: path.resolve(KITCHEN_SINK_DIR, 'src'),
	pages: path.resolve(KITCHEN_SINK_DIR, 'src/pages'),
	layouts: path.resolve(KITCHEN_SINK_DIR, 'src/layouts'),
	components: path.resolve(KITCHEN_SINK_DIR, 'src/components'),
	dist: path.resolve(KITCHEN_SINK_DIR, 'dist'),
} as const;
