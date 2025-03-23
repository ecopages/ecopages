/**
 * This file contains the plugins for bundling the image specifications.
 * @module @ecopages/image-processor/bun-plugins
 */

import type { BunPlugin, OnLoadResult } from 'bun';
import type { ImageMap } from './plugin';
import { anyCaseToCamelCase } from './utils';

/**
 * This function creates the plugin result for the image specifications.
 */
function createPluginResult(exports: ImageMap): OnLoadResult {
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
export function createImagePlugin(exports: ImageMap): BunPlugin {
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
export function createImagePluginBundler(exports: ImageMap): BunPlugin {
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
