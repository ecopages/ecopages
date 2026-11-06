import type { EcoPagesAppConfig } from '../../../config/internal-types.ts';
import type { PageBrowserGraphContribution, PageBrowserGraphResult } from '../../../types/contracts.ts';
import {
	type AssetDefinition,
	type AssetProcessingService,
	type ProcessedAsset,
} from '../../../assets/asset-processing-service/index.ts';
import type { AssetProcessingIntegration } from '../../../assets/asset-processing-service/asset-processing-integration.ts';
import { resolveAssetProcessingIntegration } from '../../../assets/asset-processing-service/asset-processing-integration.ts';
import { appLogger } from '../../../global/app-logger.ts';
import { requireAppRuntime } from '../../../utils/app-runtime.ts';
import { startupTrace } from '../../../diagnostics/startup-trace.ts';
import { prepareAssetDependencies } from '../../../assets/asset-processing-service/asset-processing.service.ts';
import {
	collectPageBrowserGraphDependencyPaths,
	createPageBrowserGraphEntryFingerprint,
	type GraphBuildResult,
	type GraphPolicy,
} from './page-browser-graph-session.ts';
import {
	describeProductionBrowserGraphEntry,
	missingProductionBrowserGraphError,
	shouldRejectUnplannedProductionBrowserGraph,
} from './missing-production-browser-graph.ts';

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

export type PageBrowserGraphResolveInput = {
	routeFile: string;
	dependencyInstanceKey?: string;
	integrationName: string;
	collectContribution: () => Promise<PageBrowserGraphContribution | undefined>;
	cacheable?: boolean;
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

		return await session.resolveGraph(
			{
				integrationName: input.integrationName,
				routeFile: input.routeFile,
				dependencyInstanceKey,
				entryFingerprint: createPageBrowserGraphEntryFingerprint(contribution),
				policy,
			},
			collectPageBrowserGraphDependencyPaths(input.routeFile, contribution, contribution.assets ?? []),
			async () => this.buildPageBrowserGraphRecord(input, contribution),
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
		const integration = this.getAssetProcessingIntegration(input.integrationName);
		const dependencies = contribution.dependencies ?? [];
		const groupedDependencies = dependencies.filter(isGroupedContentScriptAsset);
		const ungroupedDependencies = dependencies.filter((dep) => !isGroupedContentScriptAsset(dep));
		const groupedAssets = groupedDependencies.length
			? await this.processGroupedDependencies(input, groupedDependencies, integration)
			: [];
		const processedDependencies = ungroupedDependencies.length
			? await this.assetProcessingService.processDependencies(ungroupedDependencies, integration)
			: [];
		const resolvedAssets = [...processedDependencies, ...groupedAssets, ...(contribution.assets ?? [])];
		const result = this.partitionPageBrowserGraphAssets(resolvedAssets);
		const dependencyPaths = collectPageBrowserGraphDependencyPaths(input.routeFile, contribution, resolvedAssets);
		const ledger = requireAppRuntime(this.appConfig).processedAssets;

		return {
			result,
			dependencyPaths,
			cacheable: input.cacheable !== false && (groupedDependencies.length === 0 || ledger.hasBrowserBuild),
		};
	}

	/**
	 * Processes the route's grouped scripts and keeps the outputs of its own bundles.
	 *
	 * @remarks
	 * In production each one resolves to the output the app-wide browser build recorded for it; once
	 * `ecopages start` or the Lit static-render worker sealed the build, a grouped script the ledger does not
	 * record is an error. Ungrouped dependencies are not checked: a React page script, for one, is never in the
	 * app-wide build, and asset processing already fails for an unrecorded file whose source is missing.
	 * Elsewhere they build as one grouped bundle for this route, which is not cached across routes.
	 */
	private async processGroupedDependencies(
		input: PageBrowserGraphResolveInput,
		groupedDependencies: GroupedContentScriptAsset[],
		integration: AssetProcessingIntegration | undefined,
	): Promise<ProcessedAsset[]> {
		if (shouldRejectUnplannedProductionBrowserGraph(this.appConfig)) {
			const ledger = requireAppRuntime(this.appConfig).processedAssets;
			const prepared = prepareAssetDependencies([...groupedDependencies], integration, this.appConfig.rootDir);
			if (prepared.some((dependency) => !ledger.lookup(dependency))) {
				throw missingProductionBrowserGraphError(
					input.routeFile,
					describeProductionBrowserGraphEntry(undefined, input.dependencyInstanceKey),
				);
			}
		}
		const bundleKeys = new Set(groupedDependencies.map((dep) => getGroupedBundleAssetKey(dep.groupedBundle)));
		const groupedAssets = (
			await this.assetProcessingService.processDependencies(groupedDependencies, integration)
		).filter((asset) => asset.groupedBundle && bundleKeys.has(getGroupedBundleAssetKey(asset.groupedBundle)));
		if (groupedAssets.length === 0) {
			appLogger.warn(
				`Grouped page-browser assets for ${input.routeFile} are missing groupedBundle metadata after processing. Hydration scripts may be omitted from HTML.`,
			);
		}
		return groupedAssets;
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
