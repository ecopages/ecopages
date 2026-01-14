/**
 * This module contains the react plugin for Ecopages
 * @module
 */

import { IntegrationPlugin } from '@ecopages/core/plugins/integration-plugin';
import type { HmrStrategy } from '@ecopages/core/hmr/hmr-strategy';
import type { IHmrManager } from '@ecopages/core';
import { type AssetDefinition, AssetFactory } from '@ecopages/core/services/asset-processing-service';
import type React from 'react';
import { ReactRenderer } from './react-renderer';
import { ReactHmrStrategy } from './react-hmr-strategy';
import type { ReactRouterAdapter } from './router-adapter';

/**
 * Options for the React plugin
 */
export type ReactPluginOptions = {
	extensions?: string[];
	dependencies?: AssetDefinition[];
	/**
	 * Router adapter for SPA navigation.
	 * When provided, pages with layouts will be wrapped in the router for client-side navigation.
	 * @example
	 * ```ts
	 * import { ecoRouter } from '@ecopages/react-router';
	 * reactPlugin({ router: ecoRouter() })
	 * ```
	 */
	router?: ReactRouterAdapter;
};

/**
 * The name of the React plugin
 */
export const PLUGIN_NAME = 'react';

/**
 * The React plugin class
 * This plugin provides support for React components in Ecopages
 */
export class ReactPlugin extends IntegrationPlugin<React.JSX.Element> {
	renderer = ReactRenderer;
	routerAdapter: ReactRouterAdapter | undefined;

	constructor(options?: Omit<ReactPluginOptions, 'name'>) {
		super({
			name: PLUGIN_NAME,
			extensions: ['.tsx'],
			...options,
		});

		this.routerAdapter = options?.router;
		ReactRenderer.routerAdapter = this.routerAdapter;
		this.integrationDependencies.unshift(...this.getDependencies());
	}

	/**
	 * Provides React-specific HMR strategy with Fast Refresh support.
	 *
	 * @returns ReactHmrStrategy instance for handling React component updates
	 */
	override getHmrStrategy(): HmrStrategy | undefined {
		if (!this.hmrManager) {
			return undefined;
		}

		const hmrManager = this.hmrManager;

		const context = hmrManager.getDefaultContext();

		return new ReactHmrStrategy(context);
	}

	/**
	 * Override to register React-specific specifier mappings for HMR.
	 */
	override setHmrManager(hmrManager: IHmrManager): void {
		super.setHmrManager(hmrManager);
		hmrManager.registerSpecifierMap(this.getSpecifierMap());
	}

	private buildImportMapSourceUrl(fileName: string): string {
		return `/${AssetFactory.RESOLVED_ASSETS_VENDORS_DIR}/${fileName}`;
	}

	/**
	 * Returns the bare specifier to vendor URL mappings for React.
	 * Used for both the import map and HMR specifier replacement.
	 */
	private getSpecifierMap(): Record<string, string> {
		const map: Record<string, string> = {
			react: this.buildImportMapSourceUrl('react-esm.js'),
			'react/jsx-runtime': this.buildImportMapSourceUrl('react-esm.js'),
			'react/jsx-dev-runtime': this.buildImportMapSourceUrl('react-esm.js'),
			'react-dom': this.buildImportMapSourceUrl('react-dom-esm.js'),
			'react-dom/client': this.buildImportMapSourceUrl('react-esm.js'),
		};

		if (this.routerAdapter) {
			map[this.routerAdapter.importMapKey] = this.buildImportMapSourceUrl(
				`${this.routerAdapter.bundle.outputName}.js`,
			);
		}

		return map;
	}

	private getDependencies(): AssetDefinition[] {
		const deps: AssetDefinition[] = [
			AssetFactory.createInlineContentScript({
				position: 'head',
				bundle: false,
				content: JSON.stringify(
					{
						imports: this.getSpecifierMap(),
					},
					null,
					2,
				),
				attributes: {
					type: 'importmap',
				},
			}),
			AssetFactory.createNodeModuleScript({
				position: 'head',
				importPath: '@ecopages/react/react-esm.ts',
				name: 'react-esm',
				attributes: {
					type: 'module',
					defer: '',
				},
			}),
			AssetFactory.createNodeModuleScript({
				position: 'head',
				importPath: '@ecopages/react/react-dom-esm.ts',
				name: 'react-dom-esm',
				attributes: {
					type: 'module',
					defer: '',
				},
			}),
		];

		if (this.routerAdapter) {
			deps.push(
				AssetFactory.createNodeModuleScript({
					position: 'head',
					importPath: this.routerAdapter.bundle.importPath,
					name: this.routerAdapter.bundle.outputName,
					bundleOptions: {
						external: this.routerAdapter.bundle.externals,
					},
					attributes: {
						type: 'module',
						defer: '',
					},
				}),
			);
		}

		return deps;
	}
}

/**
 * Factory function to create a React plugin instance
 * @param options Configuration options for the React plugin
 * @returns A new ReactPlugin instance
 */
export function reactPlugin(options?: ReactPluginOptions): ReactPlugin {
	return new ReactPlugin(options);
}
