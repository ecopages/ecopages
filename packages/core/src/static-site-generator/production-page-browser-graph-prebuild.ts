import path from 'node:path';
import { requireAppRuntime } from '../config/app-runtime.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { PageParams } from '../types/public-types.ts';
import type { PageRendererResolver } from '../route-renderer/route-renderer.ts';
import type { IntegrationRenderer } from '../route-renderer/orchestration/integration-renderer.ts';
import type { GroupedGraphBuildPlan } from '../route-renderer/orchestration/page-browser-graph/grouped-graph-build-plan.ts';
import { createPageDependencyInstanceKey } from '../route-renderer/orchestration/page-browser-graph/route-instance-key.ts';
import {
	collectHtmlPageModuleScriptBuildInputs,
	setPrebuiltHtmlPageModuleScriptUrls,
} from '../html-pages/html-page-module-scripts.ts';
import { buildAppBrowserClient } from '../assets/app-browser-client-build.ts';
import {
	assertAppBrowserClientOutputsExist,
	assertAppBrowserClientManifestHtmlOutputsExist,
	clearAppBrowserClientManifest,
	assertAppBrowserClientSourcesMatch,
	createNormalizedAppBrowserClientEntryKey,
	readAppBrowserClientManifest,
	restoreAppBrowserClientAssets,
	resolveAppBrowserClientManifestPath,
	writeAppBrowserClientManifest,
} from '../assets/app-browser-client-manifest.ts';
import type { AppBrowserClientManifestEntry } from '../assets/app-browser-client-manifest.ts';

export type ProductionPageBrowserGraphRouteInstance = {
	routeFile: string;
	params?: PageParams;
	skipStaticProps?: boolean;
	isRouteTemplate?: boolean;
};

/**
 * Returns whether production should reuse prebuilt Page Browser Graphs.
 *
 * @remarks
 * True only when `NODE_ENV === 'production'`. Independent of `force` and of
 * unified pages-graph env flags.
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
	clearAppBrowserClientManifest(appConfig);
}

function serializeProductionRouteInstance(instance: ProductionPageBrowserGraphRouteInstance): string {
	const routeFile = path.resolve(instance.routeFile);
	const dependencyInstanceKey = createPageDependencyInstanceKey({ params: instance.params });
	return JSON.stringify([
		routeFile,
		dependencyInstanceKey,
		instance.skipStaticProps ?? false,
		instance.isRouteTemplate ?? false,
	]);
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
	const appBrowserBuild = await buildAppBrowserClient(
		appConfig,
		rendererPlans.map(({ groupedBuildPlan }) => groupedBuildPlan),
	);
	await writeAppBrowserClientManifest(
		appConfig,
		appBrowserBuild.plans,
		rendererPlans.flatMap(({ routeInstances: instances }) => instances),
		appBrowserBuild,
	);

	for (const [index, { renderer, routeInstances: routeInstancesForRenderer }] of rendererPlans.entries()) {
		const groupedBuildPlan = appBrowserBuild.plans[index];
		if (!groupedBuildPlan) continue;
		for (const routeInstance of routeInstancesForRenderer) {
			await renderer.prebuildProductionPageBrowserGraph(routeInstance.routeFile, {
				params: routeInstance.params,
				skipStaticProps: routeInstance.skipStaticProps,
				isRouteTemplate: routeInstance.isRouteTemplate,
				groupedBuildPlan,
			});
		}
	}
}

type ResolvedManifestEntry = AppBrowserClientManifestEntry & { routeFile: string };

function groupManifestEntriesByRenderer(
	appConfig: EcoPagesAppConfig,
	routeRendererFactory: PageRendererResolver,
	manifestEntries: readonly AppBrowserClientManifestEntry[],
): Map<IntegrationRenderer<unknown>, ResolvedManifestEntry[]> {
	const entriesByRenderer = new Map<IntegrationRenderer<unknown>, ResolvedManifestEntry[]>();
	for (const manifestEntry of manifestEntries) {
		const routeFile = resolveAppBrowserClientManifestPath(appConfig, manifestEntry.routeFile);
		const renderer = routeRendererFactory.getPageRenderer(routeFile) as IntegrationRenderer<unknown>;
		if (renderer.name !== manifestEntry.integrationName) {
			throw new Error(
				`The app browser build manifest assigns ${manifestEntry.routeFile} to ${manifestEntry.integrationName}, but the current route uses ${renderer.name}. Run \`ecopages build\` again.`,
			);
		}
		const entries = entriesByRenderer.get(renderer) ?? [];
		entries.push({ ...manifestEntry, routeFile });
		entriesByRenderer.set(renderer, entries);
	}
	return entriesByRenderer;
}

function findPlanInstance(
	entry: ResolvedManifestEntry,
	instances: readonly GroupedGraphBuildPlan['instances'][number][],
): GroupedGraphBuildPlan['instances'][number] {
	const dependencyInstanceKey = createPageDependencyInstanceKey({ params: entry.params });
	const instance = instances.find(
		(candidate) =>
			candidate.routeFile === entry.routeFile &&
			candidate.dependencyInstanceKey === dependencyInstanceKey &&
			(candidate.skipStaticProps ?? false) === (entry.skipStaticProps ?? false) &&
			(candidate.isRouteTemplate ?? false) === (entry.isRouteTemplate ?? false),
	);
	if (!instance) {
		throw new Error(
			`The app browser build manifest has no current route plan for ${entry.routeFile}. Run \`ecopages build\` again.`,
		);
	}
	return instance;
}

function assertManifestDependenciesMatch(
	rootDir: string,
	renderer: IntegrationRenderer<unknown>,
	entry: ResolvedManifestEntry,
	instance: GroupedGraphBuildPlan['instances'][number],
): void {
	const groupedDependencyKeys = [
		...new Set(
			(instance.contribution?.dependencies ?? []).map((dependency) =>
				createNormalizedAppBrowserClientEntryKey(rootDir, renderer.name, dependency),
			),
		),
	].sort();
	const pageClientBuildEntryKeys = (instance.pageClientBuildEntries ?? [])
		.map((clientEntry) =>
			createNormalizedAppBrowserClientEntryKey(rootDir, clientEntry.integrationName, clientEntry.dependency),
		)
		.sort();
	if (
		JSON.stringify(groupedDependencyKeys) !== JSON.stringify(entry.groupedDependencyKeys) ||
		JSON.stringify(pageClientBuildEntryKeys) !== JSON.stringify(entry.pageClientBuildEntryKeys)
	) {
		throw new Error(
			`The app browser build manifest does not match the current client dependencies for ${entry.routeFile}. Run \`ecopages build\` again.`,
		);
	}
}

function restoreFallbackDependencies(
	rootDir: string,
	entry: ResolvedManifestEntry,
	instance: GroupedGraphBuildPlan['instances'][number],
): NonNullable<GroupedGraphBuildPlan['instances'][number]['prebuiltPageClientBrowserAssets']>['fallbackDependencies'] {
	return entry.pageClientAssets.fallbackPageClientBuildEntryKeys.map((key) => {
		const fallbackEntry = instance.pageClientBuildEntries?.find(
			(clientEntry) =>
				createNormalizedAppBrowserClientEntryKey(
					rootDir,
					clientEntry.integrationName,
					clientEntry.dependency,
				) === key,
		);
		if (!fallbackEntry) {
			throw new Error(
				`The app browser build manifest has a missing fallback client entry for ${entry.routeFile}. Run \`ecopages build\` again.`,
			);
		}
		return {
			dependency: fallbackEntry.dependency,
			integrationName: fallbackEntry.integrationName,
		};
	});
}

function restoreManifestRouteAssets(
	appConfig: EcoPagesAppConfig,
	renderer: IntegrationRenderer<unknown>,
	entry: ResolvedManifestEntry,
	instance: GroupedGraphBuildPlan['instances'][number],
): void {
	assertManifestDependenciesMatch(appConfig.rootDir, renderer, entry, instance);
	instance.prebuiltGroupedAssets = restoreAppBrowserClientAssets(appConfig, entry.groupedAssets);
	instance.prebuiltPageClientBrowserAssets = {
		processedAssets: restoreAppBrowserClientAssets(appConfig, entry.pageClientAssets.processedAssets),
		islandRenderAssetsByFile: new Map(
			entry.pageClientAssets.islandRenderAssetsByFile.map(([filePath, assets]) => [
				resolveAppBrowserClientManifestPath(appConfig, filePath),
				restoreAppBrowserClientAssets(appConfig, assets),
			]),
		),
		fallbackDependencies: restoreFallbackDependencies(appConfig.rootDir, entry, instance),
	};
}

async function prebuildManifestEntriesForRenderer(
	appConfig: EcoPagesAppConfig,
	renderer: IntegrationRenderer<unknown>,
	entries: readonly ResolvedManifestEntry[],
): Promise<void> {
	const groupedBuildPlan = await renderer.buildGroupedGraphBuildPlan(
		entries.map(({ routeFile, params, skipStaticProps, isRouteTemplate }) => ({
			routeFile,
			params,
			skipStaticProps,
			isRouteTemplate,
		})),
	);
	groupedBuildPlan.planKey = entries[0]?.planKey ?? groupedBuildPlan.planKey;

	for (const entry of entries) {
		const instance = findPlanInstance(entry, groupedBuildPlan.instances);
		restoreManifestRouteAssets(appConfig, renderer, entry, instance);
	}
	for (const entry of entries) {
		await renderer.prebuildProductionPageBrowserGraph(entry.routeFile, {
			params: entry.params,
			skipStaticProps: entry.skipStaticProps,
			isRouteTemplate: entry.isRouteTemplate,
			groupedBuildPlan,
		});
	}
}

/** Reuses the browser outputs written by `ecopages build` while `ecopages start` prepares SSR routes. */
export async function prebuildProductionPageBrowserGraphsFromManifest(
	appConfig: EcoPagesAppConfig,
	routeRendererFactory: PageRendererResolver,
): Promise<boolean> {
	if (!shouldPrebuildProductionPageBrowserGraphs()) return false;
	const manifest = readAppBrowserClientManifest(appConfig);
	if (!manifest) return false;
	assertAppBrowserClientSourcesMatch(appConfig, manifest.sourceFingerprints);
	if (collectHtmlPageModuleScriptBuildInputs(appConfig).fingerprint !== manifest.htmlPageModuleScriptFingerprint) {
		throw new Error(
			`The app browser build manifest does not match the current HTML Page module scripts. Run \`ecopages build\` again.`,
		);
	}
	assertAppBrowserClientOutputsExist(appConfig, manifest.browserOutputPaths);
	assertAppBrowserClientManifestHtmlOutputsExist(appConfig, manifest.htmlPageModuleScriptUrls);

	setPrebuiltHtmlPageModuleScriptUrls(
		appConfig,
		new Map(
			Object.entries(manifest.htmlPageModuleScriptUrls).map(([filePath, url]) => [
				resolveAppBrowserClientManifestPath(appConfig, filePath),
				url,
			]),
		),
	);
	for (const [renderer, entries] of groupManifestEntriesByRenderer(
		appConfig,
		routeRendererFactory,
		manifest.entries,
	)) {
		await prebuildManifestEntriesForRenderer(appConfig, renderer, entries);
	}
	return true;
}
