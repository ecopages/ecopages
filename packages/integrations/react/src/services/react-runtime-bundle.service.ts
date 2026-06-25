/**
 * Runtime bundle service for React integration.
 *
 * Owns creation of the browser runtime assets for React and React DOM,
 * including shared runtime entry generation and specifier mapping.
 *
 * @module
 */

import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import { createBrowserRuntimePlugin } from '@ecopages/core/build/browser-runtime-plugin';
import { DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME } from '@ecopages/core/build/browser-runtime-plugin';
import {
	buildBrowserRuntimeAssetUrl,
	createBrowserRuntimeModuleAsset,
	createBrowserRuntimeScriptAsset,
	type AssetDefinition,
} from '@ecopages/core/services/asset-processing-service';
import type { ReactRouterAdapter } from '../router-adapter.ts';
import { createReactDomRuntimeInteropPlugin } from '../utils/react-dom-runtime-interop-plugin.ts';
import { buildReactRuntimeAliasMap, buildReactRuntimeManifest } from '../utils/react-runtime-alias-map.ts';
import {
	createBrowserRuntimeManifest,
	type BrowserRuntimeManifest,
} from '@ecopages/core/build/browser-runtime-manifest';

export type ReactRuntimeImports = {
	react: string;
	reactDomClient: string;
	reactJsxRuntime: string;
	reactJsxDevRuntime: string;
	reactDom: string;
	useSyncExternalStoreWithSelector: string;
	router?: string;
};

export interface ReactRuntimeBundleServiceConfig {
	routerAdapter?: ReactRouterAdapter;
	rootDir?: string;
	workDir?: string;
}

type RuntimeMode = 'development' | 'production';

export class ReactRuntimeBundleService {
	private readonly config: ReactRuntimeBundleServiceConfig;

	constructor(config: ReactRuntimeBundleServiceConfig) {
		this.config = config;
	}

	setRootDir(rootDir: string | undefined): void {
		this.config.rootDir = rootDir;
	}

	setWorkDir(workDir: string | undefined): void {
		this.config.workDir = workDir;
	}

	private get isDevelopment(): boolean {
		return process.env.NODE_ENV === 'development';
	}

	private getCurrentRuntimeMode(): RuntimeMode {
		return this.isDevelopment ? 'development' : 'production';
	}

	private createRuntimeDefines(mode: RuntimeMode): Record<string, string> {
		const nodeEnv = JSON.stringify(mode);

		return {
			'process.env.NODE_ENV': nodeEnv,
			'import.meta.env.NODE_ENV': nodeEnv,
		};
	}

	private getReactVendorFileName(mode: RuntimeMode): string {
		return mode === 'development' ? 'react.development.js' : 'react.js';
	}

	private getReactDomVendorFileName(mode: RuntimeMode): string {
		return mode === 'development' ? 'react-dom.development.js' : 'react-dom.js';
	}

	private getRouterVendorFileName(mode: RuntimeMode): string {
		if (!this.config.routerAdapter) {
			return '';
		}

		return mode === 'development'
			? `${this.config.routerAdapter.bundle.outputName}.development.js`
			: `${this.config.routerAdapter.bundle.outputName}.js`;
	}

	private getUseSyncExternalStoreWithSelectorVendorFileName(mode: RuntimeMode): string {
		return mode === 'development'
			? 'use-sync-external-store-with-selector.development.js'
			: 'use-sync-external-store-with-selector.js';
	}

	private createReactVendorImportRewritePlugin(mode: RuntimeMode): EcoBuildPlugin {
		return createBrowserRuntimePlugin({
			name: `react-plugin-vendor-runtime-import-rewrite-${mode}`,
			manifest: createBrowserRuntimeManifest([
				{
					specifier: 'react',
					owner: '@ecopages/react',
					importPath: 'react',
					publicPath: buildBrowserRuntimeAssetUrl(this.getReactVendorFileName(mode)),
				},
			]),
		})!;
	}

	getRuntimeImports(mode = this.getCurrentRuntimeMode()): ReactRuntimeImports {
		const reactVendorFileName = this.getReactVendorFileName(mode);
		const reactDomVendorFileName = this.getReactDomVendorFileName(mode);
		const runtimeImports: ReactRuntimeImports = {
			react: buildBrowserRuntimeAssetUrl(reactVendorFileName),
			reactDomClient: buildBrowserRuntimeAssetUrl(reactDomVendorFileName),
			reactJsxRuntime: buildBrowserRuntimeAssetUrl(reactVendorFileName),
			reactJsxDevRuntime: buildBrowserRuntimeAssetUrl(reactVendorFileName),
			reactDom: buildBrowserRuntimeAssetUrl(reactDomVendorFileName),
			useSyncExternalStoreWithSelector: buildBrowserRuntimeAssetUrl(
				this.getUseSyncExternalStoreWithSelectorVendorFileName(mode),
			),
		};

		if (this.config.routerAdapter) {
			runtimeImports.router = buildBrowserRuntimeAssetUrl(this.getRouterVendorFileName(mode));
		}

		return runtimeImports;
	}

	getRuntimeAliasMap(mode = this.getCurrentRuntimeMode()): Record<string, string> {
		return buildReactRuntimeAliasMap(this.getRuntimeImports(mode));
	}

	getRuntimeManifest(mode = this.getCurrentRuntimeMode()): BrowserRuntimeManifest {
		return buildReactRuntimeManifest(this.getRuntimeImports(mode));
	}

	getDependencies(options?: { modes?: RuntimeMode[] }): AssetDefinition[] {
		const dependencies: AssetDefinition[] = [];
		const modes = options?.modes ?? [this.getCurrentRuntimeMode()];

		for (const mode of modes) {
			const reactVendorImportRewritePlugin = this.createReactVendorImportRewritePlugin(mode);
			const reactDomRuntimeInteropPlugin = createReactDomRuntimeInteropPlugin({
				reactSpecifier: buildBrowserRuntimeAssetUrl(this.getReactVendorFileName(mode)),
			});
			const reactRuntimeAliasPlugin = createBrowserRuntimePlugin({
				name: `react-plugin-runtime-specifier-alias-${mode}`,
				manifest: createBrowserRuntimeManifest([
					{
						specifier: 'react',
						owner: '',
						importPath: 'react',
						publicPath: buildBrowserRuntimeAssetUrl(this.getReactVendorFileName(mode)),
					},
				]),
			});
			const reactDomBundlePlugins = [reactRuntimeAliasPlugin, reactDomRuntimeInteropPlugin].filter(
				(plugin): plugin is EcoBuildPlugin => plugin !== null,
			);
			const runtimeAliasPlugin = this.createRuntimeAliasPlugin(mode);
			const mappedSpecifiers = new Set(Object.keys(this.getRuntimeAliasMap(mode)));

			dependencies.push(
				createBrowserRuntimeModuleAsset({
					modules: [
						{ specifier: 'react', defaultExport: true },
						{ specifier: 'react/jsx-runtime' },
						{ specifier: 'react/jsx-dev-runtime' },
					],
					name: 'react',
					fileName: this.getReactVendorFileName(mode),
					cacheDirName: `ecopages-react-runtime-${mode}`,
					rootDir: this.config.rootDir,
					workDir: this.config.workDir,
					bundleOptions: {
						define: this.createRuntimeDefines(mode),
						excludeAppBuildPlugins: [DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME],
					},
				}),
				createBrowserRuntimeModuleAsset({
					modules: [{ specifier: 'react-dom', defaultExport: true }, { specifier: 'react-dom/client' }],
					name: 'react-dom',
					fileName: this.getReactDomVendorFileName(mode),
					cacheDirName: `ecopages-react-runtime-${mode}`,
					rootDir: this.config.rootDir,
					workDir: this.config.workDir,
					bundleOptions: {
						define: this.createRuntimeDefines(mode),
						excludeAppBuildPlugins: [DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME],
						plugins: reactDomBundlePlugins,
					},
				}),
				createBrowserRuntimeScriptAsset({
					importPath: '@ecopages/react/runtime/use-sync-external-store-with-selector',
					name: 'use-sync-external-store-with-selector',
					fileName: this.getUseSyncExternalStoreWithSelectorVendorFileName(mode),
					bundleOptions: {
						define: this.createRuntimeDefines(mode),
						excludeAppBuildPlugins: [DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME],
						plugins: [reactVendorImportRewritePlugin],
					},
				}),
			);

			if (this.config.routerAdapter) {
				const unresolvedExternals = this.config.routerAdapter.bundle.externals.filter(
					(external) => !mappedSpecifiers.has(external),
				);

				dependencies.push(
					createBrowserRuntimeScriptAsset({
						importPath: this.config.routerAdapter.bundle.importPath,
						name: this.config.routerAdapter.bundle.outputName,
						fileName: this.getRouterVendorFileName(mode),
						bundleOptions: {
							define: this.createRuntimeDefines(mode),
							external: unresolvedExternals,
							plugins: [runtimeAliasPlugin],
						},
					}),
				);
			}
		}

		return dependencies;
	}

	createRuntimeAliasPlugin(mode = this.getCurrentRuntimeMode()): EcoBuildPlugin {
		const aliasMap = this.getRuntimeAliasMap(mode);
		const manifest = createBrowserRuntimeManifest(
			Object.entries(aliasMap).map(([specifier, publicPath]) => ({
				specifier,
				owner: '',
				importPath: specifier,
				publicPath,
			})),
		);
		return createBrowserRuntimePlugin({
			name: `react-plugin-runtime-alias-${mode}`,
			manifest,
		})!;
	}
}
