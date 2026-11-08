import type { AssetDefinition } from '../../../assets/asset-processing-service/assets.types.ts';
import type { PageClientBuildEntry } from '../ownership-graph/page-client-plan.ts';

export type PlannedPageClientBuildEntry = PageClientBuildEntry & {
	integrationName: string;
};

/**
 * The browser scripts one Integration's production routes need from the app-wide browser build, collected before
 * rendering.
 */
export type GroupedGraphBuildPlan = {
	integrationName: string;
	/**
	 * Component scripts, Page Browser Graph dependencies and contribution scripts the build can bundle, prepared
	 * as asset processing prepares them, so each one is recorded under the key rendering looks it up with.
	 */
	bundledScripts: ReadonlyArray<AssetDefinition>;
	/** Island and lazy entries, each with the Integration that declared it. */
	pageClientEntries: ReadonlyArray<PlannedPageClientBuildEntry>;
};
