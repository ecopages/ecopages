import type { EcoComponentConfig, ResolvedLazyTrigger } from '../../../types/contracts.ts';
import type { AssetDefinition, ProcessedAsset } from '../../../assets/asset-processing-service/index.ts';
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
	collectOwnIslandAssets(plan: PageClientPlan): Promise<ProcessedAsset[]>;
	resolveContributor(integrationName: string): Promise<PageClientAssetsContributor | undefined>;
	processLazyEntries(entries: AssetDefinition[]): Promise<ProcessedAsset[]>;
	applyPendingLazyTriggers(assets: ProcessedAsset[], configs: EcoComponentConfig[]): ResolvedLazyTrigger[];
};

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
	const combined = [...(await input.collectOwnIslandAssets(plan))];

	for (const integrationName of uniqueIslandIntegrationNames(plan)) {
		if (integrationName === input.integrationName) {
			continue;
		}
		const contributor = await input.resolveContributor(integrationName);
		if (!contributor?.contributesAppBrowserClientBuild()) {
			continue;
		}
		const contributed = await contributor.buildPageClientBrowserAssets(plan);
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
		lazyTriggers: input.applyPendingLazyTriggers(processedAssets, plan.lazyConfigs),
	};
}
