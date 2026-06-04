/**
 * Bundle configuration service for React integration.
 *
 * Encapsulates all esbuild plugin creation and bundle options
 * for client-side React component builds.
 *
 * @module
 */

import { createClientGraphBoundaryPlugin } from '../utils/client-graph-boundary-plugin.ts';
import {
	getReactClientGraphAllowSpecifiers,
	getReactRuntimeExternalSpecifiers,
} from '../utils/react-runtime-alias-map.ts';
import { createBrowserRuntimeImportRewritePlugin } from '@ecopages/core/build/browser-runtime-import-rewrite-plugin';
import { createForeignJsxOverridePlugin } from '@ecopages/core/plugins/foreign-jsx-override-plugin';
import type { ReactRouterAdapter } from '../router-adapter.ts';
import type { CompileOptions } from '@mdx-js/mdx';
import { ReactRuntimeBundleService, type ReactRuntimeImports } from './react-runtime-bundle.service.ts';
import { createReactMdxLoaderPlugin } from '../utils/react-mdx-loader-plugin.ts';

/**
 * Configuration for the ReactBundleService.
 */
export interface ReactBundleServiceConfig {
	rootDir: string;
	routerAdapter?: ReactRouterAdapter;
	mdxCompilerOptions?: CompileOptions;
	nonReactExtensions?: string[];
	jsxImportSource?: string;
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
 * Manages esbuild bundle configuration and plugin creation for React page/component builds.
 */
export class ReactBundleService {
	private readonly runtimeBundleService: ReactRuntimeBundleService;
	private readonly config: ReactBundleServiceConfig;

	constructor(config: ReactBundleServiceConfig) {
		this.config = config;
		this.runtimeBundleService = new ReactRuntimeBundleService({
			rootDir: config.rootDir,
			routerAdapter: config.routerAdapter,
		});
	}

	/**
	 * Returns resolved runtime import paths for the React runtime.
	 */
	getRuntimeImports(): ReactRuntimeImports {
		return this.runtimeBundleService.getRuntimeImports();
	}

	/**
	 * Creates esbuild bundle options for a page or component entry.
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
			...(import.meta.env?.NODE_ENV === 'production' && {
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
			absWorkingDir: this.config.rootDir,
			declaredModules,
			alwaysAllowSpecifiers: getReactClientGraphAllowSpecifiers([], this.config.routerAdapter),
		});

		const foreignJsxOverridePlugin = createForeignJsxOverridePlugin({
			name: 'react-renderer-foreign-jsx-override',
			hostJsxImportSource: this.config.jsxImportSource ?? 'react',
			foreignExtensions: this.config.nonReactExtensions ?? [],
		});
		const runtimeManifest = this.runtimeBundleService.getRuntimeManifest();
		const runtimeRewritePlugin = createBrowserRuntimeImportRewritePlugin({
			name: 'react-renderer-runtime-import-rewrite',
			manifest: runtimeManifest,
		});
		const runtimePlugins = bundleOptions.includeRuntime
			? []
			: [runtimeRewritePlugin].filter((plugin): plugin is NonNullable<typeof plugin> => plugin !== null);

		if (isMdx && this.config.mdxCompilerOptions) {
			const mdxPlugin = createReactMdxLoaderPlugin(this.config.mdxCompilerOptions);
			options.plugins = [foreignJsxOverridePlugin, graphBoundaryPlugin, ...runtimePlugins, mdxPlugin];
		} else {
			options.plugins = [foreignJsxOverridePlugin, graphBoundaryPlugin, ...runtimePlugins];
		}

		return options;
	}
}
