/**
 * This module contains the Lit plugin
 * @module
 */

import './console';
import type { IntegrationRenderer } from '@ecopages/core';
import { IntegrationPlugin, type IntegrationPluginConfig } from '@ecopages/core/plugins/integration-plugin';
import { AssetDependencyHelpers } from '@ecopages/core/services/assets-dependency-service';
import { litElementHydrateScript } from './lit-element-hydrate';
import { LitRenderer } from './lit-renderer';

/**
 * The name of the Lit plugin
 */
export const PLUGIN_NAME = 'lit';

/**
 * The Lit plugin class
 * This plugin provides support for Lit components in Ecopages
 */
export class LitPlugin extends IntegrationPlugin {
  constructor(options?: Omit<IntegrationPluginConfig, 'name'>) {
    super({
      name: PLUGIN_NAME,
      extensions: ['.lit.tsx'],
      dependencies: [
        AssetDependencyHelpers.createInlineScriptAsset({
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
        }),
        ...(options?.dependencies || []),
      ],
    });
  }

  createRenderer(): IntegrationRenderer {
    if (!this.appConfig) {
      throw new Error('Plugin not initialized with app config');
    }

    return new LitRenderer({
      appConfig: this.appConfig,
      assetsDependencyService: this.assetsDependencyService,
    });
  }
}

/**
 * Factory function to create a Lit plugin instance
 * @param options Configuration options for the Lit plugin
 * @returns A new LitPlugin instance
 */
export function litPlugin(options?: Omit<IntegrationPluginConfig, 'name'>): LitPlugin {
  return new LitPlugin(options);
}
