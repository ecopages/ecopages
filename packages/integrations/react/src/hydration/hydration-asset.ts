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
import { isReactProductionRuntime } from '../bundling/runtime-mode.ts';
import {
	APP_BROWSER_CLIENT_BUNDLE_ID,
	AssetFactory,
	createAppBrowserClientEntry,
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
	private static readonly ROUTER_PAGE_GROUPED_BUNDLE_ID = APP_BROWSER_CLIENT_BUNDLE_ID;

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
	 * Builds client-side assets for one React component island.
	 */
	async buildComponentRenderAssets(componentFile: string, config?: EcoComponentConfig): Promise<ProcessedAsset[]> {
		const { assetsByFile } = await this.buildPageClientRenderAssets({
			islands: [{ file: componentFile, config }],
		});
		return assetsByFile.get(componentFile) ?? [];
	}

	/**
	 * Builds island and lazy-entry browser assets in one grouped multi-entry build.
	 *
	 * @remarks
	 * Production reads island module URLs from processed grouped-build outputs.
	 * HMR keeps per-file transform URLs and does not start a disk bundle.
	 */
	async buildPageClientRenderAssets(input: {
		islands: Array<{ file: string; config?: EcoComponentConfig }>;
		lazyEntries?: AssetDefinition[];
	}): Promise<{ assetsByFile: Map<string, ProcessedAsset[]>; processedAssets: ProcessedAsset[] }> {
		if (!this.config.assetProcessingService) {
			return { assetsByFile: new Map(), processedAssets: [] };
		}

		const uniqueIslands = this.uniqueIslands(input.islands);
		const hmrEnabled = this.config.assetProcessingService.getHmrManager()?.isEnabled() ?? false;
		if (hmrEnabled) {
			return this.buildHmrPageClientRenderAssets(uniqueIslands, input.lazyEntries);
		}

		return this.buildGroupedPageClientRenderAssets(uniqueIslands, input.lazyEntries);
	}

	private uniqueIslands(
		islands: Array<{ file: string; config?: EcoComponentConfig }>,
	): Array<{ file: string; config?: EcoComponentConfig }> {
		const uniqueIslands: Array<{ file: string; config?: EcoComponentConfig }> = [];
		const seenFiles = new Set<string>();
		for (const island of islands) {
			if (seenFiles.has(island.file)) {
				continue;
			}
			seenFiles.add(island.file);
			uniqueIslands.push(island);
		}
		return uniqueIslands;
	}

	private async buildHmrPageClientRenderAssets(
		uniqueIslands: Array<{ file: string; config?: EcoComponentConfig }>,
		lazyEntries?: AssetDefinition[],
	): Promise<{ assetsByFile: Map<string, ProcessedAsset[]>; processedAssets: ProcessedAsset[] }> {
		const assetsByFile = new Map<string, ProcessedAsset[]>();
		const processedAssets: ProcessedAsset[] = [];
		for (const island of uniqueIslands) {
			this.config.hmrPageMetadataCache?.markOwnedEntrypoint(island.file);
			const assets = await this.buildHmrIslandRenderAssets(island.file, island.config);
			assetsByFile.set(island.file, assets);
			processedAssets.push(...assets);
		}
		if (lazyEntries?.length) {
			processedAssets.push(
				...(await this.config.assetProcessingService.processDependencies(
					lazyEntries,
					APP_BROWSER_CLIENT_BUNDLE_ID,
				)),
			);
		}
		return { assetsByFile, processedAssets };
	}

	private async buildGroupedPageClientRenderAssets(
		uniqueIslands: Array<{ file: string; config?: EcoComponentConfig }>,
		lazyEntries?: AssetDefinition[],
	): Promise<{ assetsByFile: Map<string, ProcessedAsset[]>; processedAssets: ProcessedAsset[] }> {
		const islandEntries = await this.createGroupedIslandEntries(uniqueIslands);
		const clientEntries = [...islandEntries, ...(lazyEntries ?? [])];
		const processedClientEntries =
			clientEntries.length > 0
				? await this.config.assetProcessingService.processDependencies(
						clientEntries,
						APP_BROWSER_CLIENT_BUNDLE_ID,
					)
				: [];
		const srcUrlByEntryName = this.indexSrcUrlsByEntryName(processedClientEntries);
		const hydrationScripts = await this.createGroupedHydrationScripts(uniqueIslands, srcUrlByEntryName);
		const processedHydration =
			hydrationScripts.length > 0
				? await this.config.assetProcessingService.processDependencies(
						hydrationScripts,
						APP_BROWSER_CLIENT_BUNDLE_ID,
					)
				: [];

		return {
			assetsByFile: this.collectIslandAssetsByFile(uniqueIslands, processedClientEntries, processedHydration),
			processedAssets: [...processedClientEntries, ...processedHydration],
		};
	}

	private async createGroupedIslandEntries(
		uniqueIslands: Array<{ file: string; config?: EcoComponentConfig }>,
	): Promise<AssetDefinition[]> {
		const islandEntries: AssetDefinition[] = [];
		for (const island of uniqueIslands) {
			const componentName = this.getIslandBundleName(island.file);
			const bundleOptions = await this.config.bundleService.createBundleOptions(
				componentName,
				false,
				collectDeclaredModulesInConfig(island.config),
			);
			islandEntries.push(
				createAppBrowserClientEntry({
					entryName: componentName,
					importPath: island.file,
					reexport: true,
					packageRole: 'dynamic-chunk',
					bundleOptions,
					attributes: {
						'data-eco-persist': 'true',
					},
				}),
			);
		}
		return islandEntries;
	}

	private indexSrcUrlsByEntryName(processedClientEntries: ProcessedAsset[]): Map<string, string> {
		const srcUrlByEntryName = new Map<string, string>();
		for (const processed of processedClientEntries) {
			const entryName = processed.groupedBundle?.entryName;
			if (entryName && processed.srcUrl) {
				srcUrlByEntryName.set(entryName, processed.srcUrl);
			}
		}
		return srcUrlByEntryName;
	}

	private async createGroupedHydrationScripts(
		uniqueIslands: Array<{ file: string; config?: EcoComponentConfig }>,
		srcUrlByEntryName: Map<string, string>,
	): Promise<AssetDefinition[]> {
		const hydrationScripts: AssetDefinition[] = [];
		for (const island of uniqueIslands) {
			const importPath = srcUrlByEntryName.get(this.getIslandBundleName(island.file));
			if (!importPath) {
				throw new Error(`Missing grouped browser output for island ${island.file}`);
			}
			hydrationScripts.push(
				await this.createIslandHydrationScript(island.file, island.config, importPath, false),
			);
		}
		return hydrationScripts;
	}

	private collectIslandAssetsByFile(
		uniqueIslands: Array<{ file: string; config?: EcoComponentConfig }>,
		processedClientEntries: ProcessedAsset[],
		processedHydration: ProcessedAsset[],
	): Map<string, ProcessedAsset[]> {
		const assetsByFile = new Map<string, ProcessedAsset[]>();
		const hydrationByName = new Map<string, ProcessedAsset[]>();
		for (const processed of processedHydration) {
			const name = processed.attributes?.['data-eco-script-id'];
			if (!name) {
				continue;
			}
			const existing = hydrationByName.get(name) ?? [];
			existing.push(processed);
			hydrationByName.set(name, existing);
		}

		for (const island of uniqueIslands) {
			const componentName = this.getIslandBundleName(island.file);
			const hydrationName = this.getIslandHydrationName(
				componentName,
				getIslandComponentKey(island.file, island.config),
			);
			const islandAsset = processedClientEntries.find(
				(processed) => processed.groupedBundle?.entryName === componentName,
			);
			assetsByFile.set(island.file, [
				...(islandAsset ? [islandAsset] : []),
				...(hydrationByName.get(hydrationName) ?? []),
			]);
		}
		return assetsByFile;
	}

	private async buildHmrIslandRenderAssets(
		componentFile: string,
		config?: EcoComponentConfig,
	): Promise<ProcessedAsset[]> {
		const importPath = await this.resolveAssetImportPath(componentFile, this.getIslandBundleName(componentFile));
		const hydrationScript = await this.createIslandHydrationScript(componentFile, config, importPath, true);
		return this.config.assetProcessingService.processDependencies(
			[hydrationScript],
			this.getIslandBundleName(componentFile),
		);
	}

	private async createIslandHydrationScript(
		componentFile: string,
		config: EcoComponentConfig | undefined,
		importPath: string,
		hmrEnabled: boolean,
	): Promise<AssetDefinition> {
		const componentName = this.getIslandBundleName(componentFile);
		const componentKey = getIslandComponentKey(componentFile, config);
		const hydrationName = this.getIslandHydrationName(componentName, componentKey);
		const runtimeImports = this.config.bundleService.getRuntimeImports();
		const islandHydrationScript = await this.islandScriptCompiler.compile({
			importPath,
			scriptId: hydrationName,
			reactImportPath: runtimeImports.react,
			reactDomClientImportPath: runtimeImports.reactDomClient,
			targetSelector: `[data-eco-component-key="${componentKey}"]`,
			componentRef: config?.identity?.id,
			componentFile,
			minify: !hmrEnabled,
			hmrEnabled,
		});

		return AssetFactory.createContentScript({
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
