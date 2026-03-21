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
}

export class ReactRuntimeBundleService {
	private readonly config: ReactRuntimeBundleServiceConfig;

	constructor(config: ReactRuntimeBundleServiceConfig) {
		this.config = config;
	}

	getRuntimeImports(): ReactRuntimeImports {
		const runtimeImports: ReactRuntimeImports = {
			react: buildBrowserRuntimeAssetUrl('react.js'),
			reactDomClient: buildBrowserRuntimeAssetUrl('react-dom.js'),
			reactJsxRuntime: buildBrowserRuntimeAssetUrl('react.js'),
			reactJsxDevRuntime: buildBrowserRuntimeAssetUrl('react.js'),
			reactDom: buildBrowserRuntimeAssetUrl('react-dom.js'),
		};

		if (this.config.routerAdapter) {
			runtimeImports.router = buildBrowserRuntimeAssetUrl(`${this.config.routerAdapter.bundle.outputName}.js`);
		}

		return runtimeImports;
	}

	getSpecifierMap(): Record<string, string> {
		return buildReactRuntimeSpecifierMap(this.getRuntimeImports(), this.config.routerAdapter);
	}

	getDependencies(): AssetDefinition[] {
		const runtimeImports = this.getRuntimeImports();
		const reactRuntimeAliasPlugin = createRuntimeSpecifierAliasPlugin(
			{
				react: runtimeImports.react,
			},
			{ name: 'react-plugin-runtime-specifier-alias' },
		);
		const reactDomRuntimeInteropPlugin = createReactDomRuntimeInteropPlugin();
		const reactDomBundlePlugins = [reactRuntimeAliasPlugin, reactDomRuntimeInteropPlugin].filter(
			(plugin): plugin is EcoBuildPlugin => plugin !== null,
		);

		const dependencies: AssetDefinition[] = [
			createBrowserRuntimeModuleAsset({
				modules: [
					{ specifier: 'react', defaultExport: true },
					{ specifier: 'react/jsx-runtime' },
					{ specifier: 'react/jsx-dev-runtime' },
				],
				name: 'react',
				fileName: 'react.js',
				cacheDirName: 'ecopages-react-runtime',
			}),
			createBrowserRuntimeModuleAsset({
				modules: [{ specifier: 'react-dom', defaultExport: true }, { specifier: 'react-dom/client' }],
				name: 'react-dom',
				fileName: 'react-dom.js',
				cacheDirName: 'ecopages-react-runtime',
				bundleOptions: {
					plugins: reactDomBundlePlugins,
				},
			}),
		];

		if (this.config.routerAdapter) {
			const runtimeAliasPlugin = this.createRuntimeAliasPlugin();
			const mappedSpecifiers = new Set(Object.keys(this.getSpecifierMap()));
			const unresolvedExternals = this.config.routerAdapter.bundle.externals.filter(
				(external) => !mappedSpecifiers.has(external),
			);

			dependencies.push(
				createBrowserRuntimeScriptAsset({
					importPath: this.config.routerAdapter.bundle.importPath,
					name: this.config.routerAdapter.bundle.outputName,
					fileName: `${this.config.routerAdapter.bundle.outputName}.js`,
					bundleOptions: {
						external: unresolvedExternals,
						plugins: [runtimeAliasPlugin],
					},
				}),
			);
		}

		return dependencies;
	}

	createRuntimeAliasPlugin(): EcoBuildPlugin {
		return createRuntimeSpecifierAliasPlugin(this.getSpecifierMap(), {
			name: 'react-plugin-runtime-alias',
		})!;
	}
}
