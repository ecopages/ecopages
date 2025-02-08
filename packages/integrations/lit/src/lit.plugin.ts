/**
 * This module contains the Lit plugin
 * @module
 */

import { type IntegrationPlugin, deepMerge } from '@ecopages/core';
import { litElementHydrateScript } from './lit-element-hydrate';
import { LitRenderer } from './lit-renderer.ts';

/**
 * Options for the Lit plugin
 */
export type LitPluginOptions = {
  extensions: string[];
  dependencies: IntegrationPlugin['dependencies'];
};

/**
 * The name of the Lit plugin
 */
export const PLUGIN_NAME = 'lit';

/**
 * Creates a Lit plugin
 * @param options - The options for the plugin
 * @returns The Lit plugin
 */
export function litPlugin(options?: LitPluginOptions): IntegrationPlugin {
  const defaultOptions: LitPluginOptions = {
    extensions: ['.lit.tsx'],
    dependencies: [
      {
        kind: 'script',
        position: 'head',
        /**
         * BUG ALERT
         * Due to an issue appeared in Bun 1.2.2, we need to use a workaround to import the hydrate script.
         * This is a temporary solution until the issue is resolved.
         * The litElementHydrateScript is the same file built on Bun 1.4.5.
         *
         * + importPath: '@lit-labs/ssr-client/lit-element-hydrate-support.js',
         * - content: litElementHydrateScript
         */
        content: litElementHydrateScript,
      },
    ],
  };

  const finalOptions = options ? deepMerge(defaultOptions, options) : defaultOptions;

  const { extensions, dependencies } = finalOptions;
  return { name: PLUGIN_NAME, extensions, renderer: LitRenderer, dependencies };
}
