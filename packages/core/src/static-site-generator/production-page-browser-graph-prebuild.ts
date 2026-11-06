import path from 'node:path';
import { isProductionRuntime } from '../utils/runtime.ts';
import { requireAppRuntime } from '../utils/app-runtime.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import type { PageRendererResolver } from '../route-renderer/route-renderer.ts';
import type { IntegrationRenderer } from '../route-renderer/orchestration/integration-renderer.ts';
import type { GroupedGraphBuildPlan } from '../route-renderer/orchestration/page-browser-graph/grouped-graph-build-plan.ts';
import { createPageDependencyInstanceKey } from '../route-renderer/orchestration/page-browser-graph/route-instance-key.ts';
import { buildAppBrowserClient } from '../assets/app-browser-client-build.ts';
import {
	clearProductionAssetLedger,
	restoreProductionAssetLedger,
	writeProductionAssetLedger,
	type PlannedProductionRoute,
} from '../build/production-asset-ledger.ts';
import { prepareAssetDependencies } from '../assets/asset-processing-service/asset-processing.service.ts';
import {
	getPrebuiltHtmlPageModuleScriptUrls,
	setPrebuiltHtmlPageModuleScriptUrls,
} from '../html-pages/html-page-module-scripts.ts';
import { isBundleableScript } from '../assets/asset-processing-service/bundleable-script.ts';

/**
 * Returns whether production should reuse prebuilt Page Browser Graphs.
 *
 * @remarks
 * True only when `NODE_ENV === 'production'`. Independent of `force` and of
 * unified pages-graph env flags.
 */
export function shouldPrebuildProductionPageBrowserGraphs(): boolean {
	return isProductionRuntime();
}

/**
 * Clears in-memory production Page Browser Graph session records.
 *
 * @remarks
 * Clears only the `'production'` policy so a failed or force export cannot
 * reuse staged graph output. Also sets `productionBrowserGraphsSealed` to false so a
 * retry of `ecopages build` can still emit graphs, and removes the asset ledger file a previous
 * build wrote. Development session records are left intact.
 */
export function clearProductionPageBrowserGraphSession(appConfig: EcoPagesAppConfig): void {
	const runtime = requireAppRuntime(appConfig);
	runtime.pageBrowserGraphSession.clearPolicyRecords('production');
	runtime.productionBrowserGraphsSealed = false;
	runtime.plannedProductionRoutes = [];
	runtime.processedAssets.clearBrowserOutputs();
	clearProductionAssetLedger(appConfig);
}

function serializeProductionRouteInstance(instance: PlannedProductionRoute): string {
	const routeFile = path.resolve(instance.routeFile);
	const dependencyInstanceKey = createPageDependencyInstanceKey({ params: instance.params });
	return JSON.stringify([
		routeFile,
		dependencyInstanceKey,
		instance.skipStaticProps ?? false,
		instance.isRouteTemplate ?? false,
	]);
}

function groupRouteInstancesByRenderer(
	routeInstances: readonly PlannedProductionRoute[],
	routeRendererFactory: PageRendererResolver,
): Map<IntegrationRenderer<unknown>, PlannedProductionRoute[]> {
	const instancesByRenderer = new Map<IntegrationRenderer<unknown>, PlannedProductionRoute[]>();
	for (const routeInstance of routeInstances) {
		const renderer = routeRendererFactory.getPageRenderer(routeInstance.routeFile) as IntegrationRenderer<unknown>;
		const instances = instancesByRenderer.get(renderer) ?? [];
		instances.push(routeInstance);
		instancesByRenderer.set(renderer, instances);
	}
	return instancesByRenderer;
}

async function prebuildRouteInstances(
	renderer: IntegrationRenderer<unknown>,
	routeInstances: readonly PlannedProductionRoute[],
): Promise<void> {
	for (const routeInstance of routeInstances) {
		await renderer.prebuildProductionPageBrowserGraph(routeInstance.routeFile, {
			params: routeInstance.params,
			skipStaticProps: routeInstance.skipStaticProps,
			isRouteTemplate: routeInstance.isRouteTemplate,
		});
	}
}

/**
 * Warms production Page Browser Graphs for the supplied static route instances.
 *
 * @remarks
 * Deduplicates route file + params pairs and plans each renderer's routes, which collects the scripts they
 * bundle without processing them. The app-wide browser build then records every planned script in the asset
 * ledger, the ledger is written beside the server bundle, and each route's Page Browser Graph is resolved
 * through it.
 */
export async function prebuildProductionPageBrowserGraphs(
	appConfig: EcoPagesAppConfig,
	routeInstances: readonly PlannedProductionRoute[],
	routeRendererFactory: PageRendererResolver,
): Promise<void> {
	const uniqueRouteInstances = [
		...new Map(
			routeInstances.map((instance) => [serializeProductionRouteInstance(instance), instance] as const),
		).values(),
	].sort((left, right) =>
		serializeProductionRouteInstance(left).localeCompare(serializeProductionRouteInstance(right)),
	);

	const rendererPlans: Array<{
		renderer: IntegrationRenderer<unknown>;
		routeInstances: PlannedProductionRoute[];
		groupedBuildPlan: GroupedGraphBuildPlan;
	}> = [];
	for (const [renderer, routeInstancesForRenderer] of groupRouteInstancesByRenderer(
		uniqueRouteInstances,
		routeRendererFactory,
	)) {
		const failedRouteInstances = new Set<string>();
		const groupedBuildPlan = await renderer.buildGroupedGraphBuildPlan(routeInstancesForRenderer, {
			onRouteFailure: (routeInstance) => {
				failedRouteInstances.add(serializeProductionRouteInstance(routeInstance));
			},
		});
		const successfulRouteInstances = routeInstancesForRenderer.filter(
			(routeInstance) => !failedRouteInstances.has(serializeProductionRouteInstance(routeInstance)),
		);
		if (successfulRouteInstances.length === 0) continue;
		rendererPlans.push({
			renderer,
			routeInstances: successfulRouteInstances,
			groupedBuildPlan,
		});
	}
	if (rendererPlans.length === 0) return;
	await buildAppBrowserClient(appConfig, [
		...rendererPlans.map(({ groupedBuildPlan }) => groupedBuildPlan),
		...collectIntegrationScriptPlans(appConfig),
	]);
	await refreshIntegrationDependencies(appConfig);
	requireAppRuntime(appConfig).plannedProductionRoutes = rendererPlans.flatMap(
		({ routeInstances: instances }) => instances,
	);
	writeProductionAssetLedger(appConfig, await getPrebuiltHtmlPageModuleScriptUrls(appConfig));

	for (const { renderer, routeInstances: routeInstancesForRenderer } of rendererPlans) {
		await prebuildRouteInstances(renderer, routeInstancesForRenderer);
	}
}

/**
 * Lists each Integration's global scripts as a plan without routes, so the app-wide build bundles them.
 *
 * @remarks
 * Browser runtime assets keep their fixed URLs and are left out; runtime-specifier rewrites point at them.
 */
function collectIntegrationScriptPlans(appConfig: EcoPagesAppConfig): GroupedGraphBuildPlan[] {
	return appConfig.integrations.flatMap((integration) => {
		const bundledScripts = prepareAssetDependencies(
			[...integration.getIntegrationDependencies()],
			integration,
			appConfig.rootDir,
		).filter((dependency) => isBundleableScript(dependency) && dependency.packageRole !== 'runtime');
		return bundledScripts.length > 0
			? [
					{
						integrationName: integration.name,
						instances: [],
						bundledScripts,
					},
				]
			: [];
	});
}

async function refreshIntegrationDependencies(appConfig: EcoPagesAppConfig): Promise<void> {
	for (const integration of appConfig.integrations) {
		await integration.refreshResolvedIntegrationDependencies();
	}
}

/**
 * Fails when the restored ledger does not record a script the plan bundles.
 *
 * @remarks
 * The scripts are collected again from the current routes, so a script the ledger does not record means the
 * source changed since `ecopages build`.
 */
function assertPlannedScriptsRecorded(appConfig: EcoPagesAppConfig, plan: GroupedGraphBuildPlan): void {
	const ledger = requireAppRuntime(appConfig).processedAssets;
	for (const dependency of plan.bundledScripts ?? []) {
		if (ledger.lookup(dependency)) continue;
		const source = 'filepath' in dependency ? ` ${path.relative(appConfig.rootDir, dependency.filepath)}` : '';
		throw new Error(
			`The production asset ledger does not record the ${plan.integrationName} script${source}. Run \`ecopages build\` again.`,
		);
	}
}

/**
 * Restores the asset ledger written by `ecopages build` and prepares the routes that build planned.
 *
 * @remarks
 * Rendering resolves every built script through the restored ledger. The routes are planned again only to warm
 * their preparations and Page Browser Graphs; #1010 removes that step. A successful restore sets
 * `productionBrowserGraphsSealed`, so a Page Browser Graph script the ledger does not record is an error.
 */
export async function restoreProductionPageBrowserGraphs(
	appConfig: EcoPagesAppConfig,
	routeRendererFactory: PageRendererResolver,
): Promise<boolean> {
	if (!shouldPrebuildProductionPageBrowserGraphs()) return false;
	const restored = restoreProductionAssetLedger(appConfig);
	if (!restored) return false;
	setPrebuiltHtmlPageModuleScriptUrls(appConfig, restored.htmlPageModuleScriptUrls);
	for (const plan of collectIntegrationScriptPlans(appConfig)) {
		assertPlannedScriptsRecorded(appConfig, plan);
	}
	await refreshIntegrationDependencies(appConfig);
	for (const [renderer, routeInstances] of groupRouteInstancesByRenderer(
		restored.plannedRoutes,
		routeRendererFactory,
	)) {
		assertPlannedScriptsRecorded(appConfig, await renderer.buildGroupedGraphBuildPlan(routeInstances));
		await prebuildRouteInstances(renderer, routeInstances);
	}
	requireAppRuntime(appConfig).productionBrowserGraphsSealed = true;
	return true;
}
