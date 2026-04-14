/**
 * Runtime bundle service for React integration.
 *
 * Owns creation of the browser runtime assets for React and React DOM,
 * including shared runtime entry generation and specifier mapping.
 *
 * @module
 */

import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';
import { createRuntimeSpecifierAliasPlugin } from '@ecopages/core/build/runtime-specifier-alias-plugin';
import {
	buildBrowserRuntimeAssetUrl,
	createBrowserRuntimeModuleAsset,
	createBrowserRuntimeScriptAsset,
	type AssetDefinition,
} from '@ecopages/core/services/asset-processing-service';
import type { ReactRouterAdapter } from '../router-adapter.ts';
import { createReactDomRuntimeInteropPlugin } from '../utils/react-dom-runtime-interop-plugin.ts';
import { buildReactRuntimeSpecifierMap } from '../utils/react-runtime-specifier-map.ts';

export type ReactRuntimeImports = {
	react: string;
	reactDomClient: string;
	reactJsxRuntime: string;
	reactJsxDevRuntime: string;
	reactDom: string;
	router?: string;
};

export interface ReactRuntimeBundleServiceConfig {
	routerAdapter?: ReactRouterAdapter;
	rootDir?: string;
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

	getRuntimeImports(mode = this.getCurrentRuntimeMode()): ReactRuntimeImports {
		const reactVendorFileName = this.getReactVendorFileName(mode);
		const reactDomVendorFileName = this.getReactDomVendorFileName(mode);
		const runtimeImports: ReactRuntimeImports = {
			react: buildBrowserRuntimeAssetUrl(reactVendorFileName),
			reactDomClient: buildBrowserRuntimeAssetUrl(reactDomVendorFileName),
			reactJsxRuntime: buildBrowserRuntimeAssetUrl(reactVendorFileName),
			reactJsxDevRuntime: buildBrowserRuntimeAssetUrl(reactVendorFileName),
			reactDom: buildBrowserRuntimeAssetUrl(reactDomVendorFileName),
		};

		if (this.config.routerAdapter) {
			runtimeImports.router = buildBrowserRuntimeAssetUrl(this.getRouterVendorFileName(mode));
		}

		return runtimeImports;
	}

	getSpecifierMap(mode = this.getCurrentRuntimeMode()): Record<string, string> {
		return buildReactRuntimeSpecifierMap(this.getRuntimeImports(mode), this.config.routerAdapter);
	}

	getDependencies(): AssetDefinition[] {
		const reactDomRuntimeInteropPlugin = createReactDomRuntimeInteropPlugin();
		const dependencies: AssetDefinition[] = [];

		for (const mode of ['production', 'development'] as const) {
			const reactRuntimeAliasPlugin = createRuntimeSpecifierAliasPlugin(
				{
					react: buildBrowserRuntimeAssetUrl(this.getReactVendorFileName(mode)),
				},
				{ name: `react-plugin-runtime-specifier-alias-${mode}` },
			);
			const reactDomBundlePlugins = [reactRuntimeAliasPlugin, reactDomRuntimeInteropPlugin].filter(
				(plugin): plugin is EcoBuildPlugin => plugin !== null,
			);
			const runtimeAliasPlugin = this.createRuntimeAliasPlugin(mode);
			const mappedSpecifiers = new Set(Object.keys(this.getSpecifierMap(mode)));

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
					bundleOptions: {
						define: this.createRuntimeDefines(mode),
					},
				}),
				createBrowserRuntimeModuleAsset({
					modules: [{ specifier: 'react-dom', defaultExport: true }, { specifier: 'react-dom/client' }],
					name: 'react-dom',
					fileName: this.getReactDomVendorFileName(mode),
					cacheDirName: `ecopages-react-runtime-${mode}`,
					rootDir: this.config.rootDir,
					bundleOptions: {
						define: this.createRuntimeDefines(mode),
						plugins: reactDomBundlePlugins,
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
		return createRuntimeSpecifierAliasPlugin(this.getSpecifierMap(mode), {
			name: `react-plugin-runtime-alias-${mode}`,
		})!;
	}
}
