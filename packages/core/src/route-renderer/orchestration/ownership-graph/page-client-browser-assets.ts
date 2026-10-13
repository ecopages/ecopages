import type { EcoComponentConfig, ResolvedLazyTrigger } from '../../../types/public-types.ts';
import type { AssetDefinition, ProcessedAsset } from '../../../services/assets/asset-processing-service/index.ts';
import { uniqueIslandIntegrationNames, type PageClientBrowserAssets, type PageClientPlan } from './page-client-plan.ts';

/**
 * Another island-hydrating Integration that can add its grouped client build for a plan.
 */
export type PageClientAssetsContributor = {
	contributesAppBrowserClientBuild(): boolean;
	buildPageClientBrowserAssets(plan: PageClientPlan): Promise<PageClientBrowserAssets>;
};

export type BuildPageClientBrowserAssetsInput = {
	plan: PageClientPlan;
	/** Name of the Integration building for the plan. */
	integrationName: string;
	collectOwnIslandAssets(plan: PageClientPlan): Promise<Map<string, ProcessedAsset[]>>;
	resolveContributor(integrationName: string): Promise<PageClientAssetsContributor | undefined>;
	processLazyEntries(entries: AssetDefinition[]): Promise<ProcessedAsset[]>;
	applyPendingLazyTriggers(assets: ProcessedAsset[], configs: EcoComponentConfig[]): ResolvedLazyTrigger[];
};

function mergeIslandRenderAssetMaps(
	target: Map<string, ProcessedAsset[]>,
	source: Map<string, ProcessedAsset[]>,
): void {
	for (const [file, assets] of source) {
		const existing = target.get(file);
		target.set(file, existing ? [...existing, ...assets] : assets);
	}
}

/**
 * Builds island and lazy-entry browser assets from a page client plan.
 *
 * @remarks
 * The page owner collects its own island assets, then asks every other island-hydrating Integration
 * on the plan to contribute its grouped client build. Lazy entries join that grouped build when an
 * Integration includes them; otherwise they are processed here as one grouped batch.
 */
export async function buildPageClientBrowserAssets(
	input: BuildPageClientBrowserAssetsInput,
): Promise<PageClientBrowserAssets> {
	const { plan } = input;
	const ownIslands = await input.collectOwnIslandAssets(plan);
	const islandRenderAssetsByFile = new Map<string, ProcessedAsset[]>();
	mergeIslandRenderAssetMaps(islandRenderAssetsByFile, ownIslands);
	const combined = [...ownIslands.values()].flat();

	for (const integrationName of uniqueIslandIntegrationNames(plan)) {
		if (integrationName === input.integrationName) {
			continue;
		}
		const contributor = await input.resolveContributor(integrationName);
		if (!contributor?.contributesAppBrowserClientBuild()) {
			continue;
		}
		const contributed = await contributor.buildPageClientBrowserAssets(plan);
		mergeIslandRenderAssetMaps(islandRenderAssetsByFile, contributed.islandRenderAssetsByFile);
		combined.push(...contributed.processedAssets);
	}

	const lazyAlreadyProcessed = combined.some((asset) => Boolean(asset.attributes?.['data-eco-lazy-key']));
	const processedLazy =
		!lazyAlreadyProcessed && plan.lazyClientEntries.length > 0
			? await input.processLazyEntries(plan.lazyClientEntries)
			: [];
	const processedAssets = [...combined, ...processedLazy];

	return {
		processedAssets,
		islandRenderAssetsByFile,
		lazyTriggers: input.applyPendingLazyTriggers(processedAssets, plan.lazyConfigs),
	};
}
