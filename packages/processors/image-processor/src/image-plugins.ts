/**
 * This file contains the plugins for bundling the image specifications.
 * @module @ecopages/image-processor/image-plugins
 */

import type { EcoBuildOnLoadResult, EcoBuildPlugin } from '@ecopages/core/plugins/processor';
import type { ImageMap } from './plugin.ts';
import { anyCaseToCamelCase } from './utils.ts';

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
export function createImagePlugin(exports: ImageMap): EcoBuildPlugin {
	return {
		name: 'ecopages:images',
		setup(build) {
			build.module('ecopages:images', () => createPluginResult(exports));
		},
	};
}

/**
 * Resolves `ecopages:images` with `onResolve` and `onLoad` for browser builds.
 */
export function createImagePluginBundler(exports: ImageMap): EcoBuildPlugin {
	return {
		name: 'ecopages:images',
		setup(build) {
			build.onResolve({ filter: /^ecopages:images$/ }, () => {
				return {
					namespace: 'ecopages-images',
					path: 'ecopages:images',
				};
			});

			build.onLoad({ filter: /.*/, namespace: 'ecopages-images' }, () => createPluginResult(exports));
		},
	};
}
