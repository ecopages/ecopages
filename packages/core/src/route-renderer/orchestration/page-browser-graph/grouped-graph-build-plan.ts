import type { PageBrowserGraphContribution } from '../../../types/public-types.ts';

export type GroupedGraphBuildPlanInstance = {
	routeFile: string;
	dependencyInstanceKey: string;
	contribution?: PageBrowserGraphContribution;
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
	instances: ReadonlyArray<Pick<GroupedGraphBuildPlanInstance, 'routeFile' | 'dependencyInstanceKey'>>,
): string {
	const canonicalInstances = [...instances]
		.map((instance) => [instance.routeFile, instance.dependencyInstanceKey] as const)
		.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

	return JSON.stringify(['grouped-plan', integrationName, canonicalInstances]);
}
