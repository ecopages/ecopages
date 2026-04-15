/**
 * Hydration asset creation service for React integration.
 *
 * Builds the asset definitions (bundled component scripts + hydration bootstrap scripts)
 * required for client-side React rendering — both at the page level and the component
 * island level.
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
	 * Resolves the import path for the bundled page component.
	 * Uses HMR manager for development or constructs static path for production.
	 *
	 * @param pagePath - Absolute path to the page source file
	 * @param assetName - Generated asset name
	 * @returns The resolved import path for the bundled component
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
	 * Creates the asset dependencies for a page: the bundled component and hydration script.
	 *
	 * @param pagePath - Absolute path to the page source file
	 * @param componentName - Generated unique component name
	 * @param importPath - Resolved import path for the bundled component
	 * @param bundleOptions - Bundle configuration options
	 * @param isDevelopment - Whether running in development mode with HMR
	 * @param isMdx - Whether the source file is an MDX file
	 * @param props - Optional page props for client serialization
	 * @returns Array of asset definitions for processing
	 */
	createPageDependencies(
		pagePath: string,
		componentName: string,
		importPath: string,
		bundleOptions: Record<string, unknown>,
		isDevelopment: boolean,
		isMdx: boolean,
		props?: Record<string, unknown>,
	): AssetDefinition[] {
		const runtimeImports = this.config.bundleService.getRuntimeImports();
		const dependencies: AssetDefinition[] = [
			AssetFactory.createFileScript({
				position: 'head',
				filepath: pagePath,
				name: componentName,
				excludeFromHtml: true,
				bundle: true,
				bundleOptions,
				attributes: {
					type: 'module',
					defer: '',
					'data-eco-persist': 'true',
				},
			}),
		];

		if (props && Object.keys(props).length > 0) {
			dependencies.push(
				AssetFactory.createContentScript({
					position: 'head',
					content: `window.__ECO_PAGES__=window.__ECO_PAGES__||{};window.__ECO_PAGES__.page={module:"${importPath}",props:${JSON.stringify(props)}};`,
					name: `${componentName}-props`,
					bundle: false,
					attributes: {
						type: 'module',
					},
				}),
			);
		}

		dependencies.push(
			AssetFactory.createContentScript({
				position: 'head',
				content: createHydrationScript({
					importPath,
					reactImportPath: runtimeImports.react,
					reactDomClientImportPath: runtimeImports.reactDomClient,
					routerImportPath: runtimeImports.router,
					isDevelopment,
					isMdx,
					router: this.config.routerAdapter,
				}),
				name: `${componentName}-hydration`,
				bundle: false,
				attributes: {
					type: 'module',
					defer: '',
					'data-eco-rerun': 'true',
					'data-eco-script-id': `${componentName}-hydration`,
					'data-eco-persist': 'true',
				},
			}),
		);

		return dependencies;
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
	 * Builds all client-side route assets for a page.
	 *
	 * @param pagePath - Absolute file path of the page
	 * @param isMdx - Whether the page is an MDX file
	 * @param declaredModules - Explicitly declared browser module specifiers
	 * @returns Processed assets for the route
	 */
	async buildRouteRenderAssets(
		pagePath: string,
		isMdx: boolean,
		declaredModules: string[],
	): Promise<ProcessedAsset[]> {
		const componentName = `ecopages-react-${rapidhash(pagePath)}`;
		const hmrManager = this.config.assetProcessingService?.getHmrManager();
		const isDevelopment = hmrManager?.isEnabled() ?? false;
		if (isDevelopment) {
			this.config.hmrPageMetadataCache?.setDeclaredModules(pagePath, declaredModules);
		}

		const importPath = await this.resolveAssetImportPath(pagePath, componentName);
		const bundleOptions = await this.config.bundleService.createBundleOptions(
			componentName,
			isMdx,
			declaredModules,
		);
		const dependencies = this.createPageDependencies(
			pagePath,
			componentName,
			importPath,
			bundleOptions,
			isDevelopment,
			isMdx,
		);

		if (!this.config.assetProcessingService) {
			throw new Error('AssetProcessingService is not set');
		}

		return this.config.assetProcessingService.processDependencies(dependencies, componentName);
	}
}
