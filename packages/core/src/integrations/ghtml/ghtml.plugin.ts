import type { IntegrationPlugin } from '@ecopages/core';
import { GhtmlRenderer } from './ghtml-renderer';

/**
 * Options for the ghtml plugin
 */
export type GhtmlPluginOptions = {
  extensions?: string[];
  dependencies?: IntegrationPlugin['dependencies'];
};

/**
 * The name of the ghtml plugin
 */
export const PLUGIN_NAME = 'ghtml';

/**
 * Creates a ghtml plugin
 * @param options - The options for the plugin
 * @returns The ghtml plugin
 */
export function ghtmlPlugin(options?: GhtmlPluginOptions): IntegrationPlugin {
  const { extensions = ['.ghtml.ts'], dependencies = [] } = options || {};
  return { name: PLUGIN_NAME, extensions, renderer: GhtmlRenderer, dependencies };
}
