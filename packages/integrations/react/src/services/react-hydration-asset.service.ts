/**
 * Hydration asset creation service for React integration.
 *
 * Builds the asset definitions required for client-side React rendering — both at
 * the page level and the component island level.
 *
 * @module
 */

import path from 'node:path';
import type { EcoComponentConfig } from '@ecopages/core';
import { rapidhash } from '@ecopages/core/hash';
import { RESOLVED_ASSETS_DIR } from '@ecopages/core/constants';
import {
	AssetFactory,
	type AssetDefinition,
	type ProcessedAsset,
} from '@ecopages/core/services/asset-processing-service';
import type { AssetProcessingService } from '@ecopages/core/services/asset-processing-service';
import { createHydrationScript, createIslandHydrationScript } from '../utils/hydration-scripts.ts';
import { collectDeclaredModulesInConfig } from '../utils/declared-modules.ts';
import type { ReactBundleService } from './react-bundle.service.ts';
import type { ReactHmrPageMetadataCache } from './react-hmr-page-metadata-cache.ts';
import type { ReactRouterAdapter } from '../router-adapter.ts';

/**
 * Configuration for the ReactHydrationAssetService.
 */
export interface ReactHydrationAssetServiceConfig {
	srcDir: string;
	routerAdapter?: ReactRouterAdapter;
	assetProcessingService: AssetProcessingService;
	bundleService: ReactBundleService;
	hmrPageMetadataCache?: ReactHmrPageMetadataCache;
}

export function getReactIslandComponentKey(componentFile: string, config?: EcoComponentConfig): string {
	return rapidhash(`${componentFile}:${config?.__eco?.id ?? ''}`).toString();
}

/**
 * Manages the creation of client-side hydration assets for React pages and component islands.
 */
export class ReactHydrationAssetService {
	private readonly config: ReactHydrationAssetServiceConfig;

	constructor(config: ReactHydrationAssetServiceConfig) {
		this.config = config;
	}

	private getIslandBundleName(componentFile: string): string {
		return `ecopages-react-island-${rapidhash(componentFile)}`;
	}

	private getIslandHydrationName(bundleName: string, componentKey: string): string {
		return `${bundleName}-hydration-${componentKey}`;
	}

	/**
	 * Resolves the browser import path used for a React-owned page or island module.
	 * Uses HMR manager for development or constructs static path for production.
	 *
	 * @param pagePath - Absolute path to the page source file
	 * @param assetName - Generated asset name
	 * @returns The resolved browser import path for the module
	 */
	async resolveAssetImportPath(pagePath: string, assetName: string): Promise<string> {
		const hmrManager = this.config.assetProcessingService?.getHmrManager();

		if (hmrManager?.isEnabled()) {
			return hmrManager.registerEntrypoint(pagePath);
		}

		return `/${path
			.join(RESOLVED_ASSETS_DIR, path.relative(this.config.srcDir, pagePath))
			.replace(path.basename(pagePath), `${assetName}.js`)
			.replace(/\\/g, '/')}`;
	}

	/**
	 * Creates the page-owned route entry asset for hydration and client navigation.
	 *
	 * @param pagePath - Absolute path to the page source file
	 * @param componentName - Generated unique component name
	 * @param importPath - Resolved browser import path used by development HMR
	 * @param bundleOptions - Bundle configuration options
	 * @param isDevelopment - Whether running in development mode with HMR
	 * @param isMdx - Whether the source file is an MDX file
	 * @returns One page-owned asset definition for processing
	 */
	createPageDependencies(
		pagePath: string,
		componentName: string,
		importPath: string,
		pageModuleUrlExpression: string,
		bundleOptions: Record<string, unknown>,
		isDevelopment: boolean,
		useBrowserRuntimeImports: boolean,
		isMdx: boolean,
	): AssetDefinition[] {
		const runtimeImports = this.config.bundleService.getRuntimeImports();
		return [
			AssetFactory.createContentScript({
				position: 'head',
				content: createHydrationScript({
					importPath: isDevelopment ? importPath : pagePath,
					pageModuleUrlExpression,
					reactImportPath: useBrowserRuntimeImports ? runtimeImports.react : 'react',
					reactDomClientImportPath: useBrowserRuntimeImports ? runtimeImports.reactDomClient : 'react-dom/client',
					routerImportPath: useBrowserRuntimeImports
						? runtimeImports.router
						: this.config.routerAdapter?.bundle.importPath,
					isDevelopment,
					isMdx,
					router: this.config.routerAdapter,
					scriptId: componentName,
				}),
				name: componentName,
				packageRole: 'page-script',
				bundle: !isDevelopment,
				bundleOptions,
				attributes: {
					type: 'module',
					defer: '',
					'data-eco-rerun': 'true',
					'data-eco-script-id': componentName,
					'data-eco-persist': 'true',
				},
			}),
		];
	}

	/**
	 * Builds client-side assets for a React component island.
	 *
	 * Includes the bundled component entry and a shared hydration bootstrap script.
	 *
	 * @param componentFile - Absolute path to the component source file
	 * @param config - Optional component config with `__eco` metadata
	 * @returns Processed assets ready for injection
	 */
	async buildComponentRenderAssets(componentFile: string, config?: EcoComponentConfig): Promise<ProcessedAsset[]> {
		const componentName = this.getIslandBundleName(componentFile);
		const componentKey = getReactIslandComponentKey(componentFile, config);
		const hydrationName = this.getIslandHydrationName(componentName, componentKey);
		const hmrManager = this.config.assetProcessingService?.getHmrManager();
		const isDevelopment = hmrManager?.isEnabled() ?? false;
		if (isDevelopment) {
			this.config.hmrPageMetadataCache?.markOwnedEntrypoint(componentFile);
		}
		const importPath = await this.resolveAssetImportPath(componentFile, componentName);
		const declaredModules = collectDeclaredModulesInConfig(config);
		const bundleOptions = await this.config.bundleService.createBundleOptions(
			componentName,
			false,
			declaredModules,
		);
		const runtimeImports = this.config.bundleService.getRuntimeImports();

		const dependencies: AssetDefinition[] = [
			AssetFactory.createFileScript({
				position: 'head',
				filepath: componentFile,
				name: componentName,
				packageRole: 'dynamic-chunk',
				excludeFromHtml: true,
				bundle: true,
				bundleOptions,
				attributes: {
					type: 'module',
					defer: '',
					'data-eco-persist': 'true',
				},
			}),
			AssetFactory.createContentScript({
				position: 'head',
				content: createIslandHydrationScript({
					importPath,
					reactImportPath: runtimeImports.react,
					reactDomClientImportPath: runtimeImports.reactDomClient,
					targetSelector: `[data-eco-component-key="${componentKey}"]`,
					componentRef: config?.__eco?.id,
					componentFile,
					isDevelopment,
				}),
				name: hydrationName,
				packageRole: 'keep-separate',
				bundle: false,
				attributes: {
					type: 'module',
					defer: '',
					'data-eco-rerun': 'true',
					'data-eco-script-id': hydrationName,
					'data-eco-persist': 'true',
				},
			}),
		];

		if (!this.config.assetProcessingService) {
			return [];
		}

		return this.config.assetProcessingService.processDependencies(dependencies, componentName);
	}

	/**
	 * Builds the Page Browser Graph assets for a React page.
	 *
	 * @param pagePath - Absolute file path of the page
	 * @param isMdx - Whether the page is an MDX file
	 * @param declaredModules - Explicitly declared browser module specifiers
	 * @returns Processed assets for the route
	 */
	async buildPageBrowserGraphAssets(
		pagePath: string,
		isMdx: boolean,
		declaredModules: string[],
	): Promise<ProcessedAsset[]> {
		const componentName = `ecopages-react-${rapidhash(pagePath)}`;
		const hmrManager = this.config.assetProcessingService?.getHmrManager();
		const isDevelopment = hmrManager?.isEnabled() ?? false;
		const isHostedDevelopment = !isDevelopment && process.env.NODE_ENV !== 'production';
		const useBrowserRuntimeImports = isDevelopment || isHostedDevelopment;
		if (isDevelopment) {
			this.config.hmrPageMetadataCache?.setDeclaredModules(pagePath, declaredModules);
		}

		const importPath = await this.resolveAssetImportPath(pagePath, componentName);
		const pageModuleUrlExpression = 'import.meta.url';
		const bundleOptions = await this.config.bundleService.createBundleOptions(
			componentName,
			isMdx,
			declaredModules,
			{ includeRuntime: !useBrowserRuntimeImports },
		);
		const dependencies = this.createPageDependencies(
			pagePath,
			componentName,
			importPath,
			pageModuleUrlExpression,
			bundleOptions,
			isDevelopment,
			useBrowserRuntimeImports,
			isMdx,
		);

		if (!this.config.assetProcessingService) {
			throw new Error('AssetProcessingService is not set');
		}

		return this.config.assetProcessingService.processDependencies(dependencies, componentName);
	}
}
