import path from 'node:path';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { PageBrowserGraphContribution, PageBrowserGraphResult } from '../../../types/public-types.ts';
import {
	type AssetDefinition,
	type AssetProcessingService,
	type ProcessedAsset,
} from '../../../assets/asset-processing-service/index.ts';
import type { AssetProcessingIntegration } from '../../../assets/asset-processing-service/asset-processing-integration.ts';
import { resolveAssetProcessingIntegration } from '../../../assets/asset-processing-service/asset-processing-integration.ts';
import { appLogger } from '../../../global/app-logger.ts';
import { requireAppRuntime } from '../../../config/app-runtime.ts';
import { startupTrace } from '../../../diagnostics/startup-trace.ts';
import { createAppBrowserClientEntryKey } from '../../../assets/app-browser-client-build.ts';
import {
	collectPageBrowserGraphDependencyPaths,
	createPageBrowserGraphEntryFingerprint,
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

function groupedDependencyKeys(
	integrationName: string,
	contribution: PageBrowserGraphContribution | undefined,
): string[] {
	return [
		...new Set(
			(contribution?.dependencies ?? [])
				.filter(isGroupedContentScriptAsset)
				.map((dependency) => createAppBrowserClientEntryKey(integrationName, dependency)),
		),
	].sort();
}

function applyPrebuiltGroupedDependencyMetadata(
	currentContribution: PageBrowserGraphContribution,
	plannedContribution: PageBrowserGraphContribution | undefined,
	integrationName: string,
): PageBrowserGraphContribution {
	const plannedDependenciesByKey = new Map(
		(plannedContribution?.dependencies ?? [])
			.filter(isGroupedContentScriptAsset)
			.map((dependency) => [createAppBrowserClientEntryKey(integrationName, dependency), dependency]),
	);
	return {
		...currentContribution,
		dependencies: currentContribution.dependencies?.map((dependency) => {
			if (!isGroupedContentScriptAsset(dependency)) return dependency;
			return (
				plannedDependenciesByKey.get(createAppBrowserClientEntryKey(integrationName, dependency)) ?? dependency
			);
		}),
	};
}

function resolveGroupedBuildPlan(
	input: PageBrowserGraphResolveInput,
	contribution: PageBrowserGraphContribution,
	dependencyInstanceKey: string,
): {
	groupedBuildPlan: GroupedGraphBuildPlan | undefined;
	graphContribution: PageBrowserGraphContribution;
	usesPrebuiltGroupedAssets: boolean;
} {
	if (input.cacheable === false) {
		return {
			groupedBuildPlan: undefined,
			graphContribution: contribution,
			usesPrebuiltGroupedAssets: false,
		};
	}

	const routeLookupKey = createRouteGraphLookupKey(input.routeFile, dependencyInstanceKey);
	const exactPlanInstance = input.groupedBuildPlan?.instances.find(
		(instance) =>
			!instance.isRouteTemplate &&
			createRouteGraphLookupKey(instance.routeFile, instance.dependencyInstanceKey) === routeLookupKey,
	);
	const templatePlanInstance = exactPlanInstance
		? undefined
		: input.groupedBuildPlan?.instances.find(
				(instance) =>
					instance.routeFile === input.routeFile &&
					instance.isRouteTemplate === true &&
					instance.prebuiltGroupedAssets !== undefined &&
					JSON.stringify(groupedDependencyKeys(input.integrationName, instance.contribution)) ===
						JSON.stringify(groupedDependencyKeys(input.integrationName, contribution)),
			);
	const plannedInstance = exactPlanInstance ?? templatePlanInstance;
	const groupedBuildPlan = templatePlanInstance
		? input.groupedBuildPlan && {
				...input.groupedBuildPlan,
				instances: input.groupedBuildPlan.instances.map((instance) =>
					instance === templatePlanInstance
						? { ...instance, dependencyInstanceKey, skipStaticProps: false, isRouteTemplate: false }
						: instance,
				),
			}
		: exactPlanInstance
			? input.groupedBuildPlan
			: undefined;
	const usesPrebuiltGroupedAssets = plannedInstance?.prebuiltGroupedAssets !== undefined;
	const graphContribution = templatePlanInstance
		? applyPrebuiltGroupedDependencyMetadata(contribution, templatePlanInstance.contribution, input.integrationName)
		: usesPrebuiltGroupedAssets
			? (plannedInstance.contribution ?? contribution)
			: contribution;

	return { groupedBuildPlan, graphContribution, usesPrebuiltGroupedAssets };
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
	cacheable?: boolean;
	groupedBuildPlan?: GroupedGraphBuildPlan;
	policy?: GraphPolicy;
};

/**
 * Resolves declarative page browser graph assets for one route and integration.
 */
export class PageBrowserGraphService {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly assetProcessingService: AssetProcessingService;
	private readonly assetProcessingIntegration?: AssetProcessingIntegration;

	constructor(
		appConfig: EcoPagesAppConfig,
		assetProcessingService: AssetProcessingService,
		assetProcessingIntegration?: AssetProcessingIntegration,
	) {
		this.appConfig = appConfig;
		this.assetProcessingService = assetProcessingService;
		this.assetProcessingIntegration = assetProcessingIntegration;
	}

	private getAssetProcessingIntegration(name: string): AssetProcessingIntegration | undefined {
		return resolveAssetProcessingIntegration(name, this.assetProcessingIntegration, this.appConfig.integrations);
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
		return requireAppRuntime(this.appConfig).pageBrowserGraphSession.getDependencyPathsByRoute(
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
		const session = requireAppRuntime(this.appConfig).pageBrowserGraphSession;
		const dependencyInstanceKey = input.dependencyInstanceKey ?? '';

		if (input.cacheable !== false && !this.isHmrEnabled()) {
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

		const groupedPlan = resolveGroupedBuildPlan(input, contribution, dependencyInstanceKey);
		const graphInput = { ...input, groupedBuildPlan: groupedPlan.groupedBuildPlan };
		const entryFingerprint = [
			createPageBrowserGraphEntryFingerprint(groupedPlan.graphContribution),
			...(groupedPlan.usesPrebuiltGroupedAssets ? [groupedPlan.groupedBuildPlan?.planKey ?? ''] : []),
		].join(':');

		return await session.resolveGraph(
			{
				integrationName: input.integrationName,
				routeFile: input.routeFile,
				dependencyInstanceKey,
				entryFingerprint,
				policy,
			},
			collectPageBrowserGraphDependencyPaths(
				input.routeFile,
				groupedPlan.graphContribution,
				groupedPlan.graphContribution.assets ?? [],
			),
			async () => this.buildPageBrowserGraphRecord(graphInput, groupedPlan.graphContribution),
			{ reuseCachedResult: input.cacheable !== false },
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

		startupTrace.markFirstPageBrowserGraphReady(
			requireAppRuntime(this.appConfig).pageBrowserGraphSession.getBuildCount(),
		);
		return result;
	}

	private async materializePageBrowserGraph(
		input: PageBrowserGraphResolveInput,
		contribution: PageBrowserGraphContribution,
	): Promise<GraphBuildResult | undefined> {
		const routeLookupKey = createRouteGraphLookupKey(input.routeFile, input.dependencyInstanceKey ?? '');
		const plannedInstance = input.groupedBuildPlan?.instances.find(
			(instance) =>
				createRouteGraphLookupKey(instance.routeFile, instance.dependencyInstanceKey) === routeLookupKey,
		);
		const groupedDependencies = (contribution.dependencies ?? []).filter((dep) => isGroupedContentScriptAsset(dep));
		const ungroupedDependencies = (contribution.dependencies ?? []).filter(
			(dep) => !isGroupedContentScriptAsset(dep),
		);
		const groupedResolution = await this.resolvePlannedGroupedAssets(
			input,
			contribution,
			plannedInstance,
			groupedDependencies.length > 0,
			routeLookupKey,
		);

		const groupedAssets =
			groupedResolution?.assetsByRoute.get(
				createRouteGraphLookupKey(input.routeFile, input.dependencyInstanceKey ?? ''),
			) ?? [];

		const processedDependencies = ungroupedDependencies.length
			? await this.assetProcessingService.processDependencies(
					ungroupedDependencies,
					this.getAssetProcessingIntegration(input.integrationName),
				)
			: [];
		const resolvedAssets = [...processedDependencies, ...groupedAssets, ...(contribution.assets ?? [])];
		const result = this.partitionPageBrowserGraphAssets(resolvedAssets);
		const dependencyPaths = collectPageBrowserGraphDependencyPaths(input.routeFile, contribution, resolvedAssets);

		return {
			result,
			dependencyPaths,
			cacheable: input.cacheable !== false && (groupedResolution?.cacheable ?? true),
		};
	}

	private async resolvePlannedGroupedAssets(
		input: PageBrowserGraphResolveInput,
		contribution: PageBrowserGraphContribution,
		plannedInstance: GroupedGraphBuildPlan['instances'][number] | undefined,
		hasGroupedDependencies: boolean,
		routeLookupKey: string,
	): Promise<GroupedPageBrowserAssetsResult | undefined> {
		if (plannedInstance?.prebuiltGroupedAssets !== undefined) {
			return {
				assetsByRoute: new Map([[routeLookupKey, [...plannedInstance.prebuiltGroupedAssets]]]),
				dependencyPaths: new Set<string>(),
				hasCollectionFailures: false,
				cacheable: true,
			};
		}
		if (!hasGroupedDependencies) return undefined;
		return this.resolveGroupedPageBrowserAssets(input, contribution);
	}

	private async resolveGroupedPageBrowserAssets(
		input: PageBrowserGraphResolveInput,
		currentContribution: PageBrowserGraphContribution,
	): Promise<GroupedPageBrowserAssetsResult> {
		if (input.cacheable === false) {
			return {
				...(await this.buildGroupedPageBrowserAssets(input, currentContribution)),
				cacheable: false,
			};
		}

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

		const session = requireAppRuntime(this.appConfig).pageBrowserGraphSession;
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
			this.getAssetProcessingIntegration(input.integrationName),
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
