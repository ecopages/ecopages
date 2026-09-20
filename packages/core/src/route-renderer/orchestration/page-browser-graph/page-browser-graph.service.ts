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

type GroupedContentScriptAsset = Extract<AssetDefinition, { kind: 'script'; source: 'content' }> & {
	groupedBundle: {
		id: string;
		entryName: string;
	};
};

function isGroupedContentScriptAsset(asset: AssetDefinition): asset is GroupedContentScriptAsset {
	return asset.kind === 'script' && asset.source === 'content' && Boolean(asset.groupedBundle?.id);
}

function getGroupedBundleAssetKey(groupedBundle: { id: string; entryName: string }): string {
	return `${groupedBundle.id}:${groupedBundle.entryName}`;
}

type IndexedGroupedAsset = {
	asset: ProcessedAsset;
	index: number;
};

function indexGroupedAssetsByBundleKey(processedAssets: ProcessedAsset[]): Map<string, IndexedGroupedAsset[]> {
	const assetsByBundleKey = new Map<string, IndexedGroupedAsset[]>();

	for (const [index, asset] of processedAssets.entries()) {
		if (!asset.groupedBundle) {
			continue;
		}

		const bundleKey = getGroupedBundleAssetKey(asset.groupedBundle);
		const assets = assetsByBundleKey.get(bundleKey);
		if (assets) {
			assets.push({ asset, index });
		} else {
			assetsByBundleKey.set(bundleKey, [{ asset, index }]);
		}
	}

	return assetsByBundleKey;
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
	 * Returns dependency paths recorded for one resolved Page Browser Graph.
	 */
	getDependencyPathsForRoute(input: {
		integrationName: string;
		routeFile: string;
		dependencyInstanceKey?: string;
		policy?: GraphPolicy;
	}): ReadonlySet<string> | undefined {
		const policy = input.policy ?? this.resolveGraphPolicy();
		return getAppPageBrowserGraphSession(this.appConfig).getDependencyPathsByRoute(
			input.integrationName,
			input.routeFile,
			policy,
			input.dependencyInstanceKey ?? '',
		);
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

	private collectGroupedBuildPlanContributions(input: PageBrowserGraphResolveInput): {
		contributions: GroupedPageBrowserGraphContribution[];
		hasCollectionFailures: boolean;
	} {
		if (!input.groupedBuildPlan) {
			return { contributions: [], hasCollectionFailures: false };
		}
		return {
			contributions: input.groupedBuildPlan.instances.map((instance) => ({
				routeFile: instance.routeFile,
				dependencyInstanceKey: instance.dependencyInstanceKey,
				contribution: instance.contribution,
			})),
			hasCollectionFailures: false,
		};
	}

	private registerRouteGroupedDependencies(
		routeLookupKey: string,
		routeFile: string,
		routeGroupedDependencies: GroupedContentScriptAsset[],
		groupedDependencies: AssetDefinition[],
		groupedAssetKeysByRoute: Map<string, Set<string>>,
		routeDisplayPaths: Map<string, string>,
		dependencyPaths: Set<string>,
	): void {
		if (routeGroupedDependencies.length === 0) {
			return;
		}
		groupedDependencies.push(...routeGroupedDependencies);
		groupedAssetKeysByRoute.set(
			routeLookupKey,
			new Set(routeGroupedDependencies.map((dep) => getGroupedBundleAssetKey(dep.groupedBundle))),
		);
		routeDisplayPaths.set(routeLookupKey, routeFile);
		dependencyPaths.add(path.resolve(routeFile));
	}

	private mergePeerGroupedContributions(
		input: PageBrowserGraphResolveInput,
		currentContribution: PageBrowserGraphContribution,
		groupedContributions: GroupedPageBrowserGraphContribution[],
		hasCollectionFailures: boolean,
	): {
		groupedDependencies: AssetDefinition[];
		groupedAssetKeysByRoute: Map<string, Set<string>>;
		routeDisplayPaths: Map<string, string>;
		dependencyPaths: Set<string>;
		hasCollectionFailures: boolean;
	} {
		const dependencyInstanceKey = input.dependencyInstanceKey ?? '';
		const currentRouteLookupKey = createRouteGraphLookupKey(input.routeFile, dependencyInstanceKey);
		const currentRouteGroupedDependencies = (currentContribution.dependencies ?? []).filter((dep) =>
			isGroupedContentScriptAsset(dep),
		);
		const groupedDependencies: AssetDefinition[] = [...currentRouteGroupedDependencies];
		const groupedAssetKeysByRoute = new Map<string, Set<string>>();
		const routeDisplayPaths = new Map<string, string>();
		const dependencyPaths = new Set<string>([path.resolve(input.routeFile)]);

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
			this.registerRouteGroupedDependencies(
				createRouteGraphLookupKey(routeFile, groupedContribution.dependencyInstanceKey),
				routeFile,
				routeGroupedDependencies,
				groupedDependencies,
				groupedAssetKeysByRoute,
				routeDisplayPaths,
				dependencyPaths,
			);
		}

		return {
			groupedDependencies,
			groupedAssetKeysByRoute,
			routeDisplayPaths,
			dependencyPaths,
			hasCollectionFailures,
		};
	}

	private addGroupedDependencyFilePaths(groupedDependencies: AssetDefinition[], dependencyPaths: Set<string>): void {
		for (const dependency of groupedDependencies) {
			if (dependency.source === 'file') {
				dependencyPaths.add(path.resolve(dependency.filepath));
			}
		}
	}

	private matchGroupedAssetsByRoute(
		groupedAssetKeysByRoute: Map<string, Set<string>>,
		routeDisplayPaths: Map<string, string>,
		groupedAssetsByBundleKey: Map<string, IndexedGroupedAsset[]>,
	): Map<string, ProcessedAsset[]> {
		const groupedAssetsByRoute = new Map<string, ProcessedAsset[]>();

		for (const [routeLookupKey, groupedAssetKeys] of groupedAssetKeysByRoute) {
			const matchedAssets = [...groupedAssetKeys]
				.flatMap((assetKey) => groupedAssetsByBundleKey.get(assetKey) ?? [])
				.sort((left, right) => left.index - right.index)
				.map(({ asset }) => asset);

			if (groupedAssetKeys.size > 0 && matchedAssets.length === 0) {
				appLogger.warn(
					`Grouped page-browser assets for ${routeDisplayPaths.get(routeLookupKey) ?? routeLookupKey} are missing groupedBundle metadata after processing. Hydration scripts may be omitted from HTML.`,
				);
			}

			groupedAssetsByRoute.set(routeLookupKey, matchedAssets);
		}

		return groupedAssetsByRoute;
	}

	private addProcessedGroupedAssetDependencyPaths(
		processedGroupedDependencies: ProcessedAsset[],
		dependencyPaths: Set<string>,
	): void {
		for (const asset of processedGroupedDependencies) {
			if (asset.sourceFilepath) {
				dependencyPaths.add(path.resolve(asset.sourceFilepath));
			}
			for (const bundledSourceFilepath of asset.bundledSourceFilepaths ?? []) {
				dependencyPaths.add(path.resolve(bundledSourceFilepath));
			}
		}
	}

	private async buildGroupedPageBrowserAssets(
		input: PageBrowserGraphResolveInput,
		currentContribution: PageBrowserGraphContribution,
	): Promise<GroupedPageBrowserAssetsResult> {
		const groupedCollection = this.collectGroupedBuildPlanContributions(input);
		const merged = this.mergePeerGroupedContributions(
			input,
			currentContribution,
			groupedCollection.contributions,
			groupedCollection.hasCollectionFailures,
		);
		const {
			groupedDependencies,
			groupedAssetKeysByRoute,
			routeDisplayPaths,
			dependencyPaths,
			hasCollectionFailures,
		} = merged;

		if (groupedDependencies.length === 0) {
			return {
				assetsByRoute: new Map(),
				dependencyPaths,
				hasCollectionFailures,
				cacheable: Boolean(input.groupedBuildPlan) && !hasCollectionFailures,
			};
		}

		this.addGroupedDependencyFilePaths(groupedDependencies, dependencyPaths);

		const processedGroupedDependencies = await this.assetProcessingService.processDependencies(
			groupedDependencies,
			`${input.integrationName}:grouped-page-browser-graph`,
		);
		const groupedAssetsByBundleKey = indexGroupedAssetsByBundleKey(processedGroupedDependencies);
		const groupedAssetsByRoute = this.matchGroupedAssetsByRoute(
			groupedAssetKeysByRoute,
			routeDisplayPaths,
			groupedAssetsByBundleKey,
		);
		this.addProcessedGroupedAssetDependencyPaths(processedGroupedDependencies, dependencyPaths);

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
