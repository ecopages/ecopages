/**
 * This module contains the Lit plugin
 * @module
 */

import './console';
import { IntegrationPlugin, type IntegrationPluginConfig } from '@ecopages/core/plugins/integration-plugin';
import { type AssetDefinition, AssetFactory } from '@ecopages/core/services/asset-processing-service';
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
	renderer = LitRenderer;

	constructor(options?: Omit<IntegrationPluginConfig, 'name'>) {
		super({
			name: PLUGIN_NAME,
			extensions: ['.lit.tsx'],
			...options,
		});

		this.integrationDependencies.unshift(...this.getDependencies());
	}

	getDependencies(): AssetDefinition[] {
		return [
			/**
			 * BUG ALERT
			 * Due to an issue appeared in Bun 1.2.2, we need to use a workaround to import the hydrate script.
			 * This is a temporary solution until the issue is resolved.
			 * The litElementHydrateScript is the same file built on Bun 1.4.5.
			 * https://github.com/oven-sh/bun/issues/17180
			 *
			 * AssetFactory.createNodeModuleScriptAsset({
			 *    position: 'head',
			 *    importPath: '@lit-labs/ssr-client/lit-element-hydrate-support.js'
			 * })
			 */
			AssetFactory.createInlineContentScript({
				position: 'head',
				content: litElementHydrateScript,
				bundle: false,
			}),
		];
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
