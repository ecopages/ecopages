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
  constructor(options?: Omit<IntegrationPluginConfig, 'name'>) {
    super({
      name: PLUGIN_NAME,
      extensions: ['.kita.tsx'],
      ...options,
    });

    this.dependencies = options?.dependencies || [];
  }

  createRenderer(): IntegrationRenderer {
    if (!this.appConfig) {
      throw new Error('Plugin not initialized with app config');
    }

    return new KitaRenderer({
      appConfig: this.appConfig,
      assetsDependencyService: this.assetsDependencyService,
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
