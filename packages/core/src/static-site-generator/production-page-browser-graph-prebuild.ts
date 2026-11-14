import { path } from '@ecopages/file-system/path';
import { isProductionRuntime } from '../utils/runtime.ts';
import { requireAppRuntime } from '../utils/app-runtime.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import type { PageRendererResolver } from '../route-renderer/route-renderer.ts';
import type { PlannedRoutePreparation } from '../route-renderer/orchestration/route-pipeline/route-render-orchestrator.ts';
import type {
	IntegrationRenderer,
	PlannedRouteInstance,
	ProductionRoutesPlan,
} from '../route-renderer/orchestration/integration-renderer.ts';
import type { GroupedGraphBuildPlan } from '../route-renderer/orchestration/page-browser-graph/grouped-graph-build-plan.ts';
import { createPageDependencyInstanceKey } from '../route-renderer/orchestration/page-browser-graph/route-instance-key.ts';
import { buildAppBrowserClient } from '../assets/app-browser-client-build.ts';
import {
	clearProductionAssetLedger,
	restoreProductionAssetLedger,
	writeProductionAssetLedger,
} from '../build/production-asset-ledger.ts';
import { prepareAssetDependencies } from '../assets/asset-processing-service/asset-processing.service.ts';
import {
	getPrebuiltHtmlPageModuleScriptUrls,
	setPrebuiltHtmlPageModuleScriptUrls,
} from '../html-pages/html-page-module-scripts.ts';
import { isBundleableScript } from '../assets/asset-processing-service/bundleable-script.ts';
import { resolveIntegrationDependencies } from '../build/app-build-manifest-runtime.ts';

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
 * Clears only the `'production'` policy so a failed or force export cannot reuse staged graph output, forgets the
 * app-wide browser build so a retry of `ecopages build` records only its own outputs, and removes the asset ledger
 * file a previous build wrote. Development session records are left intact.
 */
export function clearProductionPageBrowserGraphSession(appConfig: EcoPagesAppConfig): void {
	const runtime = requireAppRuntime(appConfig);
	runtime.pageBrowserGraphSession.clearPolicyRecords('production');
	runtime.processedAssets.clearBrowserOutputs();
	clearProductionAssetLedger(appConfig);
}

/** Identifies one planned route instance: its file, Params and whether it is a template without a `props` run. */
export function getPlannedRouteKey(instance: PlannedRouteInstance): string {
	const routeFile = path.resolve(instance.routeFile);
	const dependencyInstanceKey = createPageDependencyInstanceKey({ params: instance.params });
	return JSON.stringify([
		routeFile,
		dependencyInstanceKey,
		instance.skipPropsHook ?? false,
		instance.isRouteTemplate ?? false,
	]);
}

function groupRouteInstancesByRenderer(
	routeInstances: readonly PlannedRouteInstance[],
	routeRendererFactory: PageRendererResolver,
): Map<IntegrationRenderer<unknown>, PlannedRouteInstance[]> {
	const instancesByRenderer = new Map<IntegrationRenderer<unknown>, PlannedRouteInstance[]>();
	for (const routeInstance of routeInstances) {
		const renderer = routeRendererFactory.getPageRenderer(routeInstance.routeFile) as IntegrationRenderer<unknown>;
		const instances = instancesByRenderer.get(renderer) ?? [];
		instances.push(routeInstance);
		instancesByRenderer.set(renderer, instances);
	}
	return instancesByRenderer;
}

/**
 * Builds the production browser client for the supplied route instances and prepares each of them.
 *
 * @remarks
 * Deduplicates route file + params pairs and plans each renderer's routes, which collects the scripts they bundle
 * without processing them. The app-wide browser build then records every planned script in the asset ledger, and
 * each planned route processes its dependencies through it, so the ledger records everything `ecopages start`
 * serves those routes with. The ledger is then written beside the server bundle, where the Lit static-render
 * worker restores it during the export. A route that fails to plan is left out and reported to `onRouteFailure`.
 * Each Integration's global scripts are resolved once, after that build, or on their own when no route is planned.
 *
 * Returns the preparation of every planned instance that runs its `props` hook, by {@link getPlannedRouteKey}, so
 * static export renders it without running its data hooks again. The caller owns the map for the build; no
 * renderer keeps it.
 */
export async function prebuildProductionPageBrowserGraphs(
	appConfig: EcoPagesAppConfig,
	routeInstances: readonly PlannedRouteInstance[],
	routeRendererFactory: PageRendererResolver,
	options: { onRouteFailure?: (routeInstance: PlannedRouteInstance, error: unknown) => void } = {},
): Promise<Map<string, PlannedRoutePreparation>> {
	const uniqueRouteInstances = [
		...new Map(routeInstances.map((instance) => [getPlannedRouteKey(instance), instance] as const)).values(),
	].sort((left, right) => getPlannedRouteKey(left).localeCompare(getPlannedRouteKey(right)));

	const routePlans: ProductionRoutesPlan[] = [];
	for (const [renderer, instances] of groupRouteInstancesByRenderer(uniqueRouteInstances, routeRendererFactory)) {
		const routePlan = await renderer.planProductionRoutes(instances, {
			onRouteFailure: options.onRouteFailure ?? (() => {}),
		});
		if (routePlan) routePlans.push(routePlan);
	}
	const preparations = new Map<string, PlannedRoutePreparation>();
	if (routePlans.length === 0) {
		await resolveIntegrationDependencies({ appConfig });
		return preparations;
	}
	await buildAppBrowserClient(appConfig, [
		...routePlans.map(({ plan }) => plan),
		...collectIntegrationScriptPlans(appConfig),
	]);
	await resolveIntegrationDependencies({ appConfig });
	for (const { prepare } of routePlans) {
		await prepare();
	}
	writeProductionAssetLedger(appConfig, await getPrebuiltHtmlPageModuleScriptUrls(appConfig));
	for (const { instance, preparation } of routePlans.flatMap((routePlan) => routePlan.preparations)) {
		if (!instance.skipPropsHook) preparations.set(getPlannedRouteKey(instance), preparation);
	}
	return preparations;
}

/**
 * Lists each Integration's global scripts as a plan without routes, so the app-wide build bundles them.
 */
function collectIntegrationScriptPlans(appConfig: EcoPagesAppConfig): GroupedGraphBuildPlan[] {
	return appConfig.integrations.flatMap((integration) => {
		const bundledScripts = prepareAssetDependencies(
			[...integration.getIntegrationDependencies()],
			integration,
			appConfig.rootDir,
		).filter(isBundleableScript);
		return bundledScripts.length > 0
			? [{ integrationName: integration.name, bundledScripts, pageClientEntries: [] }]
			: [];
	});
}

/**
 * Restores the app-wide browser build `ecopages build` recorded in the asset ledger.
 *
 * @remarks
 * Rendering then resolves every script that build bundled through the ledger. With `seal`, as `ecopages start` from
 * a complete `dist/` restores it, a missing ledger is an error. Every dependency then resolves through the ledger,
 * one it does not record is an error, and start compiles and writes nothing. The Lit static-render worker restores without sealing: it renders
 * during the build, which still processes what the ledger does not yet record. It resolves no Integration global
 * scripts: the caller resolves them after it, whether or not a ledger was restored.
 */
export async function restoreProductionBrowserBuild(
	appConfig: EcoPagesAppConfig,
	options: { seal: boolean },
): Promise<boolean> {
	const restored = shouldPrebuildProductionPageBrowserGraphs() ? restoreProductionAssetLedger(appConfig) : undefined;
	if (!restored) {
		if (options.seal && shouldPrebuildProductionPageBrowserGraphs()) {
			throw new Error('The production asset ledger is missing. Run `ecopages build` again.');
		}
		return false;
	}
	setPrebuiltHtmlPageModuleScriptUrls(appConfig, restored.htmlPageModuleScriptUrls);
	if (options.seal) requireAppRuntime(appConfig).processedAssets.seal();
	return true;
}
