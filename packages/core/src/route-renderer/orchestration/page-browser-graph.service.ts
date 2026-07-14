import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { PageBrowserGraphContribution, PageBrowserGraphResult } from '../../types/public-types.ts';
import {
	type AssetDefinition,
	type AssetProcessingService,
	type ProcessedAsset,
} from '../../services/assets/asset-processing-service/index.ts';
import { appLogger } from '../../global/app-logger.ts';

function isGroupedContentScriptAsset(asset: AssetDefinition): asset is Extract<
	AssetDefinition,
	{ kind: 'script'; source: 'content' }
> & {
	groupedBundle: {
		id: string;
		entryName: string;
	};
} {
	return asset.kind === 'script' && asset.source === 'content' && Boolean(asset.groupedBundle?.id);
}

function getGroupedBundleAssetKey(groupedBundle: { id: string; entryName: string }): string {
	return `${groupedBundle.id}:${groupedBundle.entryName}`;
}

type GroupedPageBrowserAssetsResult = {
	assetsByRoute: Map<string, ProcessedAsset[]>;
	hasCollectionFailures: boolean;
};

export type PageBrowserGraphResolveInput = {
	routeFile: string;
	integrationName: string;
	collectContribution: (routeFile: string) => Promise<PageBrowserGraphContribution | undefined>;
};

/**
 * Resolves declarative page browser graph assets for one route and integration.
 */
export class PageBrowserGraphService {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly assetProcessingService: AssetProcessingService;
	private readonly pageBrowserGraphCache = new Map<string, Promise<PageBrowserGraphResult | undefined>>();
	private readonly groupedPageBrowserGraphCache = new Map<string, Promise<Map<string, ProcessedAsset[]>>>();

	constructor(appConfig: EcoPagesAppConfig, assetProcessingService: AssetProcessingService) {
		this.appConfig = appConfig;
		this.assetProcessingService = assetProcessingService;
	}

	async resolvePageBrowserGraph(input: PageBrowserGraphResolveInput): Promise<PageBrowserGraphResult | undefined> {
		if (this.isHmrEnabled()) {
			return await this.buildPageBrowserGraph(input);
		}

		const cacheKey = `${input.integrationName}:${input.routeFile}`;
		const cachedGraph = this.pageBrowserGraphCache.get(cacheKey);

		if (cachedGraph) {
			return await cachedGraph;
		}

		const pendingGraph = this.buildPageBrowserGraph(input).catch((error) => {
			this.pageBrowserGraphCache.delete(cacheKey);
			throw error;
		});
		this.pageBrowserGraphCache.set(cacheKey, pendingGraph);

		return await pendingGraph;
	}

	private isHmrEnabled(): boolean {
		return (
			typeof this.assetProcessingService.getHmrManager === 'function' &&
			this.assetProcessingService.getHmrManager()?.isEnabled() === true
		);
	}

	private async buildPageBrowserGraph(
		input: PageBrowserGraphResolveInput,
	): Promise<PageBrowserGraphResult | undefined> {
		const contribution = await input.collectContribution(input.routeFile);

		if (!contribution) {
			return undefined;
		}

		const groupedDependencies = (contribution.dependencies ?? []).filter((dep) => isGroupedContentScriptAsset(dep));
		const ungroupedDependencies = (contribution.dependencies ?? []).filter(
			(dep) => !isGroupedContentScriptAsset(dep),
		);

		const groupedAssets = groupedDependencies.length
			? ((await this.resolveGroupedPageBrowserAssets(input, contribution)).get(input.routeFile) ?? [])
			: [];

		const processedDependencies = ungroupedDependencies.length
			? await this.assetProcessingService.processDependencies(
					ungroupedDependencies,
					`${input.integrationName}:${input.routeFile}`,
				)
			: [];
		const resolvedAssets = [...processedDependencies, ...groupedAssets, ...(contribution.assets ?? [])];

		return this.partitionPageBrowserGraphAssets(resolvedAssets);
	}

	private async resolveGroupedPageBrowserAssets(
		input: PageBrowserGraphResolveInput,
		currentContribution: PageBrowserGraphContribution,
	): Promise<Map<string, ProcessedAsset[]>> {
		if (this.isHmrEnabled()) {
			const result = await this.buildGroupedPageBrowserAssets(input, currentContribution);
			return result.assetsByRoute;
		}

		const cacheKey = input.integrationName;
		let pending = this.groupedPageBrowserGraphCache.get(cacheKey);
		if (!pending) {
			pending = this.buildGroupedPageBrowserAssets(input, currentContribution)
				.then((result) => {
					if (result.hasCollectionFailures) {
						this.groupedPageBrowserGraphCache.delete(cacheKey);
					}

					return result.assetsByRoute;
				})
				.catch((error) => {
					this.groupedPageBrowserGraphCache.delete(cacheKey);
					throw error;
				});
			this.groupedPageBrowserGraphCache.set(cacheKey, pending);
		}

		return await pending;
	}

	private async buildGroupedPageBrowserAssets(
		input: PageBrowserGraphResolveInput,
		currentContribution: PageBrowserGraphContribution,
	): Promise<GroupedPageBrowserAssetsResult> {
		const routeFiles = await this.listIntegrationRouteFiles(input.integrationName);
		const currentRouteGroupedDependencies = (currentContribution.dependencies ?? []).filter((dep) =>
			isGroupedContentScriptAsset(dep),
		);
		const groupedDependencies: AssetDefinition[] = [...currentRouteGroupedDependencies];
		const groupedAssetKeysByRoute = new Map<string, Set<string>>();
		let hasCollectionFailures = false;
		if (currentRouteGroupedDependencies.length > 0) {
			groupedAssetKeysByRoute.set(
				input.routeFile,
				new Set(currentRouteGroupedDependencies.map((dep) => getGroupedBundleAssetKey(dep.groupedBundle))),
			);
		}

		for (const routeFile of routeFiles) {
			if (routeFile === input.routeFile) {
				continue;
			}

			let contribution: PageBrowserGraphContribution | undefined;
			try {
				contribution = await input.collectContribution(routeFile);
			} catch (error) {
				hasCollectionFailures = true;
				appLogger.warn(
					`Skipping grouped page-browser contribution for ${routeFile}: ${error instanceof Error ? error.message : String(error)}`,
				);
				continue;
			}

			if (this.isHmrEnabled()) {
				continue;
			}

			if (!contribution?.dependencies?.length) {
				continue;
			}

			const routeGroupedDependencies = contribution.dependencies.filter((dep) =>
				isGroupedContentScriptAsset(dep),
			);
			if (routeGroupedDependencies.length === 0) {
				continue;
			}

			groupedDependencies.push(...routeGroupedDependencies);
			groupedAssetKeysByRoute.set(
				routeFile,
				new Set(routeGroupedDependencies.map((dep) => getGroupedBundleAssetKey(dep.groupedBundle))),
			);
		}

		if (groupedDependencies.length === 0) {
			return {
				assetsByRoute: new Map(),
				hasCollectionFailures,
			};
		}

		const processedGroupedDependencies = await this.assetProcessingService.processDependencies(
			groupedDependencies,
			`${input.integrationName}:grouped-page-browser-graph`,
		);
		const groupedAssetsByRoute = new Map<string, ProcessedAsset[]>();

		for (const [routeFile, groupedAssetKeys] of groupedAssetKeysByRoute) {
			const matchedAssets = processedGroupedDependencies.filter((asset) => {
				if (!asset.groupedBundle) {
					return false;
				}

				return groupedAssetKeys.has(getGroupedBundleAssetKey(asset.groupedBundle));
			});

			if (groupedAssetKeys.size > 0 && matchedAssets.length === 0) {
				appLogger.warn(
					`Grouped page-browser assets for ${routeFile} are missing groupedBundle metadata after processing. Hydration scripts may be omitted from HTML.`,
				);
			}

			groupedAssetsByRoute.set(routeFile, matchedAssets);
		}

		return {
			assetsByRoute: groupedAssetsByRoute,
			hasCollectionFailures,
		};
	}

	private async listIntegrationRouteFiles(integrationName: string): Promise<string[]> {
		const integration = this.appConfig.integrations.find((plugin) => plugin.name === integrationName);
		if (!integration) {
			return [];
		}

		const scannedFiles = await fileSystem.glob(
			integration.extensions.map((extension) => `**/*${extension}`),
			{ cwd: this.appConfig.absolutePaths.pagesDir },
		);

		return scannedFiles
			.filter((file) => !file.includes('.ecopages-node.'))
			.map((file) => path.join(this.appConfig.absolutePaths.pagesDir, file))
			.sort((left, right) => left.localeCompare(right));
	}

	private partitionPageBrowserGraphAssets(assets: ProcessedAsset[]): PageBrowserGraphResult {
		const entryAssets: ProcessedAsset[] = [];
		const chunkAssets: ProcessedAsset[] = [];

		for (const asset of assets) {
			if (asset.packageRole === 'dynamic-chunk') {
				chunkAssets.push(asset);
				continue;
			}

			entryAssets.push(asset);
		}

		return { entryAssets, chunkAssets };
	}
}
