import type { PageBrowserGraphContribution } from '../../../types/public-types.ts';
import type { ProcessedAsset } from '../../../assets/asset-processing-service/assets.types.ts';
import type { PageClientBuildEntry } from '../ownership-graph/page-client-plan.ts';

export type PlannedPageClientBuildEntry = PageClientBuildEntry & {
	integrationName: string;
};

export type PrebuiltPageClientBrowserAssets = {
	processedAssets: ProcessedAsset[];
	islandRenderAssetsByFile: Map<string, ProcessedAsset[]>;
	fallbackDependencies: Array<{ dependency: PageClientBuildEntry['dependency']; integrationName: string }>;
};

export type GroupedGraphBuildPlanInstance = {
	routeFile: string;
	dependencyInstanceKey: string;
	skipStaticProps?: boolean;
	isRouteTemplate?: boolean;
	contribution?: PageBrowserGraphContribution;
	prebuiltGroupedAssets?: ReadonlyArray<ProcessedAsset>;
	pageClientBuildEntries?: ReadonlyArray<PlannedPageClientBuildEntry>;
	prebuiltPageClientBrowserAssets?: PrebuiltPageClientBrowserAssets;
};

export type GroupedGraphBuildPlan = {
	integrationName: string;
	planKey: string;
	instances: ReadonlyArray<GroupedGraphBuildPlanInstance>;
};

/**
 * Builds a stable grouped-cache identity for one integration static export plan.
 */
export function createGroupedGraphBuildPlanKey(
	integrationName: string,
	instances: ReadonlyArray<
		Pick<
			GroupedGraphBuildPlanInstance,
			'routeFile' | 'dependencyInstanceKey' | 'skipStaticProps' | 'isRouteTemplate'
		>
	>,
): string {
	const canonicalInstances = [...instances]
		.map(
			(instance) =>
				[
					instance.routeFile,
					instance.dependencyInstanceKey,
					instance.skipStaticProps ?? false,
					instance.isRouteTemplate ?? false,
				] as const,
		)
		.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

	return JSON.stringify(['grouped-plan', integrationName, canonicalInstances]);
}
