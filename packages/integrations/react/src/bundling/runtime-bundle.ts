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
import type { ReactRouterAdapter } from '../contracts/router-adapter.ts';
import { createReactDomRuntimeInteropPlugin } from './runtime-interop-plugin.ts';
import { buildReactRuntimeManifest, getReactRuntimeExternalSpecifiers } from './runtime-alias-map.ts';
import {
	assertReactRuntimeModuleExternalsAreVendored,
	type ResolvedReactPluginRuntimeModule,
} from './runtime-modules.ts';
import {
	createBrowserRuntimeManifest,
	getBrowserRuntimeSpecifierMap,
	type BrowserRuntimeManifest,
} from '@ecopages/core/build/browser-runtime-manifest';
import { LAYOUT_COMPOSE_PACKAGE, PAGE_LAYOUT_NORMALIZATION_PACKAGE } from './bootstrap-package-paths.ts';

export type ReactRuntimeImports = {
	react: string;
	reactDomClient: string;
	reactJsxRuntime: string;
	reactJsxDevRuntime: string;
	reactDom: string;
	useSyncExternalStoreWithSelector: string;
	pageLayoutNormalization: string;
	layoutCompose: string;
	router?: string;
};

export interface RuntimeBundleServiceConfig {
	routerAdapter?: ReactRouterAdapter;
	runtimeModules?: ResolvedReactPluginRuntimeModule[];
	rootDir?: string;
	workDir?: string;
}

type RuntimeMode = 'development' | 'production';

export class RuntimeBundleService {
	private readonly config: RuntimeBundleServiceConfig;

	constructor(config: RuntimeBundleServiceConfig) {
		this.config = config;
	}

	setRootDir(rootDir: string | undefined): void {
		this.config.rootDir = rootDir;
	}

	setWorkDir(workDir: string | undefined): void {
		this.config.workDir = workDir;
	}

	setRuntimeModules(runtimeModules: ResolvedReactPluginRuntimeModule[]): void {
		this.config.runtimeModules = runtimeModules;
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

	private getConfiguredRuntimeModuleFileName(outputName: string, mode: RuntimeMode): string {
		return mode === 'development' ? `${outputName}.development.js` : `${outputName}.js`;
	}

	private getConfiguredRuntimeModules(): ResolvedReactPluginRuntimeModule[] {
		return this.config.runtimeModules ?? [];
	}

	getConfiguredRuntimeModuleSpecifiers(): string[] {
		return this.getConfiguredRuntimeModules().map((module) => module.specifier);
	}

	private getRuntimeModuleBundleExternals(
		module: ResolvedReactPluginRuntimeModule,
		mappedSpecifiers: Set<string>,
	): string[] {
		return [
			...getReactRuntimeExternalSpecifiers(),
			...(this.config.routerAdapter?.bundle.externals ?? []),
			...(this.config.routerAdapter ? [this.config.routerAdapter.bundle.importPath] : []),
			...module.externals,
		].filter((external) => !mappedSpecifiers.has(external));
	}

	private getUseSyncExternalStoreWithSelectorVendorFileName(mode: RuntimeMode): string {
		return mode === 'development'
			? 'use-sync-external-store-with-selector.development.js'
			: 'use-sync-external-store-with-selector.js';
	}

	private getPageLayoutNormalizationVendorFileName(mode: RuntimeMode): string {
		return mode === 'development' ? 'page-layout-normalization.development.js' : 'page-layout-normalization.js';
	}

	private getLayoutComposeVendorFileName(mode: RuntimeMode): string {
		return mode === 'development' ? 'layout-compose.development.js' : 'layout-compose.js';
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
			pageLayoutNormalization: buildBrowserRuntimeAssetUrl(this.getPageLayoutNormalizationVendorFileName(mode)),
			layoutCompose: buildBrowserRuntimeAssetUrl(this.getLayoutComposeVendorFileName(mode)),
		};

		if (this.config.routerAdapter) {
			runtimeImports.router = buildBrowserRuntimeAssetUrl(this.getRouterVendorFileName(mode));
		}

		return runtimeImports;
	}

	getRuntimeAliasMap(mode = this.getCurrentRuntimeMode()): Record<string, string> {
		return Object.fromEntries(getBrowserRuntimeSpecifierMap(this.getRuntimeManifest(mode)));
	}

	getRuntimeManifest(mode = this.getCurrentRuntimeMode()): BrowserRuntimeManifest {
		return buildReactRuntimeManifest(
			this.getRuntimeImports(mode),
			this.getConfiguredRuntimeModules(),
			(outputName) => buildBrowserRuntimeAssetUrl(this.getConfiguredRuntimeModuleFileName(outputName, mode)),
			{ routerImportPath: this.config.routerAdapter?.bundle.importPath },
		);
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
			const mappedSpecifiers = new Set(this.getRuntimeManifest(mode).bySpecifier.keys());

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
				createBrowserRuntimeScriptAsset({
					importPath: LAYOUT_COMPOSE_PACKAGE,
					name: 'layout-compose',
					fileName: this.getLayoutComposeVendorFileName(mode),
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
							plugins: [
								this.createRuntimeAliasPlugin(mode, [
									this.config.routerAdapter.bundle.importPath,
									'@ecopages/react-router',
								]),
							],
						},
					}),
				);
			}

			for (const runtimeModule of this.getConfiguredRuntimeModules()) {
				assertReactRuntimeModuleExternalsAreVendored(runtimeModule, mappedSpecifiers);

				dependencies.push(
					createBrowserRuntimeModuleAsset({
						modules: [{ specifier: runtimeModule.specifier, defaultExport: true }],
						name: runtimeModule.outputName,
						fileName: this.getConfiguredRuntimeModuleFileName(runtimeModule.outputName, mode),
						cacheDirName: `ecopages-react-runtime-module-${runtimeModule.outputName}-${mode}`,
						rootDir: this.config.rootDir,
						workDir: this.config.workDir,
						bundleOptions: {
							define: this.createRuntimeDefines(mode),
							external: this.getRuntimeModuleBundleExternals(runtimeModule, mappedSpecifiers),
							excludeAppBuildPlugins: [DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME],
							plugins: [this.createRuntimeAliasPlugin(mode, [runtimeModule.specifier])],
						},
					}),
				);
			}
		}

		return dependencies;
	}

	/**
	 * Declares the MDX-only page-layout-normalization vendor for the current runtime mode.
	 *
	 * @remarks
	 * Kept out of {@link getDependencies} so non-MDX pages do not pay for this vendor during
	 * integration setup. Callers process these assets once when an MDX page graph is prepared.
	 */
	getPageLayoutNormalizationDependencies(options?: { modes?: RuntimeMode[] }): AssetDefinition[] {
		const dependencies: AssetDefinition[] = [];
		const modes = options?.modes ?? [this.getCurrentRuntimeMode()];

		for (const mode of modes) {
			dependencies.push(
				createBrowserRuntimeScriptAsset({
					importPath: PAGE_LAYOUT_NORMALIZATION_PACKAGE,
					name: 'page-layout-normalization',
					fileName: this.getPageLayoutNormalizationVendorFileName(mode),
					bundleOptions: {
						define: this.createRuntimeDefines(mode),
						excludeAppBuildPlugins: [DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME],
					},
				}),
			);
		}

		return dependencies;
	}

	/**
	 * Builds the vendor import-rewrite plugin for one runtime asset.
	 *
	 * @remarks
	 * `omitSpecifiers` drops the module being bundled so a self-import cannot
	 * rewrite to the file currently being emitted.
	 */
	createRuntimeAliasPlugin(
		mode = this.getCurrentRuntimeMode(),
		omitSpecifiers: readonly string[] = [],
	): EcoBuildPlugin {
		const manifest = this.getRuntimeManifest(mode);
		const omitted = new Set(omitSpecifiers);
		const pluginManifest =
			omitted.size === 0
				? manifest
				: createBrowserRuntimeManifest(manifest.assets.filter((asset) => !omitted.has(asset.specifier)));

		return createBrowserRuntimePlugin({
			name: `react-plugin-runtime-alias-${mode}`,
			manifest: pluginManifest,
		})!;
	}
}
