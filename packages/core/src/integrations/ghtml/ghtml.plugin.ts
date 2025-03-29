import { IntegrationPlugin, type IntegrationPluginConfig } from '../../plugins/integration-plugin';
import type { IntegrationRenderer } from '../../route-renderer/integration-renderer';
import { GhtmlRenderer } from './ghtml-renderer';

/**
 * The name of the ghtml plugin
 */
export const GHTML_PLUGIN_NAME = 'ghtml';

/**
 * The Ghtml plugin class
 * This plugin provides support for ghtml components in Ecopages
 */
export class GhtmlPlugin extends IntegrationPlugin {
  constructor(options?: Omit<IntegrationPluginConfig, 'name'>) {
    super({
      name: GHTML_PLUGIN_NAME,
      extensions: ['.ghtml.ts', '.ghtml'],
      ...options,
    });
  }

  createRenderer(): IntegrationRenderer {
    if (!this.appConfig) {
      throw new Error('Plugin not initialized with app config');
    }

    return new GhtmlRenderer({
      appConfig: this.appConfig,
    });
  }
}

/**
 * Factory function to create a Ghtml plugin instance
 * @param options Configuration options for the Ghtml plugin
 * @returns A new GhtmlPlugin instance
 */
export function ghtmlPlugin(options?: Omit<IntegrationPluginConfig, 'name'>): GhtmlPlugin {
  return new GhtmlPlugin(options);
}
