import type { PageBrowserGraphContribution } from '../../../types/contracts.ts';
import type { AssetDefinition } from '../../../assets/asset-processing-service/assets.types.ts';
import type { PageClientBuildEntry } from '../ownership-graph/page-client-plan.ts';

export type PlannedPageClientBuildEntry = PageClientBuildEntry & {
	integrationName: string;
};

export type GroupedGraphBuildPlanInstance = {
	routeFile: string;
	dependencyInstanceKey: string;
	skipStaticProps?: boolean;
	isRouteTemplate?: boolean;
	contribution?: PageBrowserGraphContribution;
	pageClientBuildEntries?: ReadonlyArray<PlannedPageClientBuildEntry>;
};

/**
 * The browser scripts one renderer's production routes declare, collected before rendering so the app-wide
 * browser build bundles them.
 */
export type GroupedGraphBuildPlan = {
	integrationName: string;
	instances: ReadonlyArray<GroupedGraphBuildPlanInstance>;
	/** Component scripts route preparation bundles for these routes. */
	bundledScripts?: ReadonlyArray<AssetDefinition>;
};
