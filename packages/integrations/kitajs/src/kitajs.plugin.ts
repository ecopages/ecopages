import type { IntegrationRenderer } from '@ecopages/core';
import { IntegrationPlugin, type IntegrationPluginConfig } from '@ecopages/core/plugins/integration-plugin';
import { KitaRenderer } from './kitajs-renderer';

/**
 * The name of the Kita.js plugin
 */
export const PLUGIN_NAME = 'kitajs';

/**
 * The Kita.js plugin class
 * This plugin provides support for Kita.js components in Ecopages
 */
export class KitaHtmlPlugin extends IntegrationPlugin {
  renderer = KitaRenderer;

  constructor(options?: Omit<IntegrationPluginConfig, 'name'>) {
    super({
      name: PLUGIN_NAME,
      extensions: ['.kita.tsx'],
      ...options,
    });
  }
}

/**
 * Factory function to create a React plugin instance
 * @param options Configuration options for the React plugin
 * @returns A new ReactPlugin instance
 */
export function kitajsPlugin(options?: Omit<IntegrationPluginConfig, 'name'>): KitaHtmlPlugin {
  return new KitaHtmlPlugin(options);
}
