import path from 'node:path';
import { requireAppRuntime } from '../config/app-runtime.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { PageParams } from '../types/public-types.ts';
import type { PageRendererResolver } from '../route-renderer/route-renderer.ts';
import type { IntegrationRenderer } from '../route-renderer/orchestration/integration-renderer.ts';
import type { GroupedGraphBuildPlan } from '../route-renderer/orchestration/page-browser-graph/grouped-graph-build-plan.ts';
import { createPageDependencyInstanceKey } from '../route-renderer/orchestration/page-browser-graph/route-instance-key.ts';
import { buildAppBrowserClient } from '../services/assets/app-browser-client-build.ts';

export type ProductionPageBrowserGraphRouteInstance = {
	routeFile: string;
	params?: PageParams;
};

/**
 * Returns whether production static export should warm Page Browser Graphs before rendering.
 *
 * @remarks
 * True only when `NODE_ENV === 'production'`. Independent of `force` and of
 * unified pages-graph env flags. Does not persist a disk manifest.
 */
export function shouldPrebuildProductionPageBrowserGraphs(): boolean {
	return process.env.NODE_ENV === 'production';
}

/**
 * Clears in-memory production Page Browser Graph session records.
 *
 * @remarks
 * Clears only the `'production'` policy so a failed or force export cannot
 * reuse staged graph output. Development session records are left intact.
 */
export function clearProductionPageBrowserGraphSession(appConfig: EcoPagesAppConfig): void {
	requireAppRuntime(appConfig).pageBrowserGraphSession.clearPolicyRecords('production');
}

function serializeProductionRouteInstance(instance: ProductionPageBrowserGraphRouteInstance): string {
	const routeFile = path.resolve(instance.routeFile);
	const dependencyInstanceKey = createPageDependencyInstanceKey({ params: instance.params });
	return JSON.stringify([routeFile, dependencyInstanceKey]);
}

/**
 * Warms production Page Browser Graphs for the supplied static route instances.
 *
 * @remarks
 * Deduplicates route file + params pairs, then calls each integration renderer's
 * `prebuildProductionPageBrowserGraph` sequentially (activates integration runtime,
 * then resolves into `page-browser-graph-session`). Does not persist a disk manifest.
 */
export async function prebuildProductionPageBrowserGraphs(
	appConfig: EcoPagesAppConfig,
	routeInstances: readonly ProductionPageBrowserGraphRouteInstance[],
	routeRendererFactory: PageRendererResolver,
): Promise<void> {
	const uniqueRouteInstances = [
		...new Map(
			routeInstances.map((instance) => [serializeProductionRouteInstance(instance), instance] as const),
		).values(),
	].sort((left, right) =>
		serializeProductionRouteInstance(left).localeCompare(serializeProductionRouteInstance(right)),
	);

	const instancesByRenderer = new Map<IntegrationRenderer<unknown>, ProductionPageBrowserGraphRouteInstance[]>();
	for (const routeInstance of uniqueRouteInstances) {
		const renderer = routeRendererFactory.getPageRenderer(routeInstance.routeFile) as IntegrationRenderer<unknown>;
		const instances = instancesByRenderer.get(renderer) ?? [];
		instances.push(routeInstance);
		instancesByRenderer.set(renderer, instances);
	}

	const rendererPlans: Array<{
		renderer: IntegrationRenderer<unknown>;
		routeInstances: ProductionPageBrowserGraphRouteInstance[];
		groupedBuildPlan: GroupedGraphBuildPlan;
	}> = [];
	for (const [renderer, routeInstancesForRenderer] of instancesByRenderer) {
		const groupedBuildPlan = await renderer.buildGroupedGraphBuildPlan(routeInstancesForRenderer);
		rendererPlans.push({ renderer, routeInstances: routeInstancesForRenderer, groupedBuildPlan });
	}
	const appBrowserPlans = await buildAppBrowserClient(
		appConfig,
		rendererPlans.map(({ groupedBuildPlan }) => groupedBuildPlan),
	);

	for (const [index, { renderer, routeInstances: routeInstancesForRenderer }] of rendererPlans.entries()) {
		const groupedBuildPlan = appBrowserPlans[index];
		if (!groupedBuildPlan) continue;
		for (const routeInstance of routeInstancesForRenderer) {
			await renderer.prebuildProductionPageBrowserGraph(routeInstance.routeFile, {
				params: routeInstance.params,
				groupedBuildPlan,
			});
		}
	}
}
