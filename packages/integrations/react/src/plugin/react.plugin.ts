/**
 * This module contains the react plugin for Ecopages
 * @module
 */
import type { AssetDefinition } from '@ecopages/core/services/asset-processing-service';
import {
	IntegrationPlugin,
	type EcoBuildPlugin,
	type IntegrationPluginConfig,
} from '@ecopages/core/plugins/integration-plugin';
import type { BrowserRuntimeManifest } from '@ecopages/core/build/browser-runtime-manifest';
import type { HmrStrategy } from '@ecopages/core/hmr/hmr-strategy';
import { Logger } from '@ecopages/logger';
import type { CompileOptions } from '@mdx-js/mdx';
import path from 'node:path';
import type React from 'react';
import { REACT_PLUGIN_NAME } from './react.constants.ts';
import { ReactRenderer } from '../render/react-renderer.ts';
import type { ReactMdxOptions, ReactPluginOptions, ReactRendererConfig } from './react.types.ts';
import { ReactHmrStrategy } from '../hmr/hmr-strategy.ts';
import type { ReactRouterAdapter } from '../contracts/router-adapter.ts';
import { RuntimeBundleService } from '../bundling/runtime-bundle.ts';
import { HmrPageMetadataCache } from '../hmr/page-metadata-cache.ts';
import { createReactMdxLoaderPlugin } from '../mdx/mdx-loader-plugin.ts';
import { appendMdxExtensions, resolveMdxCompilerOptions } from '@ecopages/mdx/core';
import { ClientGraphBoundaryCache } from '../client-graph/boundary-cache.ts';
import { discoverLayoutRuntimeModuleSpecifiers } from '../bundling/discover-layout-runtime-modules.ts';
import {
	mergeReactPluginRuntimeModules,
	resolveReactPluginRuntimeModules,
} from '../bundling/runtime-modules.ts';

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

const resolveReactMdxCompilerOptions = (mdxOptions: ReactMdxOptions): CompileOptions =>
	resolveMdxCompilerOptions(mdxOptions, { jsxImportSource: 'react' });

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
	const mdxEnabled = mdx?.enabled ?? false;
	const mdxExtensions = mdx?.extensions ?? ['.mdx'];
	const resolvedRuntimeModules = resolveReactPluginRuntimeModules(runtimeModules);

	if (mdxEnabled) {
		appendMdxExtensions(extensions, mdxExtensions);
	} else if (mdx?.extensions?.length) {
		appLogger.warn(
			'MDX extensions provided but MDX is disabled. MDX files will not be processed. Set mdx.enabled to true to enable MDX support.',
		);
	}

	const rendererConfig: ReactRendererConfig = {
		routerAdapter: router,
		runtimeModules: resolvedRuntimeModules,
		mdxCompilerOptions: mdxEnabled && mdx ? resolveReactMdxCompilerOptions(mdx) : undefined,
		mdxExtensions,
		hmrPageMetadataCache: new HmrPageMetadataCache(),
		forceBrowserGraph: explicitGraph ?? false,
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
export class ReactPlugin extends IntegrationPlugin<React.ReactNode> {
	renderer = ReactRenderer;
	private readonly routerAdapter: ReactRouterAdapter | undefined;
	private readonly mdxEnabled: boolean;
	private readonly mdxCompilerOptions?: CompileOptions;
	private readonly mdxExtensions: string[];
	private mdxLoaderPlugin: EcoBuildPlugin | undefined;
	private readonly runtimeBundleService: RuntimeBundleService;
	private readonly hmrPageMetadataCache: HmrPageMetadataCache;
	private readonly clientGraphBoundaryCache: ClientGraphBoundaryCache;
	private hmrStrategy?: ReactHmrStrategy;
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
		this.hmrPageMetadataCache = rendererConfig.hmrPageMetadataCache ?? new HmrPageMetadataCache();
		this.clientGraphBoundaryCache = new ClientGraphBoundaryCache();
		this.forceBrowserGraph = rendererConfig.forceBrowserGraph ?? false;
		this.rendererConfig = {
			...rendererConfig,
			mdxExtensions: this.mdxExtensions,
			hmrPageMetadataCache: this.hmrPageMetadataCache,
			forceBrowserGraph: this.forceBrowserGraph,
		};

		if (this.mdxEnabled) {
			appLogger.debug('MDX mode enabled with React jsx runtime');
		}

		this.runtimeBundleService = new RuntimeBundleService({
			routerAdapter: this.routerAdapter,
			runtimeModules: this.rendererConfig.runtimeModules,
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
		this.runtimeBundleService.setWorkDir(
			this.appConfig?.absolutePaths?.workDir ??
				(this.appConfig?.rootDir
					? path.join(this.appConfig.rootDir, this.appConfig.workDir ?? '.eco')
					: undefined),
		);
		this.runtimeBundleService.setRuntimeModules(this.resolveEffectiveRuntimeModules());

		this.integrationDependencies.unshift(...this.runtimeBundleService.getDependencies());
		this.runtimeDependenciesInitialized = true;
	}

	private resolveEffectiveRuntimeModules() {
		const manualModules = this.rendererConfig.runtimeModules ?? [];
		if (!this.routerAdapter || !this.appConfig) {
			return manualModules;
		}

		const discovery = discoverLayoutRuntimeModuleSpecifiers({
			searchDirs: [this.appConfig.absolutePaths.layoutsDir, this.appConfig.absolutePaths.componentsDir].filter(
				Boolean,
			),
			projectRoot: this.appConfig.absolutePaths.projectDir,
			routerImportPath: this.routerAdapter.bundle.importPath,
		});

		const merged = mergeReactPluginRuntimeModules(manualModules, discovery.specifiers);
		this.rendererConfig.runtimeModules = merged;

		if (discovery.mode === 'provider-scoped-fallback') {
			appLogger.debug(
				'Layout runtime auto-vendoring is using provider-scoped fallback discovery. Set runtimeProvider: true on provider root layouts to scope discovery explicitly.',
			);
		}

		if (discovery.specifiers.length > 0) {
			appLogger.debug(
				`Auto-vendoring layout runtime modules for persisted SPA layouts: ${discovery.specifiers.join(', ')}`,
			);
		}

		return merged;
	}

	override get plugins(): EcoBuildPlugin[] {
		if (this.mdxLoaderPlugin) {
			return [this.mdxLoaderPlugin];
		}
		return [];
	}

	override get browserRuntimeManifest(): BrowserRuntimeManifest {
		this.ensureRuntimeDependencies();
		return this.runtimeBundleService.getRuntimeManifest();
	}

	/**
	 * Ensures the optional React MDX loader exists before either config-time
	 * manifest sealing or runtime setup needs it.
	 */
	private async ensureMdxLoaderPlugin(): Promise<void> {
		if (!this.mdxEnabled || !this.mdxCompilerOptions || this.mdxLoaderPlugin) {
			return;
		}

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

		if (!this.hmrStrategy) {
			this.hmrStrategy = new ReactHmrStrategy({
				context: this.hmrManager.getDefaultContext(),
				pageMetadataCache: this.hmrPageMetadataCache,
				runtimeManifest: this.runtimeBundleService.getRuntimeManifest('development'),
				mdxCompilerOptions: this.mdxCompilerOptions,
				ownedTemplateExtensions: this.extensions,
				allTemplateExtensions: this.appConfig.templatesExt,
				clientGraphBoundaryCache: this.clientGraphBoundaryCache,
			});
		}

		return this.hmrStrategy;
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
