/**
 * This file contains the plugins for bundling the image specifications.
 * @module @ecopages/image-processor/image-plugins
 */

import type { EcoBuildOnLoadResult, EcoBuildPlugin } from '@ecopages/core/processor';
import type { ImageMap } from './plugin.ts';
import { anyCaseToCamelCase } from './utils.ts';

/** Fills the image map before the module is loaded. */
type EnsureImagesReady = () => Promise<void>;

/**
 * This function creates the plugin result for the image specifications.
 */
function createPluginResult(exports: ImageMap): EcoBuildOnLoadResult {
	return {
		contents: `${Object.entries(exports)
			.map(([key, value]) => `export const ${anyCaseToCamelCase(key)} = ${JSON.stringify(value)};`)
			.join('\n')}`,
		loader: 'ts',
	};
}

/**
 * Declares `ecopages:images` as a virtual module for server builds.
 */
export function createImagePlugin(exports: ImageMap, ensureReady: EnsureImagesReady): EcoBuildPlugin {
	return {
		name: 'ecopages:images',
		setup(build) {
			build.module('ecopages:images', async () => {
				await ensureReady();
				return createPluginResult(exports);
			});
		},
	};
}

/**
 * Resolves `ecopages:images` with `onResolve` and `onLoad` for browser builds.
 */
export function createImagePluginBundler(exports: ImageMap, ensureReady: EnsureImagesReady): EcoBuildPlugin {
	return {
		name: 'ecopages:images',
		setup(build) {
			build.onResolve({ filter: /^ecopages:images$/ }, () => {
				return {
					namespace: 'ecopages-images',
					path: 'ecopages:images',
				};
			});

			build.onLoad({ filter: /.*/, namespace: 'ecopages-images' }, async () => {
				await ensureReady();
				return createPluginResult(exports);
			});
		},
	};
}
