/**
 * Bundle configuration service for React integration.
 *
 * Encapsulates all esbuild plugin creation and bundle options
 * for client-side React component builds.
 *
 * @module
 */

import { createClientGraphBoundaryPlugin } from '../utils/client-graph-boundary-plugin.ts';
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
}

/**
 * Manages esbuild bundle configuration and plugin creation for React page/component builds.
 */
export class ReactBundleService {
	private readonly runtimeBundleService: ReactRuntimeBundleService;

	constructor(private readonly config: ReactBundleServiceConfig) {
		this.runtimeBundleService = new ReactRuntimeBundleService({
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
		const options: Record<string, unknown> = {
			external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'],
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
			alwaysAllowSpecifiers: [
				'@ecopages/core',
				'react',
				'react-dom',
				'react/jsx-runtime',
				'react/jsx-dev-runtime',
				'react-dom/client',
				...(this.config.routerAdapter ? [this.config.routerAdapter.importMapKey] : []),
			],
		});

		const runtimeAliasPlugin = this.createRuntimeAliasPlugin(runtimeImports);
		const useSyncExternalStoreShimPlugin = this.createSyncExternalStorePlugin();

		if (isMdx && this.config.mdxCompilerOptions) {
			const { createReactMdxLoaderPlugin } = await import('../utils/react-mdx-loader-plugin.ts');
			const mdxPlugin = createReactMdxLoaderPlugin(this.config.mdxCompilerOptions);
			options.plugins = [graphBoundaryPlugin, runtimeAliasPlugin, mdxPlugin, useSyncExternalStoreShimPlugin];
		} else {
			options.plugins = [graphBoundaryPlugin, runtimeAliasPlugin, useSyncExternalStoreShimPlugin];
		}

		return options;
	}

	/**
	 * Creates the esbuild plugin that rewrites bare React specifiers
	 * to their runtime asset URLs.
	 */
	createRuntimeAliasPlugin(runtimeImports: ReactRuntimeImports) {
		const aliases = new Map<string, string>([
			['react', runtimeImports.react],
			['react-dom/client', runtimeImports.reactDomClient],
			['react/jsx-runtime', runtimeImports.reactJsxRuntime],
			['react/jsx-dev-runtime', runtimeImports.reactJsxDevRuntime],
			['react-dom', runtimeImports.reactDom],
		]);

		if (this.config.routerAdapter && runtimeImports.router) {
			aliases.set(this.config.routerAdapter.importMapKey, runtimeImports.router);
		}

		const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const pattern = new RegExp(
			`^(${Array.from(aliases.keys())
				.map((key) => escapeRegExp(key))
				.join('|')})$`,
		);

		return {
			name: 'react-runtime-import-alias',
			setup(build: {
				onResolve: (
					options: { filter: RegExp; namespace?: string },
					callback: (args: {
						path: string;
						importer: string;
						namespace: string;
					}) => { path?: string; namespace?: string; external?: boolean } | undefined,
				) => void;
			}) {
				build.onResolve({ filter: pattern }, (args) => {
					const mappedPath = aliases.get(args.path);
					if (!mappedPath) {
						return undefined;
					}
					return {
						path: mappedPath,
						external: true,
					};
				});
			},
		};
	}

	/**
	 * Redirects `use-sync-external-store/shim` imports to React's built-in
	 * `useSyncExternalStore`.
	 *
	 * Libraries like React Aria still list `use-sync-external-store` as a
	 * dependency to support React 16/17. On React 18+ the `/shim` export is
	 * already a pass-through, but without this plugin esbuild would bundle
	 * the full CJS shim (including `process.env` branching) into the browser
	 * bundle. The plugin short-circuits the resolution so only a single clean
	 * ESM re-export is emitted.
	 */
	private createSyncExternalStorePlugin() {
		return {
			name: 'react-renderer-use-sync-external-store-shim',
			setup(build: {
				onResolve: (
					options: { filter: RegExp; namespace?: string },
					callback: (args: {
						path: string;
						importer: string;
						namespace: string;
					}) => { path?: string; namespace?: string } | undefined,
				) => void;
				onLoad: (
					options: { filter: RegExp; namespace?: string },
					callback: (args: {
						path: string;
						namespace: string;
					}) => { contents?: string; loader?: 'js' } | undefined,
				) => void;
			}) {
				build.onResolve({ filter: /^use-sync-external-store\/shim(?:\/index\.js)?$/ }, () => ({
					path: 'use-sync-external-store/shim',
					namespace: 'ecopages-react-renderer-shim',
				}));

				build.onLoad(
					{ filter: /^use-sync-external-store\/shim$/, namespace: 'ecopages-react-renderer-shim' },
					() => ({
						contents: "export { useSyncExternalStore } from 'react';",
						loader: 'js',
					}),
				);

				build.onLoad({ filter: /[\\/]use-sync-external-store[\\/]shim[\\/]index\.js$/ }, () => ({
					contents: "export { useSyncExternalStore } from 'react';",
					loader: 'js',
				}));

				build.onLoad(
					{
						filter: /[\\/]use-sync-external-store[\\/]cjs[\\/]use-sync-external-store-shim\.development\.js$/,
					},
					() => ({
						contents: "export { useSyncExternalStore } from 'react';",
						loader: 'js',
					}),
				);

				build.onLoad(
					{
						filter: /[\\/]use-sync-external-store[\\/]cjs[\\/]use-sync-external-store-shim\.production\.js$/,
					},
					() => ({
						contents: "export { useSyncExternalStore } from 'react';",
						loader: 'js',
					}),
				);
			},
		};
	}
}
