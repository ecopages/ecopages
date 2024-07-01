/**
 * This module contains the Kita.js plugin
 * @module
 */

import type { IntegrationPlugin } from '@ecopages/core';
import { KitaRenderer } from './kitajs-renderer';

/**
 * Options for the Kita.js plugin
 */
export type KitaPluginOptions = {
  extensions?: string[];
  dependencies?: IntegrationPlugin['dependencies'];
};

/**
 * The name of the Kita.js plugin
 */
export const PLUGIN_NAME = 'kitajs';

/**
 * Creates a Kita.js plugin
 * @param options - The options for the plugin
 * @returns The Kita.js plugin
 */
export function kitajsPlugin(options?: KitaPluginOptions): IntegrationPlugin {
  const { extensions = ['.kita.tsx'], dependencies = [] } = options || {};
  return { name: PLUGIN_NAME, extensions, renderer: KitaRenderer, dependencies };
}
