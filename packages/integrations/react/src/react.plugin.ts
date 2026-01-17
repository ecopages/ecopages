/**
 * This module contains the react plugin for Ecopages
 * @module
 */

import { IntegrationPlugin } from '@ecopages/core/plugins/integration-plugin';
import type { HmrStrategy } from '@ecopages/core/hmr/hmr-strategy';
import type { IHmrManager } from '@ecopages/core/internal-types';
import { type AssetDefinition, AssetFactory } from '@ecopages/core/services/asset-processing-service';
import { Logger } from '@ecopages/logger';
import type { CompileOptions } from '@mdx-js/mdx';
import type React from 'react';
import { ReactRenderer } from './react-renderer.ts';
import { ReactHmrStrategy } from './react-hmr-strategy.ts';
import type { ReactRouterAdapter } from './router-adapter.ts';

const appLogger = new Logger('[ReactPlugin]');

/**
 * MDX configuration options for the React plugin
 */
export type ReactMdxOptions = {
	/**
	 * Whether to enable MDX support.
	 * @default false
	 */
	enabled: boolean;
	/**
	 * Compiler options for MDX.
	 * @default undefined
	 */
	compilerOptions?: Omit<CompileOptions, 'jsxImportSource' | 'jsxRuntime'>;
	/**
	 * Custom extensions to be treated as MDX files.
	 * @default ['.mdx']
	 */
	extensions?: string[];
};

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
	/**
	 * MDX configuration for handling .mdx files within the React plugin.
	 * When enabled, MDX files are treated as React pages with full router support.
	 * @example
	 * ```ts
	 * reactPlugin({
	 *   router: ecoRouter(),
	 *   mdx: {
	 *     enabled: true,
	 *     extensions: ['.mdx', '.md'],
	 *     compilerOptions: {
	 *       remarkPlugins: [remarkGfm],
	 *       rehypePlugins: [[rehypePrettyCode, { theme: '...' }]],
	 *     }
	 *   }
	 * })
	 * ```
	 */
	mdx?: ReactMdxOptions;
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
	private mdxEnabled: boolean;
	private mdxCompilerOptions?: CompileOptions;
	private mdxExtensions: string[];

	constructor(options?: Omit<ReactPluginOptions, 'name'>) {
		const extensions = ['.tsx'];
		const mdxExtensions = options?.mdx?.extensions ?? ['.mdx'];

		if (options?.mdx?.enabled) {
			extensions.push(...mdxExtensions);
		} else if (options?.mdx?.extensions?.length) {
			appLogger.warn(
				'MDX extensions provided but MDX is disabled. MDX files will not be processed. Set mdx.enabled to true to enable MDX support.',
			);
		}

		super({
			name: PLUGIN_NAME,
			extensions,
			...options,
		});

		this.mdxEnabled = options?.mdx?.enabled ?? false;
		this.mdxExtensions = mdxExtensions;

		if (this.mdxEnabled) {
			this.mdxCompilerOptions = {
				...options?.mdx?.compilerOptions,
				jsxImportSource: 'react',
				jsxRuntime: 'automatic',
				development: process.env.NODE_ENV === 'development',
			};
			appLogger.debug('MDX mode enabled with React jsx runtime');
		}

		this.routerAdapter = options?.router;
		ReactRenderer.routerAdapter = this.routerAdapter;
		ReactRenderer.mdxCompilerOptions = this.mdxCompilerOptions;
		ReactRenderer.mdxExtensions = this.mdxExtensions;
		this.integrationDependencies.unshift(...this.getDependencies());
	}

	override async setup(): Promise<void> {
		if (this.mdxEnabled && this.mdxCompilerOptions) {
			await this.setupMdxBunPlugin();
		}
		await super.setup();
	}

	/**
	 * Registers the MDX esbuild plugin with Bun for MDX file compilation.
	 * @remarks Uses esbuild plugin API which is compatible with Bun's plugin system.
	 */
	private async setupMdxBunPlugin(): Promise<void> {
		const mdx = (await import('@mdx-js/esbuild')).default;
		// @ts-expect-error esbuild plugin type is compatible with Bun plugin
		await Bun.plugin(mdx(this.mdxCompilerOptions));
		appLogger.debug('MDX Bun plugin registered');
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

		return new ReactHmrStrategy(context, this.mdxCompilerOptions);
	}

	/**
	 * Override to register React-specific specifier mappings for HMR.
	 */
	override setHmrManager(hmrManager: IHmrManager): void {
		super.setHmrManager(hmrManager);
		hmrManager.registerSpecifierMap(this.getSpecifierMap());
	}

	/**
	 * Constructs the URL path for vendor assets in the import map.
	 * @param fileName - The vendor file name
	 * @returns The resolved URL path for the vendor asset
	 */
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

	/**
	 * Builds the list of asset dependencies required for React integration.
	 * Includes import map, React ESM bundles, and router bundle if configured.
	 * @returns Array of asset definitions for the integration
	 */
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
