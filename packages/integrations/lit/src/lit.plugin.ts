/**
 * This module contains the Lit plugin
 * @module
 */

import { type IntegrationPlugin, deepMerge } from '@ecopages/core';
import { LitRenderer } from './lit-renderer';

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
        importPath: '@lit-labs/ssr-client/lit-element-hydrate-support.js',
      },
    ],
  };

  const finalOptions = options ? deepMerge(defaultOptions, options) : defaultOptions;

  const { extensions, dependencies } = finalOptions;
  return { name: PLUGIN_NAME, extensions, renderer: LitRenderer, dependencies };
}
