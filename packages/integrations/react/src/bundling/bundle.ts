/**
 * Bundle configuration service for React integration.
 *
 * Encapsulates all build plugin creation and bundle options
 * for client-side React component builds.
 *
 * @module
 */

import { createClientGraphBoundaryPlugin } from '../client-graph/boundary-plugin.ts';
import { getReactClientGraphAllowSpecifiers, getReactRuntimeExternalSpecifiers } from './runtime-alias-map.ts';
import { createBrowserRuntimePlugin } from '@ecopages/core/build/browser-runtime-plugin';
import { getHostScopedJsxOwnershipPlugins } from '@ecopages/core/build/jsx-ownership-plugins';
import type { EcoPagesAppConfig } from '@ecopages/core';
import type { ReactRouterAdapter } from '../contracts/router-adapter.ts';
import type { CompileOptions } from '@mdx-js/mdx';
import { RuntimeBundleService, type ReactRuntimeImports } from './runtime-bundle.ts';
import type { ResolvedReactPluginRuntimeModule } from './runtime-modules.ts';
import { createReactMdxLoaderPlugin } from '../mdx/mdx-loader-plugin.ts';
import { isReactProductionRuntime } from './runtime-mode.ts';

/**
 * Configuration for the BundleService.
 */
export interface BundleServiceConfig {
	rootDir: string;
	appConfig: EcoPagesAppConfig;
	hostIntegrationName: string;
	routerAdapter?: ReactRouterAdapter;
	runtimeModules?: ResolvedReactPluginRuntimeModule[];
	mdxCompilerOptions?: CompileOptions;
}

/**
 * Optional flags that adjust how a React client entry is bundled.
 */
export interface ReactClientBundleOptions {
	/**
	 * When `true`, bundle React runtime dependencies into the emitted entry instead of
	 * rewriting them to external runtime specifiers.
	 */
	includeRuntime?: boolean;
	/**
	 * When set, overrides the build adapter chunk splitting mode for this entry.
	 */
	splitting?: boolean;
}

/**
 * Manages bundle configuration and plugin creation for React page/component builds.
 */
export class BundleService {
	private readonly runtimeBundleService: RuntimeBundleService;
	private readonly config: BundleServiceConfig;

	constructor(config: BundleServiceConfig) {
		this.config = config;
		this.runtimeBundleService = new RuntimeBundleService({
			rootDir: config.rootDir,
			routerAdapter: config.routerAdapter,
			runtimeModules: config.runtimeModules,
		});
	}

	/**
	 * Returns resolved runtime import paths for the React runtime.
	 */
	getRuntimeImports(): ReactRuntimeImports {
		return this.runtimeBundleService.getRuntimeImports();
	}

	/**
	 * Creates bundle options for a page or component entry.
	 *
	 * @remarks
	 * React derives runtime specifier mappings from the core browser runtime manifest
	 * so ESM imports resolve to concrete runtime asset URLs during module loading.
	 *
	 * @param componentName - Generated unique component name for output naming
	 * @param isMdx - Whether the source file is an MDX file
	 * @param declaredModules - Explicitly declared browser module specifiers
	 * @returns Bundle options object for the build adapter
	 */
	async createBundleOptions(
		componentName: string,
		isMdx: boolean,
		declaredModules: string[],
		bundleOptions: ReactClientBundleOptions = {},
	): Promise<Record<string, unknown>> {
		const runtimeImports = this.getRuntimeImports();
		const options: Record<string, unknown> = {
			mainFields: ['module', 'browser', 'main'],
			naming: `${componentName}.[ext]`,
			...(isReactProductionRuntime() && {
				minify: true,
				treeshaking: true,
			}),
			...(bundleOptions.splitting === undefined ? {} : { splitting: bundleOptions.splitting }),
		};

		if (!bundleOptions.includeRuntime) {
			const reactRuntimeSpecifiers = new Set(getReactRuntimeExternalSpecifiers());
			options.external = [
				...Object.values(runtimeImports).filter(
					(specifier): specifier is string =>
						Boolean(specifier) &&
						!reactRuntimeSpecifiers.has(
							specifier as typeof getReactRuntimeExternalSpecifiers extends () => infer T
								? T extends readonly (infer U)[]
									? U
									: never
								: never,
						),
				),
			];
		}

		const graphBoundaryPlugin = createClientGraphBoundaryPlugin({
			projectRoot: this.config.appConfig?.absolutePaths?.projectDir ?? this.config.rootDir,
			absWorkingDir: this.config.rootDir,
			declaredModules,
			alwaysAllowSpecifiers: getReactClientGraphAllowSpecifiers(
				this.runtimeBundleService.getConfiguredRuntimeModuleSpecifiers(),
				this.config.routerAdapter,
			),
		});

		const [foreignJsxOverridePlugin] = getHostScopedJsxOwnershipPlugins(
			this.config.appConfig,
			this.config.hostIntegrationName,
			{ name: 'react-renderer-foreign-jsx-override' },
		);
		const runtimeManifest = this.runtimeBundleService.getRuntimeManifest();
		const runtimeRewritePlugin = createBrowserRuntimePlugin({
			name: 'react-renderer-runtime-import-rewrite',
			manifest: runtimeManifest,
		});
		const runtimePlugins = bundleOptions.includeRuntime
			? []
			: [runtimeRewritePlugin].filter((plugin): plugin is NonNullable<typeof plugin> => plugin !== null);

		if (isMdx && this.config.mdxCompilerOptions) {
			const mdxPlugin = createReactMdxLoaderPlugin(this.config.mdxCompilerOptions);
			options.plugins = [
				...(foreignJsxOverridePlugin ? [foreignJsxOverridePlugin] : []),
				graphBoundaryPlugin,
				...runtimePlugins,
				mdxPlugin,
			];
		} else {
			options.plugins = [
				...(foreignJsxOverridePlugin ? [foreignJsxOverridePlugin] : []),
				graphBoundaryPlugin,
				...runtimePlugins,
			];
		}

		return options;
	}
}
