import path from 'node:path';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { PageBrowserGraphContribution, PageBrowserGraphResult } from '../../../types/public-types.ts';
import {
	type AssetDefinition,
	type AssetProcessingService,
	type ProcessedAsset,
} from '../../../services/assets/asset-processing-service/index.ts';
import { appLogger } from '../../../global/app-logger.ts';
import { startupTrace } from '../../../diagnostics/startup-trace.ts';
import {
	collectPageBrowserGraphDependencyPaths,
	createPageBrowserGraphEntryFingerprint,
	getAppPageBrowserGraphSession,
	type GraphBuildResult,
	type GraphPolicy,
} from './page-browser-graph-session.ts';
import { createRouteGraphLookupKey } from './route-instance-key.ts';
import type { GroupedGraphBuildPlan } from './grouped-graph-build-plan.ts';

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
	dependencyPaths: ReadonlySet<string>;
	hasCollectionFailures: boolean;
	cacheable: boolean;
};

export type GroupedPageBrowserGraphContribution = {
	routeFile: string;
	dependencyInstanceKey: string;
	contribution: PageBrowserGraphContribution | undefined;
};

export type PageBrowserGraphResolveInput = {
	routeFile: string;
	dependencyInstanceKey?: string;
	integrationName: string;
	collectContribution: () => Promise<PageBrowserGraphContribution | undefined>;
	groupedBuildPlan?: GroupedGraphBuildPlan;
	policy?: GraphPolicy;
};

/**
 * Resolves declarative page browser graph assets for one route and integration.
 */
export class PageBrowserGraphService {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly assetProcessingService: AssetProcessingService;

	constructor(appConfig: EcoPagesAppConfig, assetProcessingService: AssetProcessingService) {
		this.appConfig = appConfig;
		this.assetProcessingService = assetProcessingService;
	}

	async resolvePageBrowserGraph(input: PageBrowserGraphResolveInput): Promise<PageBrowserGraphResult | undefined> {
		return await this.getOrBuild(input);
	}

	/**
	 * Resolves or builds one Page Browser Graph under the given policy.
	 */
	async getOrBuild(input: PageBrowserGraphResolveInput): Promise<PageBrowserGraphResult | undefined> {
		const policy = input.policy ?? this.resolveGraphPolicy();
		const session = getAppPageBrowserGraphSession(this.appConfig);
		const dependencyInstanceKey = input.dependencyInstanceKey ?? '';

		if (!this.isHmrEnabled()) {
			const cachedByRoute = session.getGraphByRoute(
				input.integrationName,
				input.routeFile,
				policy,
				dependencyInstanceKey,
			);
			if (cachedByRoute) {
				return cachedByRoute;
			}
		}

		const contribution = await input.collectContribution();
		if (!contribution) {
			return undefined;
		}

		const entryFingerprint = createPageBrowserGraphEntryFingerprint(contribution);

		return await session.resolveGraph(
			{
				integrationName: input.integrationName,
				routeFile: input.routeFile,
				dependencyInstanceKey,
				entryFingerprint,
				policy,
			},
			collectPageBrowserGraphDependencyPaths(input.routeFile, contribution, contribution.assets ?? []),
			async () => this.buildPageBrowserGraphRecord(input, contribution),
		);
	}

	private resolveGraphPolicy(): GraphPolicy {
		return this.isHmrEnabled() ? 'development' : 'production';
	}

	private isHmrEnabled(): boolean {
		return (
			typeof this.assetProcessingService.getHmrManager === 'function' &&
			this.assetProcessingService.getHmrManager()?.isEnabled() === true
		);
	}

	private async buildPageBrowserGraphRecord(
		input: PageBrowserGraphResolveInput,
		contribution: PageBrowserGraphContribution,
	): Promise<GraphBuildResult | undefined> {
		const result = await this.materializePageBrowserGraph(input, contribution);
		if (!result) {
			return undefined;
		}

		startupTrace.markFirstPageBrowserGraphReady(getAppPageBrowserGraphSession(this.appConfig).getBuildCount());
		return result;
	}

	private async materializePageBrowserGraph(
		input: PageBrowserGraphResolveInput,
		contribution: PageBrowserGraphContribution,
	): Promise<GraphBuildResult | undefined> {
		const groupedDependencies = (contribution.dependencies ?? []).filter((dep) => isGroupedContentScriptAsset(dep));
		const ungroupedDependencies = (contribution.dependencies ?? []).filter(
			(dep) => !isGroupedContentScriptAsset(dep),
		);

		const groupedResolution = groupedDependencies.length
			? await this.resolveGroupedPageBrowserAssets(input, contribution)
			: undefined;

		const groupedAssets =
			groupedResolution?.assetsByRoute.get(
				createRouteGraphLookupKey(input.routeFile, input.dependencyInstanceKey ?? ''),
			) ?? [];

		const processedDependencies = ungroupedDependencies.length
			? await this.assetProcessingService.processDependencies(
					ungroupedDependencies,
					`${input.integrationName}:${input.routeFile}`,
				)
			: [];
		const resolvedAssets = [...processedDependencies, ...groupedAssets, ...(contribution.assets ?? [])];
		const result = this.partitionPageBrowserGraphAssets(resolvedAssets);
		const dependencyPaths = collectPageBrowserGraphDependencyPaths(input.routeFile, contribution, resolvedAssets);

		return {
			result,
			dependencyPaths,
			cacheable: groupedResolution?.cacheable ?? true,
		};
	}

	private async resolveGroupedPageBrowserAssets(
		input: PageBrowserGraphResolveInput,
		currentContribution: PageBrowserGraphContribution,
	): Promise<GroupedPageBrowserAssetsResult> {
		if (this.isHmrEnabled()) {
			return await this.buildGroupedPageBrowserAssets(input, currentContribution);
		}

		if (!input.groupedBuildPlan) {
			const built = await this.buildGroupedPageBrowserAssets(input, currentContribution);
			return {
				...built,
				cacheable: false,
			};
		}

		const session = getAppPageBrowserGraphSession(this.appConfig);
		const groupedScope = {
			integrationName: input.integrationName,
			planKey: input.groupedBuildPlan.planKey,
		};
		let groupedCacheable = true;
		const assetsByRoute = await session.resolveGroupedGraph(groupedScope, async () => {
			const built = await this.buildGroupedPageBrowserAssets(input, currentContribution);
			groupedCacheable = !built.hasCollectionFailures;
			if (built.hasCollectionFailures) {
				return {
					skipCache: true,
					assetsByRoute: built.assetsByRoute,
					dependencyPaths: built.dependencyPaths,
				};
			}

			return {
				assetsByRoute: built.assetsByRoute,
				dependencyPaths: built.dependencyPaths,
				generation: 0,
			};
		});

		return {
			assetsByRoute,
			dependencyPaths: new Set(),
			hasCollectionFailures: !groupedCacheable,
			cacheable: groupedCacheable,
		};
	}

	private async buildGroupedPageBrowserAssets(
		input: PageBrowserGraphResolveInput,
		currentContribution: PageBrowserGraphContribution,
	): Promise<GroupedPageBrowserAssetsResult> {
		const dependencyInstanceKey = input.dependencyInstanceKey ?? '';
		const currentRouteLookupKey = createRouteGraphLookupKey(input.routeFile, dependencyInstanceKey);
		const groupedCollection = input.groupedBuildPlan
			? {
					contributions: input.groupedBuildPlan.instances.map((instance) => ({
						routeFile: instance.routeFile,
						dependencyInstanceKey: instance.dependencyInstanceKey,
						contribution: instance.contribution,
					})),
					hasCollectionFailures: false,
				}
			: {
					contributions: [] as GroupedPageBrowserGraphContribution[],
					hasCollectionFailures: false,
				};
		const groupedContributions = groupedCollection.contributions;
		const currentRouteGroupedDependencies = (currentContribution.dependencies ?? []).filter((dep) =>
			isGroupedContentScriptAsset(dep),
		);
		const groupedDependencies: AssetDefinition[] = [...currentRouteGroupedDependencies];
		const groupedAssetKeysByRoute = new Map<string, Set<string>>();
		const routeDisplayPaths = new Map<string, string>();
		const dependencyPaths = new Set<string>([path.resolve(input.routeFile)]);
		let hasCollectionFailures = groupedCollection.hasCollectionFailures;
		if (currentRouteGroupedDependencies.length > 0) {
			groupedAssetKeysByRoute.set(
				currentRouteLookupKey,
				new Set(currentRouteGroupedDependencies.map((dep) => getGroupedBundleAssetKey(dep.groupedBundle))),
			);
			routeDisplayPaths.set(currentRouteLookupKey, input.routeFile);
		}

		for (const groupedContribution of groupedContributions) {
			if (
				groupedContribution.routeFile === input.routeFile &&
				groupedContribution.dependencyInstanceKey === dependencyInstanceKey
			) {
				continue;
			}

			const { contribution, routeFile } = groupedContribution;

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
				createRouteGraphLookupKey(routeFile, groupedContribution.dependencyInstanceKey),
				new Set(routeGroupedDependencies.map((dep) => getGroupedBundleAssetKey(dep.groupedBundle))),
			);
			routeDisplayPaths.set(
				createRouteGraphLookupKey(routeFile, groupedContribution.dependencyInstanceKey),
				routeFile,
			);
			dependencyPaths.add(path.resolve(routeFile));
		}

		if (groupedDependencies.length === 0) {
			return {
				assetsByRoute: new Map(),
				dependencyPaths,
				hasCollectionFailures,
				cacheable: Boolean(input.groupedBuildPlan) && !hasCollectionFailures,
			};
		}

		for (const dependency of groupedDependencies) {
			if (dependency.source === 'file') {
				dependencyPaths.add(path.resolve(dependency.filepath));
			}
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
					`Grouped page-browser assets for ${routeDisplayPaths.get(routeFile) ?? routeFile} are missing groupedBundle metadata after processing. Hydration scripts may be omitted from HTML.`,
				);
			}

			groupedAssetsByRoute.set(routeFile, matchedAssets);
		}

		for (const asset of processedGroupedDependencies) {
			if (asset.sourceFilepath) {
				dependencyPaths.add(path.resolve(asset.sourceFilepath));
			}

			for (const bundledSourceFilepath of asset.bundledSourceFilepaths ?? []) {
				dependencyPaths.add(path.resolve(bundledSourceFilepath));
			}
		}

		return {
			assetsByRoute: groupedAssetsByRoute,
			dependencyPaths,
			hasCollectionFailures,
			cacheable: Boolean(input.groupedBuildPlan) && !hasCollectionFailures,
		};
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
