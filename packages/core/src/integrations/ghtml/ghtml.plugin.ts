import type { IntegrationPlugin } from '../../public-types';
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
 * @param options {@link GhtmlPluginOptions}
 * @returns The ghtml plugin
 */
export function ghtmlPlugin(options?: GhtmlPluginOptions): IntegrationPlugin {
  const { extensions = ['.ghtml.ts', '.ghtml'], dependencies = [] } = options || {};
  return { name: PLUGIN_NAME, extensions, renderer: GhtmlRenderer, dependencies };
}
