/**
 * This module contains the react plugin for Ecopages
 * @module
 */
import { requireAppRuntime } from '@ecopages/core/integration';
import type { AssetDefinition } from '@ecopages/core/integration';
import {
	IntegrationPlugin,
	type IntegrationRendererBase,
	type IntegrationRuntimeContext,
	type EcoBuildPlugin,
	type IntegrationPluginConfig,
} from '@ecopages/core/integration';
import { Logger } from '@ecopages/logger';
import type { CompileOptions } from '@mdx-js/mdx';
import path from 'node:path';
import type React from 'react';
import { REACT_PLUGIN_NAME } from './react.constants.ts';
import { ReactRenderer } from '../render/react-renderer.ts';
import type { ReactMdxOptions, ReactPluginOptions, ReactRendererConfig } from './react.types.ts';
import { ReactHmrStrategy } from '../hmr/hmr-strategy.ts';
import { ReactDevTransformContributor } from '../dev-transform/react-dev-transform-contributor.ts';
import type { ReactRouterAdapter } from '../contracts/router-adapter.ts';
import { RuntimeBundleService } from '../bundling/runtime-bundle.ts';
import { HmrPageMetadataCache } from '../hmr/page-metadata-cache.ts';
import { createReactMdxLoaderPlugin } from '../mdx/mdx-loader-plugin.ts';
import { appendMdxExtensions, resolveMdxCompilerOptions } from '@ecopages/mdx/core';
import { resolveReactPluginRuntimeModules } from '../bundling/runtime-modules.ts';

export type { ReactMdxOptions, ReactPluginOptions, ReactRendererConfig } from './react.types.ts';

const appLogger = new Logger('[ReactPlugin]');

type ResolvedReactPluginConfig = Omit<
	IntegrationPluginConfig,
	'name' | 'extensions' | 'jsxImportSource' | 'integrationDependencies'
> & {
	extensions: string[];
	integrationDependencies?: AssetDefinition[];
	mdxCompilerOptions?: CompileOptions;
	rendererConfig: ReactRendererConfig;
};

/**
 * The name of the React plugin
 */
export const PLUGIN_NAME = REACT_PLUGIN_NAME;

const resolveReactMdxCompilerOptions = (mdxOptions: ReactMdxOptions): CompileOptions =>
	resolveMdxCompilerOptions(mdxOptions, { jsxImportSource: 'react' });

/**
 * Resolves user-facing React plugin options into the internal plugin config.
 *
 * Defaults:
 * - `extensions`: `['.tsx']`
 * - `explicitGraph`: `false`
 * - MDX is disabled when `mdx` is omitted
 * - `mdx.extensions`: `['.mdx']`
 */
const resolveReactPluginOptions = (options?: ReactPluginOptions): ResolvedReactPluginConfig => {
	const {
		extensions: userExtensions,
		router,
		mdx,
		explicitGraph,
		dependencies,
		runtimeModules,
		...baseConfig
	} = options ?? {};
	const extensions = [...(userExtensions ?? ['.tsx'])];
	const mdxEnabled = mdx !== undefined;
	const mdxExtensions = mdx?.extensions ?? ['.mdx'];
	const resolvedRuntimeModules = resolveReactPluginRuntimeModules(runtimeModules);

	if (mdxEnabled) {
		appendMdxExtensions(extensions, mdxExtensions);
	}

	const rendererConfig: ReactRendererConfig = {
		routerAdapter: router,
		runtimeModules: resolvedRuntimeModules,
		mdxExtensions,
		hmrPageMetadataCache: new HmrPageMetadataCache(),
		forceBrowserGraph: explicitGraph ?? false,
	};

	return {
		...baseConfig,
		extensions,
		integrationDependencies: dependencies,
		mdxCompilerOptions: mdxEnabled && mdx ? resolveReactMdxCompilerOptions(mdx) : undefined,
		rendererConfig,
	};
};

/**
 * The React plugin class
 * This plugin provides support for React components in Ecopages
 */
export class ReactPlugin extends IntegrationPlugin<React.ReactNode> {
	renderer = ReactRenderer;
	override readonly bundlesPageDependencies = true;
	private readonly routerAdapter: ReactRouterAdapter | undefined;
	private readonly mdxExtensions: string[];
	private readonly mdxCompilerOptions: CompileOptions | undefined;
	private readonly getMdxLoaderPlugin?: () => EcoBuildPlugin;
	private readonly runtimeBundleService: RuntimeBundleService;
	private readonly hmrPageMetadataCache: HmrPageMetadataCache;
	private runtimeDependenciesInitialized = false;
	/**
	 * When true, always emit page browser graph / hydration assets.
	 *
	 * @remarks
	 * Mapped from public `explicitGraph`. Does not skip client-graph AST stripping.
	 */
	private readonly forceBrowserGraph: boolean;
	private readonly rendererConfig: ReactRendererConfig;

	constructor(options?: ReactPluginOptions) {
		const config = resolveReactPluginOptions(options);
		const { extensions, rendererConfig, integrationDependencies, mdxCompilerOptions, ...baseConfig } = config;
		const runtimeBundleService = new RuntimeBundleService({
			routerAdapter: rendererConfig.routerAdapter,
			runtimeModules: rendererConfig.runtimeModules,
		});

		super({
			name: PLUGIN_NAME,
			extensions,
			jsxImportSource: 'react',
			integrationDependencies,
			browserRuntimeManifest: runtimeBundleService.getRuntimeManifest(),
			...baseConfig,
		});

		this.routerAdapter = rendererConfig.routerAdapter;
		this.mdxCompilerOptions = mdxCompilerOptions;
		this.getMdxLoaderPlugin = mdxCompilerOptions
			? () => {
					if (!this.appConfig?.rootDir) {
						throw new Error('[ReactPlugin] Cannot create MDX loader: appConfig.rootDir is required.');
					}
					const plugin = this.runtime?.buildManifest.server.find((item) => item.name === 'react-mdx-loader');
					if (!plugin) {
						throw new Error('[ReactPlugin] The app build manifest does not contain the React MDX loader.');
					}
					return plugin;
				}
			: undefined;
		this.mdxExtensions = rendererConfig.mdxExtensions ?? ['.mdx'];
		this.hmrPageMetadataCache = rendererConfig.hmrPageMetadataCache ?? new HmrPageMetadataCache();
		this.forceBrowserGraph = rendererConfig.forceBrowserGraph ?? false;
		this.rendererConfig = {
			...rendererConfig,
			getMdxLoaderPlugin: this.getMdxLoaderPlugin,
			mdxExtensions: this.mdxExtensions,
			hmrPageMetadataCache: this.hmrPageMetadataCache,
			forceBrowserGraph: this.forceBrowserGraph,
		};

		if (mdxCompilerOptions) {
			appLogger.debug('MDX mode enabled with React jsx runtime');
		}

		this.runtimeBundleService = runtimeBundleService;
	}

	/**
	 * Creates a React renderer with instance-owned runtime configuration.
	 *
	 * React renderers depend on plugin-owned router, MDX, and HMR metadata state.
	 * Keeping that state on the instance avoids cross-plugin static mutation while
	 * preserving the same runtime services the base initializer wires up.
	 */
	override createRenderer(base: IntegrationRendererBase): ReactRenderer {
		const renderer = new this.renderer({
			...base,
			reactConfig: this.rendererConfig,
		});
		renderer.name ||= this.name;
		return renderer;
	}

	private ensureRuntimeDependencies(appConfig: IntegrationRuntimeContext['appConfig']): void {
		if (this.runtimeDependenciesInitialized) {
			return;
		}

		this.runtimeBundleService.setRootDir(appConfig.rootDir);
		this.runtimeBundleService.setWorkDir(
			appConfig.absolutePaths.workDir ?? path.join(appConfig.rootDir, appConfig.workDir ?? '.eco'),
		);
		this.runtimeBundleService.setRuntimeModules(this.rendererConfig.runtimeModules ?? []);

		this.integrationDependencies.unshift(...this.runtimeBundleService.getDependencies());
		this.runtimeDependenciesInitialized = true;
	}

	/**
	 * Returns the MDX loader when MDX is enabled.
	 *
	 * @remarks
	 * The loader is created on the first read for an app runtime and kept, because the renderer and the HMR
	 * strategy reuse the instance the build manifest holds.
	 */
	override plugins(app: IntegrationRuntimeContext['appConfig']): EcoBuildPlugin[] {
		const loader = this.mdxCompilerOptions ? this.resolveMdxLoaderPlugin(this.mdxCompilerOptions, app) : undefined;
		return loader ? [loader] : [];
	}

	private resolveMdxLoaderPlugin(
		compilerOptions: CompileOptions,
		appConfig: IntegrationRuntimeContext['appConfig'],
	): EcoBuildPlugin {
		const requestPipelineMetrics = requireAppRuntime(appConfig).requestPipelineMetrics;
		return createReactMdxLoaderPlugin({
			compilerOptions,
			projectRoot: appConfig.rootDir,
			requestPipelineMetrics,
		});
	}

	/**
	 * Adds the React runtime vendor assets to the global dependencies, then processes them.
	 */
	override async setup(context: IntegrationRuntimeContext): Promise<void> {
		this.ensureRuntimeDependencies(context.appConfig);
		await super.setup(context);
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
	override hmr(context: IntegrationRuntimeContext): void {
		super.hmr(context);
		const manager = context.runtime.hmr;
		if (!manager) return;
		const strategy = new ReactHmrStrategy({
			context: manager.getDefaultContext(),
			projectRoot: context.appConfig.rootDir,
			pageMetadataCache: this.hmrPageMetadataCache,
			runtimeManifest: this.runtimeBundleService.getRuntimeManifest('development'),
			getMdxLoaderPlugin: this.getMdxLoaderPlugin,
			ownedTemplateExtensions: this.extensions,
			allTemplateExtensions: context.appConfig.templatesExt,
		});
		manager.registerStrategy(strategy);
		manager.registerDevTransformContributor(
			new ReactDevTransformContributor({
				strategy: strategy as ReactHmrStrategy,
			}),
		);
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
