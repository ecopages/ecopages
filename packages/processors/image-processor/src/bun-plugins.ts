/**
 * This file contains the plugins for bundling the image specifications.
 * @module @ecopages/image-processor/bun-plugins
 */

import type { EcoBuildOnLoadResult, EcoBuildPlugin } from '@ecopages/core/build/build-types';
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
 * This function creates a plugin for bundling the image specifications.
 * https://bun.sh/docs/runtime/plugins#virtual-modules
 * @param exports
 * @returns
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
 * This function creates a plugin for bundling the image specifications.
 * Due to some limitations in the bundler, we need to use a different approach.
 * https://bun.sh/docs/runtime/plugins#virtual-modules > bun-v1.2.5
 * (This feature is currently only available at runtime with Bun.plugin and not yet supported in the bundler, but you can mimic the behavior using onResolve and onLoad.)
 * @param exports
 * @returns
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
