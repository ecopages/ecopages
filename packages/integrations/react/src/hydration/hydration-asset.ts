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
import { contentHash, RESOLVED_ASSETS_DIR, toRootRelativePath } from '@ecopages/core/build';
import type { PageClientBuildEntry } from '@ecopages/core/integration';
import {
	APP_BROWSER_CLIENT_BUNDLE_ID,
	AssetFactory,
	type AssetDefinition,
	type ContentScriptAsset,
	type ProcessedAsset,
} from '@ecopages/core/integration';
import type { AssetProcessingIntegration, AssetProcessingService } from '@ecopages/core/integration';
import { createIslandEntrySource } from './hydration-island-entry-source.ts';
import { createPageEntrySource } from './hydration-page-entry-source.ts';
import { collectDeclaredModulesInConfig } from '../client-graph/declared-modules.ts';
import type { BundleService } from '../bundling/bundle.ts';
import type { HmrPageMetadataCache } from '../hmr/page-metadata-cache.ts';
import type { ReactRouterAdapter } from '../contracts/router-adapter.ts';

/**
 * Configuration for the HydrationAssetService.
 */
export interface HydrationAssetServiceConfig {
	/** The app root: entry names and keys hash source paths relative to it, so they survive a moved project. */
	rootDir: string;
	srcDir: string;
	routerAdapter?: ReactRouterAdapter;
	assetProcessingService: AssetProcessingService;
	assetProcessingIntegration?: AssetProcessingIntegration;
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
	isMdx: boolean;
};

/**
 * Derives the stable component key used by asset grouping and host selectors.
 *
 * @remarks
 * The key identifies the component entry. Individual SSR instances receive a
 * separate component ID, so repeated uses share browser assets without sharing
 * a React root.
 *
 * @param sourceKey - Source path of the React component relative to the app root (`toRootRelativePath`).
 * @param config - Optional component identity used to distinguish entries.
 * @returns Stable key used in selectors and asset names.
 */
export function getIslandComponentKey(sourceKey: string, config?: EcoComponentConfig): string {
	return BigInt(`0x${contentHash(`${sourceKey}:${config?.identity?.id ?? ''}`, 16)}`).toString(10);
}

type IslandInput = { file: string; config?: EcoComponentConfig };

/**
 * Manages the creation of client-side hydration assets for React pages and component islands.
 */
export class HydrationAssetService {
	private readonly config: HydrationAssetServiceConfig;

	constructor(config: HydrationAssetServiceConfig) {
		this.config = config;
	}

	private toSourceKey(filePath: string): string {
		return toRootRelativePath(this.config.rootDir, filePath);
	}

	private getIslandBundleName(componentFile: string): string {
		return `ecopages-react-island-${BigInt(`0x${contentHash(this.toSourceKey(componentFile), 16)}`).toString()}`;
	}

	private getIslandComponentKey(island: IslandInput): string {
		return getIslandComponentKey(this.toSourceKey(island.file), island.config);
	}

	private getIslandHydrationName(bundleName: string, componentKey: string): string {
		return `${bundleName}-hydration-${componentKey}`;
	}

	private getPageGroupedEntryName(pagePath: string): string {
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
	 * The entry imports the `@ecopages/react/page-hydration` lifecycle and React by package name. Outside HMR it is
	 * an entry of the app-wide browser build, so React and every other shared module are chunks it shares with the
	 * islands and the other Pages. With HMR it stays a separate unbundled ESM script whose imports core rewrites to
	 * dev-transform and vendor URLs.
	 */
	async createPageDependencies(options: PageDependencyOptions): Promise<AssetDefinition[]> {
		const { pagePath, componentName, importPath, pageModuleUrlExpression, bundleOptions, hmrEnabled, isMdx } =
			options;
		const groupedBundle = hmrEnabled
			? undefined
			: { id: APP_BROWSER_CLIENT_BUNDLE_ID, entryName: this.getPageGroupedEntryName(pagePath) };
		const pageHydrationScript = createPageEntrySource({
			importPath: hmrEnabled ? importPath : pagePath,
			pageModuleUrlExpression,
			scriptId: componentName,
			routerImportPath: this.config.routerAdapter?.importPath,
			routerComponents: this.config.routerAdapter?.components,
			routerPropsExpression: this.config.routerAdapter?.getRouterProps('Page', 'props'),
			hmrEnabled,
			isMdx,
		});
		return [
			AssetFactory.createContentScript({
				position: 'head',
				content: pageHydrationScript,
				name: componentName,
				bundledSourceFilepaths: [pagePath],
				packageRole: 'page-script',
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
	 * Builds island and lazy-entry browser assets in one grouped multi-entry build.
	 *
	 * @remarks
	 * Production reads island module URLs from processed grouped-build outputs.
	 * HMR keeps per-file transform URLs and does not start a disk bundle.
	 */
	async buildPageClientAssets(input: {
		islands: IslandInput[];
		lazyEntries?: AssetDefinition[];
	}): Promise<ProcessedAsset[]> {
		if (!this.config.assetProcessingService) {
			return [];
		}

		const uniqueIslands = this.uniqueIslands(input.islands);
		const hmrEnabled = this.config.assetProcessingService.getHmrManager()?.isEnabled() ?? false;
		if (hmrEnabled) {
			return this.buildHmrPageClientAssets(uniqueIslands, input.lazyEntries);
		}

		return this.buildGroupedPageClientAssets(uniqueIslands, input.lazyEntries);
	}

	/** Collects React island hydration entries for a grouped browser build, which is the app-wide build in production. */
	async collectAppBrowserClientBuildEntries(islands: IslandInput[]): Promise<PageClientBuildEntry[]> {
		const uniqueIslands = this.uniqueIslands(islands);
		const groupedEntrypointFiles = [...new Set(uniqueIslands.map(({ file }) => file))];
		const groupedDeclaredModules = [
			...new Set(uniqueIslands.flatMap(({ config }) => collectDeclaredModulesInConfig(config))),
		];
		const entries: PageClientBuildEntry[] = [];

		for (const island of uniqueIslands) {
			const componentName = this.getIslandBundleName(island.file);
			const declaredModules = collectDeclaredModulesInConfig(island.config);
			const bundleOptions = await this.config.bundleService.createBundleOptions(
				componentName,
				declaredModules,
				island.file,
				groupedEntrypointFiles,
				groupedDeclaredModules,
			);
			const hydrationName = this.getIslandHydrationName(componentName, this.getIslandComponentKey(island));
			const hydrationScript = this.createIslandHydrationScript(island, island.file, false);
			entries.push({
				dependency: {
					...hydrationScript,
					bundle: true,
					groupedBundle: {
						id: APP_BROWSER_CLIENT_BUNDLE_ID,
						entryName: hydrationName,
					},
					bundleOptions,
				},
			});
		}

		return entries;
	}

	/**
	 * Keeps one entry per component; a file that declares several island components keeps each of them.
	 *
	 * @remarks
	 * An island's `file` is its identity file, relative to the app root; it is resolved here so every later step
	 * bundles and watches the real file.
	 */
	private uniqueIslands(islands: IslandInput[]): IslandInput[] {
		const uniqueIslands: IslandInput[] = [];
		const seenKeys = new Set<string>();
		for (const input of islands) {
			const island = { ...input, file: path.resolve(this.config.rootDir, input.file) };
			const key = this.getIslandComponentKey(island);
			if (seenKeys.has(key)) {
				continue;
			}
			seenKeys.add(key);
			uniqueIslands.push(island);
		}
		return uniqueIslands;
	}

	private async buildHmrPageClientAssets(
		uniqueIslands: IslandInput[],
		lazyEntries?: AssetDefinition[],
	): Promise<ProcessedAsset[]> {
		const processedAssets: ProcessedAsset[] = [];
		for (const island of uniqueIslands) {
			this.config.hmrPageMetadataCache?.markOwnedEntrypoint(island.file);
			processedAssets.push(...(await this.buildHmrIslandAssets(island)));
		}
		if (lazyEntries?.length) {
			processedAssets.push(
				...(await this.config.assetProcessingService.processDependencies(
					lazyEntries,
					this.config.assetProcessingIntegration,
				)),
			);
		}
		return processedAssets;
	}

	/**
	 * Builds the island hydration entries and lazy entries in one grouped browser build.
	 *
	 * @remarks
	 * Each hydration entry imports its island module and React by package name, so the build shares React, the
	 * bootstrap and every common module between them as chunks.
	 */
	private async buildGroupedPageClientAssets(
		uniqueIslands: IslandInput[],
		lazyEntries?: AssetDefinition[],
	): Promise<ProcessedAsset[]> {
		const hydrationEntries = await this.collectAppBrowserClientBuildEntries(uniqueIslands);
		const clientEntries = [...hydrationEntries.map(({ dependency }) => dependency), ...(lazyEntries ?? [])];
		if (clientEntries.length === 0) {
			return [];
		}
		return this.config.assetProcessingService.processDependencies(
			clientEntries,
			this.config.assetProcessingIntegration,
		);
	}

	private async buildHmrIslandAssets(island: IslandInput): Promise<ProcessedAsset[]> {
		const importPath = await this.resolveAssetImportPath(island.file, this.getIslandBundleName(island.file));
		const hydrationScript = this.createIslandHydrationScript(island, importPath, true);
		return this.config.assetProcessingService.processDependencies(
			[hydrationScript],
			this.config.assetProcessingIntegration,
		);
	}

	/**
	 * @remarks
	 * The entry lists the island file it imports by absolute path in `bundledSourceFilepaths`, so its dependency key
	 * hashes its text with that file written relative to the app root; its name hashes the root-relative path too.
	 */
	private createIslandHydrationScript(
		island: IslandInput,
		importPath: string,
		hmrEnabled: boolean,
	): ContentScriptAsset {
		const { file: componentFile, config } = island;
		const componentName = this.getIslandBundleName(componentFile);
		const componentKey = this.getIslandComponentKey(island);
		const hydrationName = this.getIslandHydrationName(componentName, componentKey);
		const islandHydrationScript = createIslandEntrySource({
			importPath,
			scriptId: hydrationName,
			targetSelector: `[data-eco-component-key="${componentKey}"]`,
			componentRef: config?.identity?.id,
			hmrEnabled,
		});

		return AssetFactory.createContentScript({
			position: 'head',
			content: islandHydrationScript,
			name: hydrationName,
			bundledSourceFilepaths: [componentFile],
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
	 * @param pagePath - Absolute file path of the page
	 * @param isMdx - Whether the page is an MDX file
	 * @param declaredModules - Explicitly declared browser module specifiers
	 */
	async createPageBrowserGraphDependencies(
		pagePath: string,
		isMdx: boolean,
		declaredModules: string[],
	): Promise<AssetDefinition[]> {
		const componentName = `ecopages-react-${BigInt(`0x${contentHash(this.toSourceKey(pagePath), 16)}`).toString()}`;
		const hmrManager = this.config.assetProcessingService?.getHmrManager();
		const hmrEnabled = hmrManager?.isEnabled() ?? false;
		if (hmrEnabled) {
			this.config.hmrPageMetadataCache?.setDeclaredModules(pagePath, declaredModules);
		}

		const importPath = await this.resolveAssetImportPath(pagePath, componentName);
		const pageModuleUrlExpression = hmrEnabled ? JSON.stringify(importPath) : 'import.meta.url';
		const bundleOptions = {
			...(await this.config.bundleService.createBundleOptions(componentName, declaredModules, pagePath)),
			splitting: true,
		};
		const dependencies = await this.createPageDependencies({
			pagePath,
			componentName,
			importPath,
			pageModuleUrlExpression,
			bundleOptions,
			hmrEnabled,
			isMdx,
		});

		return dependencies;
	}
}
