/**
 * Hydration asset creation service for React integration.
 *
 * Builds the asset definitions required for client-side React rendering: both at
 * the page level and the component island level.
 *
 * @module
 */

import path from 'node:path';
import type { EcoComponentConfig } from '@ecopages/core';
import { rapidhash } from '@ecopages/core/hash';
import { RESOLVED_ASSETS_DIR } from '@ecopages/core/constants';
import { isReactProductionRuntime } from '../bundling/runtime-mode.ts';
import {
	AssetFactory,
	type AssetDefinition,
	type ProcessedAsset,
} from '@ecopages/core/services/asset-processing-service';
import type { AssetProcessingService } from '@ecopages/core/services/asset-processing-service';
import { IslandHydrationScriptCompiler, PageHydrationScriptCompiler } from './hydration-script-compiler.ts';
import { resolveHydrationBootstrapImports } from './bootstrap-imports.ts';
import { collectDeclaredModulesInConfig } from '../client-graph/declared-modules.ts';
import { hasPagePreloadExport } from '../client-graph/reachability-analyzer.ts';
import { fileSystem } from '@ecopages/file-system';
import type { BundleService } from '../bundling/bundle.ts';
import type { HmrPageMetadataCache } from '../hmr/page-metadata-cache.ts';
import type { ReactRouterAdapter } from '../contracts/router-adapter.ts';

/**
 * Configuration for the HydrationAssetService.
 */
export interface HydrationAssetServiceConfig {
	srcDir: string;
	routerAdapter?: ReactRouterAdapter;
	assetProcessingService: AssetProcessingService;
	bundleService: BundleService;
	hmrPageMetadataCache?: HmrPageMetadataCache;
}

type PageDependencyOptions = {
	pagePath: string;
	componentName: string;
	importPath: string;
	pageModuleUrlExpression: string;
	bundleOptions: Record<string, unknown>;
	hmrEnabled: boolean;
	useBrowserRuntimeImports: boolean;
	isMdx: boolean;
	hasPagePreload?: boolean;
};

/**
 * Derives the stable component key used by asset grouping and host selectors.
 *
 * @remarks
 * The key identifies the component entry. Individual SSR instances receive a
 * separate component ID, so repeated uses share browser assets without sharing
 * a React root.
 *
 * @param componentFile - Absolute source path of the React component.
 * @param config - Optional component identity used to distinguish entries.
 * @returns Stable key used in selectors and asset names.
 */
export function getIslandComponentKey(componentFile: string, config?: EcoComponentConfig): string {
	return rapidhash(`${componentFile}:${config?.identity?.id ?? ''}`).toString();
}

/**
 * Manages the creation of client-side hydration assets for React pages and component islands.
 */
export class HydrationAssetService {
	private readonly config: HydrationAssetServiceConfig;
	private readonly islandScriptCompiler = new IslandHydrationScriptCompiler();
	private readonly pageScriptCompiler = new PageHydrationScriptCompiler();
	private static readonly ROUTER_PAGE_GROUPED_BUNDLE_ID = 'ecopages-react-router-pages';

	constructor(config: HydrationAssetServiceConfig) {
		this.config = config;
	}

	private getIslandBundleName(componentFile: string): string {
		return `ecopages-react-island-${rapidhash(componentFile)}`;
	}

	private getIslandHydrationName(bundleName: string, componentKey: string): string {
		return `${bundleName}-hydration-${componentKey}`;
	}

	private getRouterPageGroupedEntryName(pagePath: string): string {
		const relativePath = path.relative(this.config.srcDir, pagePath);
		return relativePath
			.replace(/\.(tsx?|jsx?|mdx?)$/, '')
			.replace(/[\\/]+/g, '__')
			.replace(/\[([^\]]+)\]/g, '_$1_');
	}

	/**
	 * Resolves the browser import path used for a React-owned page or island module.
	 *
	 * @remarks
	 * When HMR is enabled, registers the source file as an HMR entrypoint and returns
	 * that URL. Otherwise returns the static resolved-assets path for the generated
	 * asset name.
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
	 * @remarks
	 * The entry is compiled asynchronously from the editable browser lifecycle.
	 * Production router pages may be grouped into the Page Browser Graph, while
	 * HMR entries remain separate ESM scripts with browser-resolvable imports.
	 */
	async createPageDependencies(options: PageDependencyOptions): Promise<AssetDefinition[]> {
		const {
			pagePath,
			componentName,
			importPath,
			pageModuleUrlExpression,
			bundleOptions,
			hmrEnabled,
			useBrowserRuntimeImports,
			isMdx,
			hasPagePreload,
		} = options;
		const runtimeImports = this.config.bundleService.getRuntimeImports();
		const groupedBundle =
			!hmrEnabled && this.config.routerAdapter
				? {
						id: HydrationAssetService.ROUTER_PAGE_GROUPED_BUNDLE_ID,
						entryName: this.getRouterPageGroupedEntryName(pagePath),
					}
				: undefined;
		const bootstrapImports = resolveHydrationBootstrapImports({
			useBrowserRuntimeImports,
			runtimeImports,
			routerAdapterImportPath: this.config.routerAdapter?.bundle.importPath,
		});
		const pageHydrationScript = await this.pageScriptCompiler.compile({
			importPath: hmrEnabled ? importPath : pagePath,
			pageModuleUrlExpression,
			scriptId: componentName,
			reactImportPath: bootstrapImports.reactImportPath,
			reactDomClientImportPath: bootstrapImports.reactDomClientImportPath,
			routerImportPath: bootstrapImports.routerImportPath,
			layoutComposeImportPath: bootstrapImports.layoutComposeImportPath,
			pageLayoutNormalizationImportPath: bootstrapImports.pageLayoutNormalizationImportPath,
			routerComponents: this.config.routerAdapter?.components,
			routerPropsExpression: this.config.routerAdapter?.getRouterProps('Page', 'props'),
			hmrEnabled,
			isMdx,
			hasPagePreload: hasPagePreload === true,
			minify: !hmrEnabled && isReactProductionRuntime(),
		});
		return [
			AssetFactory.createContentScript({
				position: 'head',
				content: pageHydrationScript,
				name: componentName,
				packageRole: 'page-script',
				/**
				 * @remarks
				 * HMR bootstraps stay unbundled write-through ESM. Helper imports must
				 * already be browser-resolvable vendor URLs from
				 * {@link resolveHydrationBootstrapImports}.
				 */
				bundle: !hmrEnabled,
				groupedBundle,
				bundleOptions,
				attributes: {
					type: 'module',
					defer: '',
					'data-eco-rerun': 'true',
					'data-eco-script-id': componentName,
					...(this.config.routerAdapter ? { 'data-eco-page-bootstrap': 'react-router' } : {}),
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
	 * @param config - Optional component config with identity attribution
	 * @returns Processed assets ready for injection
	 */
	async buildComponentRenderAssets(componentFile: string, config?: EcoComponentConfig): Promise<ProcessedAsset[]> {
		const componentName = this.getIslandBundleName(componentFile);
		const componentKey = getIslandComponentKey(componentFile, config);
		const hydrationName = this.getIslandHydrationName(componentName, componentKey);
		const hmrManager = this.config.assetProcessingService?.getHmrManager();
		const hmrEnabled = hmrManager?.isEnabled() ?? false;
		if (hmrEnabled) {
			this.config.hmrPageMetadataCache?.markOwnedEntrypoint(componentFile);
		}
		const importPath = await this.resolveAssetImportPath(componentFile, componentName);
		const runtimeImports = this.config.bundleService.getRuntimeImports();
		const islandHydrationOptions = {
			importPath,
			scriptId: hydrationName,
			reactImportPath: runtimeImports.react,
			reactDomClientImportPath: runtimeImports.reactDomClient,
			targetSelector: `[data-eco-component-key="${componentKey}"]`,
			componentRef: config?.identity?.id,
			componentFile,
			minify: !hmrEnabled,
			hmrEnabled,
		};
		const islandHydrationScript = await this.islandScriptCompiler.compile(islandHydrationOptions);

		const hydrationScript = AssetFactory.createContentScript({
			position: 'head',
			content: islandHydrationScript,
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
		});

		const dependencies: AssetDefinition[] = [hydrationScript];

		if (!hmrEnabled) {
			const declaredModules = collectDeclaredModulesInConfig(config);
			const bundleOptions = await this.config.bundleService.createBundleOptions(
				componentName,
				false,
				declaredModules,
			);
			dependencies.unshift(
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
			);
		}

		if (!this.config.assetProcessingService) {
			return [];
		}

		return this.config.assetProcessingService.processDependencies(dependencies, componentName);
	}

	/**
	 * Creates the page browser graph dependency declarations for a React page.
	 *
	 * @remarks
	 * Chooses shared vendor import URLs when HMR is on, when running a non-production
	 * hosted runtime with HMR off, or when a router adapter is configured (router
	 * pages always externalize to shared runtimes). Production non-router pages
	 * may inline React into the page bundle instead.
	 *
	 * @param pagePath - Absolute file path of the page
	 * @param isMdx - Whether the page is an MDX file
	 * @param declaredModules - Explicitly declared browser module specifiers
	 */
	async createPageBrowserGraphDependencies(
		pagePath: string,
		isMdx: boolean,
		declaredModules: string[],
	): Promise<AssetDefinition[]> {
		const componentName = `ecopages-react-${rapidhash(pagePath)}`;
		const hmrManager = this.config.assetProcessingService?.getHmrManager();
		const hmrEnabled = hmrManager?.isEnabled() ?? false;
		const productionRuntime = isReactProductionRuntime();
		const usesRouterRuntime = Boolean(this.config.routerAdapter);
		const useBrowserRuntimeImports = hmrEnabled || !productionRuntime || usesRouterRuntime;
		if (hmrEnabled) {
			this.config.hmrPageMetadataCache?.setDeclaredModules(pagePath, declaredModules);
		}

		const importPath = await this.resolveAssetImportPath(pagePath, componentName);
		const pageModuleUrlExpression = hmrEnabled ? JSON.stringify(importPath) : 'import.meta.url';
		let hasPagePreload = false;
		try {
			const source = await fileSystem.readFile(pagePath);
			hasPagePreload = hasPagePreloadExport(source, pagePath);
		} catch {
			hasPagePreload = false;
		}
		const bundleOptions = await this.config.bundleService.createBundleOptions(
			componentName,
			isMdx,
			declaredModules,
			{ includeRuntime: !useBrowserRuntimeImports, splitting: usesRouterRuntime },
		);
		const dependencies = await this.createPageDependencies({
			pagePath,
			componentName,
			importPath,
			pageModuleUrlExpression,
			bundleOptions,
			hmrEnabled,
			useBrowserRuntimeImports,
			isMdx,
			hasPagePreload,
		});

		return dependencies;
	}
}
