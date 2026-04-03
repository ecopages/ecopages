/**
 * This module contains the Lit plugin
 * @module
 */

import '@lit-labs/ssr/lib/install-global-dom-shim.js';
import './console';
import {
	IntegrationPlugin,
	type ComponentBoundaryPolicyInput,
	type IntegrationPluginConfig,
} from '@ecopages/core/plugins/integration-plugin';
import { type AssetDefinition, AssetFactory } from '@ecopages/core/services/asset-processing-service';
import { litElementHydrateScript } from './lit-element-hydrate.ts';
import { LitRenderer } from './lit-renderer.ts';

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
			staticBuildStep: 'fetch',
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
			 * The litElementHydrateScript is the same file built on Bun 1.1.45.
			 * https://github.com/oven-sh/bun/issues/17180
			 *
			 * AssetFactory.createNodeModuleScript({
			 *    position: 'head',
			 *    importPath: '@lit-labs/ssr-client/lit-element-hydrate-support.js'
			 * })
			 */
			AssetFactory.createInlineContentScript({
				position: 'head',
				content: litElementHydrateScript,
				bundle: false,
				attributes: {
					'data-eco-script-id': 'lit-hydrate-support',
				},
			}),
		];
	}

	/**
	 * Declares Lit's cross-integration boundary deferral rule.
	 *
	 * When a non-Lit render pass enters a Lit component boundary, the boundary is
	 * deferred into marker-graph resolution so Lit SSR can render custom elements,
	 * declarative shadow DOM, and other Lit-owned output through the Lit renderer.
	 *
	 * @param input Boundary metadata for the active render pass.
	 * @returns `true` when the boundary should be deferred into the marker pass.
	 */
	override shouldDeferComponentBoundary(input: ComponentBoundaryPolicyInput): boolean {
		return input.targetIntegration === this.name && input.currentIntegration !== this.name;
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
