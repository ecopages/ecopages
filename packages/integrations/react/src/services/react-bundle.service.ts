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
	buildReactRuntimeSpecifierMap,
	getReactClientGraphAllowSpecifiers,
	getReactRuntimeExternalSpecifiers,
} from '../utils/react-runtime-specifier-map.ts';
import { createUseSyncExternalStoreShimPlugin } from '../utils/use-sync-external-store-shim-plugin.ts';
import { createRuntimeSpecifierAliasPlugin } from '@ecopages/core/build/runtime-specifier-alias-plugin';
import { createForeignJsxOverridePlugin } from '@ecopages/core/plugins/foreign-jsx-override-plugin';
import type { ReactRouterAdapter } from '../router-adapter.ts';
import type { CompileOptions } from '@mdx-js/mdx';
import { ReactRuntimeBundleService, type ReactRuntimeImports } from './react-runtime-bundle.service.ts';

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
	 * @param componentName - Generated unique component name for output naming
	 * @param isMdx - Whether the source file is an MDX file
	 * @param declaredModules - Explicitly declared browser module specifiers
	 * @returns Bundle options object for the build adapter
	 */
	async createBundleOptions(
		componentName: string,
		isMdx: boolean,
		declaredModules: string[],
	): Promise<Record<string, unknown>> {
		const runtimeImports = this.getRuntimeImports();
		const runtimeSpecifierMap = buildReactRuntimeSpecifierMap(runtimeImports, this.config.routerAdapter);
		const options: Record<string, unknown> = {
			external: getReactRuntimeExternalSpecifiers(),
			mainFields: ['module', 'browser', 'main'],
			naming: `${componentName}.[ext]`,
			...(import.meta.env?.NODE_ENV === 'production' && {
				minify: true,
				splitting: false,
				treeshaking: true,
			}),
		};

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
		const runtimeAliasPlugin = this.createRuntimeAliasPlugin(runtimeSpecifierMap);
		const useSyncExternalStoreShimPlugin = createUseSyncExternalStoreShimPlugin({
			name: 'react-renderer-use-sync-external-store-shim',
			namespace: 'ecopages-react-renderer-shim',
		});

		if (isMdx && this.config.mdxCompilerOptions) {
			const { createReactMdxLoaderPlugin } = await import('../utils/react-mdx-loader-plugin.ts');
			const mdxPlugin = createReactMdxLoaderPlugin(this.config.mdxCompilerOptions);
			options.plugins = [
				foreignJsxOverridePlugin,
				graphBoundaryPlugin,
				runtimeAliasPlugin,
				mdxPlugin,
				useSyncExternalStoreShimPlugin,
			];
		} else {
			options.plugins = [
				foreignJsxOverridePlugin,
				graphBoundaryPlugin,
				runtimeAliasPlugin,
				useSyncExternalStoreShimPlugin,
			];
		}

		return options;
	}

	/**
	 * Creates the esbuild plugin that rewrites bare React specifiers
	 * to their runtime asset URLs.
	 */
	createRuntimeAliasPlugin(runtimeSpecifierMap: Record<string, string>) {
		return createRuntimeSpecifierAliasPlugin(runtimeSpecifierMap, { name: 'react-runtime-import-alias' });
	}
}
