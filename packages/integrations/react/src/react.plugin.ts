/**
 * This module contains the react plugin for Ecopages
 * @module
 */
import { IntegrationPlugin } from '@ecopages/core/plugins/integration-plugin';
import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';
import type { HmrStrategy } from '@ecopages/core/hmr/hmr-strategy';
import type { IHmrManager } from '@ecopages/core/internal-types';
import type { AssetDefinition } from '@ecopages/core/services/asset-processing-service';
import { Logger } from '@ecopages/logger';
import type { CompileOptions } from '@mdx-js/mdx';
import type React from 'react';
import { ReactRenderer } from './react-renderer.ts';
import { ReactHmrStrategy } from './react-hmr-strategy.ts';
import type { ReactRouterAdapter } from './router-adapter.ts';
import type { ComponentBoundaryPolicyInput } from '@ecopages/core/plugins/integration-plugin';
import { ReactRuntimeBundleService } from './services/react-runtime-bundle.service.ts';
import { ReactHmrPageMetadataCache } from './services/react-hmr-page-metadata-cache.ts';

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
	 * Remark plugins.
	 * @default undefined
	 */
	remarkPlugins?: CompileOptions['remarkPlugins'];
	/**
	 * Rehype plugins.
	 * @default undefined
	 */
	rehypePlugins?: CompileOptions['rehypePlugins'];
	/**
	 * Recma plugins.
	 * @default undefined
	 */
	recmaPlugins?: CompileOptions['recmaPlugins'];
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
	 * Enables explicit client graph mode for React page entries.
	 *
	 * When enabled, React page-entry bundling relies on explicit dependency declarations
	 * and skips AST-based `middleware`/`requires` stripping in the React path.
	 * @default false
	 */
	explicitGraph?: boolean;
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
	 *     remarkPlugins: [remarkGfm],
	 *     rehypePlugins: [[rehypePrettyCode, { theme: '...' }]],
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
	private mdxLoaderPlugin: EcoBuildPlugin | undefined;
	private runtimeBundleService: ReactRuntimeBundleService;
	private readonly hmrPageMetadataCache = new ReactHmrPageMetadataCache();
	/**
	 * Indicates whether React explicit graph mode is enabled for renderer/HMR behavior.
	 */
	private explicitGraphEnabled: boolean;

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
			const { compilerOptions, remarkPlugins, rehypePlugins, recmaPlugins } = options?.mdx || {};
			this.mdxCompilerOptions = {
				...compilerOptions,
				remarkPlugins: [...(compilerOptions?.remarkPlugins || []), ...(remarkPlugins || [])],
				rehypePlugins: [...(compilerOptions?.rehypePlugins || []), ...(rehypePlugins || [])],
				recmaPlugins: [...(compilerOptions?.recmaPlugins || []), ...(recmaPlugins || [])],
				jsxImportSource: 'react',
				jsxRuntime: 'automatic',
				development: process.env.NODE_ENV === 'development',
			};
			appLogger.debug('MDX mode enabled with React jsx runtime');
		}

		this.routerAdapter = options?.router;
		this.runtimeBundleService = new ReactRuntimeBundleService({
			routerAdapter: this.routerAdapter,
		});
		this.explicitGraphEnabled = options?.explicitGraph ?? false;
		ReactRenderer.routerAdapter = this.routerAdapter;
		ReactRenderer.mdxCompilerOptions = this.mdxCompilerOptions;
		ReactRenderer.mdxExtensions = this.mdxExtensions;
		ReactRenderer.explicitGraphEnabled = this.explicitGraphEnabled;
		ReactRenderer.hmrPageMetadataCache = this.hmrPageMetadataCache;
		this.integrationDependencies.unshift(...this.runtimeBundleService.getDependencies());
	}

	override get plugins(): EcoBuildPlugin[] {
		if (this.mdxLoaderPlugin) {
			return [this.mdxLoaderPlugin];
		}
		return [];
	}

	/**
	 * Ensures the optional React MDX loader exists before either config-time
	 * manifest sealing or runtime setup needs it.
	 */
	private async ensureMdxLoaderPlugin(): Promise<void> {
		if (!this.mdxEnabled || !this.mdxCompilerOptions || this.mdxLoaderPlugin) {
			return;
		}

		const { createReactMdxLoaderPlugin } = await import('./utils/react-mdx-loader-plugin.ts');
		this.mdxLoaderPlugin = createReactMdxLoaderPlugin(this.mdxCompilerOptions);
	}

	/**
	 * Prepares React's build-facing loader contributions before config build seals
	 * the app manifest.
	 */
	override async prepareBuildContributions(): Promise<void> {
		await this.ensureMdxLoaderPlugin();
	}

	/**
	 * Performs runtime-only React setup after build contributions are already
	 * materialized.
	 */
	override async setup(): Promise<void> {
		await this.ensureMdxLoaderPlugin();
		await super.setup();
	}

	/**
	 * Provides React-specific HMR strategy with Fast Refresh support.
	 *
	 * The strategy shares a React-only page metadata cache with the renderer so
	 * save-time rebuilds can reuse declared-module analysis without expanding the
	 * core HMR interfaces.
	 *
	 * @returns ReactHmrStrategy instance for handling React component updates
	 */
	override getHmrStrategy(): HmrStrategy | undefined {
		if (!this.hmrManager || !this.appConfig) {
			return undefined;
		}

		const context = this.hmrManager.getDefaultContext();

		return new ReactHmrStrategy(
			context,
			this.hmrPageMetadataCache,
			this.mdxCompilerOptions,
			this.explicitGraphEnabled,
		);
	}

	/**
	 * Override to register React-specific specifier mappings for HMR.
	 */
	override setHmrManager(hmrManager: IHmrManager): void {
		super.setHmrManager(hmrManager);
		hmrManager.registerSpecifierMap(this.runtimeBundleService.getSpecifierMap());
	}

	/**
	 * Declares React's boundary deferral rule for cross-integration rendering.
	 *
	 * React defers when a render pass owned by another integration enters a React
	 * component boundary. That boundary is then resolved later through the marker
	 * graph stage using the React renderer.
	 *
	 * @param input Boundary metadata for the active render pass.
	 * @returns `true` when the boundary should be deferred into the marker pass.
	 */
	override shouldDeferComponentBoundary(input: ComponentBoundaryPolicyInput): boolean {
		return input.targetIntegration === this.name && input.currentIntegration !== this.name;
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
