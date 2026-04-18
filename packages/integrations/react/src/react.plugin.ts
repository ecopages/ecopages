/**
 * This module contains the react plugin for Ecopages
 * @module
 */
import type { AssetDefinition } from '@ecopages/core/services/asset-processing-service';
import { IntegrationPlugin, type IntegrationPluginConfig } from '@ecopages/core/plugins/integration-plugin';
import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';
import type { HmrStrategy } from '@ecopages/core/hmr/hmr-strategy';
import { Logger } from '@ecopages/logger';
import type { CompileOptions } from '@mdx-js/mdx';
import type React from 'react';
import { REACT_PLUGIN_NAME } from './react.constants.ts';
import { ReactRenderer } from './react-renderer.ts';
import type { ReactMdxOptions, ReactPluginOptions, ReactRendererConfig } from './react.types.ts';
import { ReactHmrStrategy } from './react-hmr-strategy.ts';
import type { ReactRouterAdapter } from './router-adapter.ts';
import { ReactRuntimeBundleService } from './services/react-runtime-bundle.service.ts';
import { ReactHmrPageMetadataCache } from './services/react-hmr-page-metadata-cache.ts';

export type { ReactMdxOptions, ReactPluginOptions, ReactRendererConfig } from './react.types.ts';

const appLogger = new Logger('[ReactPlugin]');

type ResolvedReactPluginConfig = Omit<
	IntegrationPluginConfig,
	'name' | 'extensions' | 'jsxImportSource' | 'integrationDependencies'
> & {
	extensions: string[];
	integrationDependencies?: AssetDefinition[];
	rendererConfig: ReactRendererConfig;
};

/**
 * The name of the React plugin
 */
export const PLUGIN_NAME = REACT_PLUGIN_NAME;

const mergePluginLists = <T>(...lists: Array<readonly T[] | null | undefined>): T[] | undefined => {
	const merged = lists.flatMap((list) => (list ? [...list] : []));
	return merged.length > 0 ? merged : undefined;
};

const appendMdxExtensions = (target: string[], mdxExtensions: string[]): void => {
	for (const extension of mdxExtensions) {
		if (!target.includes(extension)) {
			target.push(extension);
		}
	}
};

/**
 * Resolves MDX compiler options for the React integration.
 *
 * React owns the JSX runtime fields for MDX route compilation so mixed route
 * graphs keep the same runtime contract as authored React page modules.
 */
const resolveReactMdxCompilerOptions = (mdxOptions: ReactMdxOptions): CompileOptions => {
	const { compilerOptions, remarkPlugins, rehypePlugins, recmaPlugins } = mdxOptions;
	const resolved: CompileOptions = {
		...compilerOptions,
		jsxImportSource: 'react',
		jsxRuntime: 'automatic',
		development: process.env.NODE_ENV === 'development',
	};

	const mergedRemark = mergePluginLists(compilerOptions?.remarkPlugins, remarkPlugins);
	const mergedRehype = mergePluginLists(compilerOptions?.rehypePlugins, rehypePlugins);
	const mergedRecma = mergePluginLists(compilerOptions?.recmaPlugins, recmaPlugins);

	if (mergedRemark) resolved.remarkPlugins = mergedRemark;
	if (mergedRehype) resolved.rehypePlugins = mergedRehype;
	if (mergedRecma) resolved.recmaPlugins = mergedRecma;

	return resolved;
};

/**
 * Resolves user-facing React plugin options into the internal plugin config.
 *
 * Defaults:
 * - `extensions`: `['.tsx']`
 * - `explicitGraph`: `false`
 * - `mdx.enabled`: `false`
 * - `mdx.extensions`: `['.mdx']`
 */
const resolveReactPluginOptions = (options?: ReactPluginOptions): ResolvedReactPluginConfig => {
	const { extensions: userExtensions, router, mdx, explicitGraph, dependencies, ...baseConfig } = options ?? {};
	const extensions = [...(userExtensions ?? ['.tsx'])];
	const mdxEnabled = mdx?.enabled ?? false;
	const mdxExtensions = mdx?.extensions ?? ['.mdx'];

	if (mdxEnabled) {
		appendMdxExtensions(extensions, mdxExtensions);
	} else if (mdx?.extensions?.length) {
		appLogger.warn(
			'MDX extensions provided but MDX is disabled. MDX files will not be processed. Set mdx.enabled to true to enable MDX support.',
		);
	}

	const rendererConfig: ReactRendererConfig = {
		routerAdapter: router,
		mdxCompilerOptions: mdxEnabled && mdx ? resolveReactMdxCompilerOptions(mdx) : undefined,
		mdxExtensions,
		hmrPageMetadataCache: new ReactHmrPageMetadataCache(),
		explicitGraphEnabled: explicitGraph ?? false,
	};

	return {
		...baseConfig,
		extensions,
		integrationDependencies: dependencies,
		rendererConfig,
	};
};

/**
 * The React plugin class
 * This plugin provides support for React components in Ecopages
 */
export class ReactPlugin extends IntegrationPlugin<React.JSX.Element> {
	renderer = ReactRenderer;
	private readonly routerAdapter: ReactRouterAdapter | undefined;
	private readonly mdxEnabled: boolean;
	private readonly mdxCompilerOptions?: CompileOptions;
	private readonly mdxExtensions: string[];
	private mdxLoaderPlugin: EcoBuildPlugin | undefined;
	private readonly runtimeBundleService: ReactRuntimeBundleService;
	private readonly hmrPageMetadataCache: ReactHmrPageMetadataCache;
	private runtimeDependenciesInitialized = false;
	/**
	 * Indicates whether React explicit graph mode is enabled for renderer/HMR behavior.
	 */
	private readonly explicitGraphEnabled: boolean;
	private readonly rendererConfig: ReactRendererConfig;

	constructor(options?: ReactPluginOptions) {
		const config = resolveReactPluginOptions(options);
		const { extensions, rendererConfig, integrationDependencies, ...baseConfig } = config;

		super({
			name: PLUGIN_NAME,
			extensions,
			jsxImportSource: 'react',
			integrationDependencies,
			...baseConfig,
		});

		this.routerAdapter = rendererConfig.routerAdapter;
		this.mdxCompilerOptions = rendererConfig.mdxCompilerOptions;
		this.mdxEnabled = Boolean(rendererConfig.mdxCompilerOptions);
		this.mdxExtensions = rendererConfig.mdxExtensions ?? ['.mdx'];
		this.hmrPageMetadataCache = rendererConfig.hmrPageMetadataCache ?? new ReactHmrPageMetadataCache();
		this.explicitGraphEnabled = rendererConfig.explicitGraphEnabled ?? false;
		this.rendererConfig = {
			...rendererConfig,
			mdxExtensions: this.mdxExtensions,
			hmrPageMetadataCache: this.hmrPageMetadataCache,
			explicitGraphEnabled: this.explicitGraphEnabled,
		};

		if (this.mdxEnabled) {
			appLogger.debug('MDX mode enabled with React jsx runtime');
		}

		this.runtimeBundleService = new ReactRuntimeBundleService({
			routerAdapter: this.routerAdapter,
		});
	}

	/**
	 * Creates a React renderer with instance-owned runtime configuration.
	 *
	 * React renderers depend on plugin-owned router, MDX, and HMR metadata state.
	 * Keeping that state on the instance avoids cross-plugin static mutation while
	 * preserving the same runtime services the base initializer wires up.
	 */
	override initializeRenderer(options?: { rendererModules?: unknown }): ReactRenderer {
		const renderer = new this.renderer({
			...this.createRendererOptions(options),
			reactConfig: this.rendererConfig,
		});
		return this.attachRendererRuntimeServices(renderer);
	}

	private ensureRuntimeDependencies(): void {
		if (this.runtimeDependenciesInitialized) {
			return;
		}

		this.runtimeBundleService.setRootDir(this.appConfig?.rootDir);

		this.integrationDependencies.unshift(...this.runtimeBundleService.getDependencies());
		this.runtimeDependenciesInitialized = true;
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
		this.ensureRuntimeDependencies();
		await this.ensureMdxLoaderPlugin();
	}

	/**
	 * Performs runtime-only React setup after build contributions are already
	 * materialized.
	 */
	override async setup(): Promise<void> {
		this.ensureRuntimeDependencies();
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
			this.extensions,
			this.appConfig.templatesExt,
			this.explicitGraphEnabled,
		);
	}

	override getRuntimeSpecifierMap(): Record<string, string> {
		return this.runtimeBundleService.getSpecifierMap();
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
