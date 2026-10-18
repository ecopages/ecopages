import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { getBuildEntryOutput, collectBuildEntryInputPaths } from '../build/build-graph.ts';
import type { BuildSuccess } from '../build/build-adapter.ts';
import { assertBuildSucceeded } from '../build/build-log.ts';
import type { EcoBuildPlugin } from '../build/contracts/build-types.ts';
import { RESOLVED_ASSETS_DIR } from '../constants.ts';
import type {
	GroupedGraphBuildPlan,
	GroupedGraphBuildPlanInstance,
} from '../route-renderer/orchestration/page-browser-graph/grouped-graph-build-plan.ts';
import { createRouteGraphLookupKey } from '../route-renderer/orchestration/page-browser-graph/route-instance-key.ts';
import {
	collectHtmlPageModuleScriptBuildInputs,
	setPrebuiltHtmlPageModuleScriptUrls,
} from '../html-pages/html-page-module-scripts.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { BrowserBundleService, type BrowserBundleGroupedEntry } from './browser-bundle.service.ts';
import { APP_BROWSER_CLIENT_BUNDLE_ID } from './asset-processing-service/app-browser-client-bundle.ts';
import { deduplicateAssetDependencies } from './asset-processing-service/asset-dependency-keys.ts';
import type { AssetDefinition, ProcessedAsset, ScriptAsset } from './asset-processing-service/assets.types.ts';
import { ensureGroupedContentScriptsBundle } from './asset-processing-service/grouped-content-bundles.ts';

type BuildEntry = {
	entryName: string;
	entrypoint: string;
	dependencies: AssetDefinition[];
	dependencyRoutes: Map<AssetDefinition, Set<string>>;
	pageClientRoutes: Map<string, { dependency: AssetDefinition; routes: Map<string, string | undefined> }>;
	cleanup?: () => void;
};

type RouteBuildPlan = {
	plan: GroupedGraphBuildPlan;
	instances: RouteBuildPlanInstance[];
};

type RouteBuildPlanInstance = {
	instance: GroupedGraphBuildPlanInstance;
	routeKey: string;
	dependencies: AssetDefinition[];
	pageClientBuildEntries: NonNullable<GroupedGraphBuildPlanInstance['pageClientBuildEntries']>;
};

/**
 * Results produced by the application-wide browser build.
 *
 * @remarks
 * Route-instance identity and HTML Page script inputs currently come from rendering modules; #556 tracks
 * moving those shared build inputs behind the Build layer.
 */
export type AppBrowserClientBuildResult = {
	plans: GroupedGraphBuildPlan[];
	sourceFiles: string[];
	outputPaths: string[];
};

function hash(value: string): string {
	return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function dependencyAssociationKey(dependency: AssetDefinition): string {
	const bundleOptions = dependency.kind === 'script' ? dependency.bundleOptions : undefined;
	return JSON.stringify({
		kind: dependency.kind,
		source: dependency.source,
		filepath: 'filepath' in dependency ? path.resolve(dependency.filepath) : undefined,
		content: 'content' in dependency ? hash(dependency.content) : undefined,
		importPath: 'importPath' in dependency ? dependency.importPath : undefined,
		name: 'name' in dependency ? dependency.name : undefined,
		position: dependency.position,
		attributes: dependency.attributes,
		packageRole: dependency.packageRole,
		inline: dependency.inline,
		classic: dependency.kind === 'script' ? dependency.classic : undefined,
		excludeFromHtml: dependency.kind === 'script' ? dependency.excludeFromHtml : undefined,
		bundleOptions: bundleOptions
			? {
					treeshaking: bundleOptions.treeshaking,
					define: bundleOptions.define,
					minify: bundleOptions.minify,
					external: bundleOptions.external,
					splitting: bundleOptions.splitting,
					excludeAppBuildPlugins: bundleOptions.excludeAppBuildPlugins,
					naming: bundleOptions.naming,
					plugins: bundleOptions.plugins?.map((plugin) => [plugin.name, plugin.cacheKey]),
				}
			: undefined,
	});
}

function canBundle(dependency: AssetDefinition): dependency is AssetDefinition & {
	kind: 'script';
	groupedBundle: { id: string; entryName: string };
} {
	return (
		dependency.kind === 'script' &&
		Boolean(dependency.groupedBundle?.id) &&
		dependency.bundle !== false &&
		dependency.classic !== true &&
		dependency.inline !== true
	);
}

export function createAppBrowserClientEntryKey(integrationName: string, dependency: AssetDefinition): string {
	return JSON.stringify([integrationName, dependencyAssociationKey(dependency)]);
}

function getOrCreateBuildEntry(
	appConfig: EcoPagesAppConfig,
	entriesByKey: Map<string, BuildEntry>,
	integrationName: string,
	dependency: AssetDefinition,
	cleanupEntries: Array<() => void>,
): BuildEntry {
	const key = createAppBrowserClientEntryKey(integrationName, dependency);
	const existing = entriesByKey.get(key);
	if (existing) return existing;

	const entrypoint = createBundleEntryPath(appConfig, dependency);
	const entry: BuildEntry = {
		entryName: `client-${hash(key)}`,
		entrypoint: entrypoint.entrypoint,
		dependencies: [],
		dependencyRoutes: new Map(),
		pageClientRoutes: new Map(),
		...(entrypoint.cleanup ? { cleanup: entrypoint.cleanup } : {}),
	};
	entriesByKey.set(key, entry);
	if (entry.cleanup) cleanupEntries.push(entry.cleanup);
	return entry;
}

function prepareAppClientDependency(dependency: AssetDefinition): AssetDefinition {
	if (
		dependency.kind !== 'script' ||
		dependency.bundle === false ||
		dependency.classic === true ||
		dependency.inline === true
	) {
		return dependency;
	}

	const entryName = dependency.groupedBundle?.entryName ?? `client-${hash(dependencyAssociationKey(dependency))}`;
	const prepared = {
		...dependency,
		groupedBundle: { id: APP_BROWSER_CLIENT_BUNDLE_ID, entryName },
	};
	ensureGroupedContentScriptsBundle([prepared]);
	return prepared;
}

function createBundleEntryPath(
	appConfig: EcoPagesAppConfig,
	dependency: AssetDefinition,
): {
	entrypoint: string;
	cleanup?: () => void;
} {
	if (dependency.source === 'file') {
		return { entrypoint: dependency.filepath };
	}

	const entrypoint = path.join(appConfig.absolutePaths.workDir, 'content-script-entries', `${randomUUID()}.js`);
	fileSystem.ensureDir(path.dirname(entrypoint));
	const content =
		dependency.source === 'content' ? dependency.content : `import ${JSON.stringify(dependency.importPath)};`;
	fileSystem.write(entrypoint, content);
	return { entrypoint, cleanup: () => fileSystem.remove(entrypoint) };
}

function createProcessedAsset(
	appConfig: EcoPagesAppConfig,
	dependency: AssetDefinition & { kind: 'script'; groupedBundle: { id: string; entryName: string } },
	entryName: string,
	filepath: string,
	entrypoint: string,
	inputPaths: string[],
): ProcessedAsset {
	const publicPath = `/${path.relative(appConfig.absolutePaths.distDir, filepath).split(path.sep).join('/')}`;
	const sourceFilepath = dependency.source === 'file' ? dependency.filepath : undefined;
	const bundledSourceFilepaths = [
		...new Set([
			...(dependency.bundledSourceFilepaths ?? []),
			...inputPaths.filter((inputPath) => path.resolve(inputPath) !== path.resolve(entrypoint)),
		]),
	];
	return {
		filepath,
		sourceFilepath,
		srcUrl: publicPath,
		kind: 'script',
		position: dependency.position,
		attributes: dependency.attributes,
		inline: false,
		excludeFromHtml: dependency.excludeFromHtml,
		packageRole: dependency.packageRole,
		groupedBundle: { id: APP_BROWSER_CLIENT_BUNDLE_ID, entryName },
		...(bundledSourceFilepaths.length > 0 ? { bundledSourceFilepaths } : {}),
	};
}

function getEntryBuildOptions(entry: BuildEntry): NonNullable<ScriptAsset['bundleOptions']> {
	return entry.dependencies[0]?.kind === 'script' ? (entry.dependencies[0].bundleOptions ?? {}) : {};
}

function arraysEqual<T>(left: readonly T[] = [], right: readonly T[] = []): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

type GroupablePluginLayout = {
	valid: boolean;
	slotsByName: Map<string, string>;
	orderBySlot: Map<number, string[]>;
};

function getGroupablePluginLayout(plugins: readonly EcoBuildPlugin[]): GroupablePluginLayout {
	const slotsByName = new Map<string, string>();
	const orderBySlot = new Map<number, string[]>();
	let slot = 0;
	let valid = true;
	for (const plugin of plugins) {
		if (plugin.bundleGroupKey === undefined) {
			slot += 1;
			continue;
		}
		const token = JSON.stringify([plugin.name, plugin.bundleGroupKey]);
		const slotIdentity = JSON.stringify([plugin.bundleGroupKey, slot]);
		const existingSlot = slotsByName.get(plugin.name);
		if (existingSlot && existingSlot !== slotIdentity) valid = false;
		slotsByName.set(plugin.name, slotIdentity);
		const order = orderBySlot.get(slot) ?? [];
		if (!order.includes(token)) order.push(token);
		orderBySlot.set(slot, order);
	}
	return { valid, slotsByName, orderBySlot };
}

function groupablePluginsCompatible(
	left: readonly EcoBuildPlugin[] = [],
	right: readonly EcoBuildPlugin[] = [],
): boolean {
	const leftLayout = getGroupablePluginLayout(left);
	const rightLayout = getGroupablePluginLayout(right);
	if (!leftLayout.valid || !rightLayout.valid) return false;
	for (const [name, slot] of leftLayout.slotsByName) {
		if (rightLayout.slotsByName.has(name) && rightLayout.slotsByName.get(name) !== slot) return false;
	}
	for (const [slot, leftOrder] of leftLayout.orderBySlot) {
		const rightOrder = rightLayout.orderBySlot.get(slot) ?? [];
		if (rightOrder.length > 0 && !isSubsequence(leftOrder, rightOrder) && !isSubsequence(rightOrder, leftOrder)) {
			return false;
		}
	}
	return true;
}

function isSubsequence(candidate: readonly string[], sequence: readonly string[]): boolean {
	let candidateIndex = 0;
	for (const item of sequence) {
		if (item === candidate[candidateIndex]) candidateIndex += 1;
	}
	return candidateIndex === candidate.length;
}

function bundlePluginsEqual(left: readonly EcoBuildPlugin[] = [], right: readonly EcoBuildPlugin[] = []): boolean {
	return (
		arraysEqual(
			left.filter((plugin) => plugin.bundleGroupKey === undefined),
			right.filter((plugin) => plugin.bundleGroupKey === undefined),
		) && groupablePluginsCompatible(left, right)
	);
}

type GroupedPluginsBySlot = Map<number, Map<string, EcoBuildPlugin[]>>;

function collectGroupedPluginsBySlot(sequences: readonly (readonly EcoBuildPlugin[])[]): GroupedPluginsBySlot {
	const groupedPluginsBySlot: GroupedPluginsBySlot = new Map();
	for (const sequence of sequences) {
		let slot = 0;
		for (const plugin of sequence) {
			if (plugin.bundleGroupKey === undefined) {
				slot += 1;
				continue;
			}
			const token = JSON.stringify([plugin.name, plugin.bundleGroupKey]);
			const groupedPluginsByIdentity = groupedPluginsBySlot.get(slot) ?? new Map<string, EcoBuildPlugin[]>();
			const groupedPlugins = groupedPluginsByIdentity.get(token) ?? [];
			if (!groupedPlugins.includes(plugin)) groupedPlugins.push(plugin);
			groupedPluginsByIdentity.set(token, groupedPlugins);
			groupedPluginsBySlot.set(slot, groupedPluginsByIdentity);
		}
	}
	return groupedPluginsBySlot;
}

function getMergedGroupOrder(leftOrder: readonly string[], rightOrder: readonly string[]): readonly string[] {
	return isSubsequence(leftOrder, rightOrder) ? rightOrder : leftOrder;
}

function appendGroupedPluginsAtSlot(
	merged: EcoBuildPlugin[],
	groupedPluginsBySlot: GroupedPluginsBySlot,
	groupOrder: readonly string[],
	slot: number,
): void {
	for (const token of groupOrder) {
		merged.push(...(groupedPluginsBySlot.get(slot)?.get(token) ?? []));
	}
}

function mergePluginSlots(
	commonPlugins: readonly EcoBuildPlugin[],
	groupedPluginsBySlot: GroupedPluginsBySlot,
	leftLayout: GroupablePluginLayout,
	rightLayout: GroupablePluginLayout,
): EcoBuildPlugin[] {
	const merged: EcoBuildPlugin[] = [];
	for (let slot = 0; slot <= commonPlugins.length; slot += 1) {
		const leftOrder = leftLayout.orderBySlot.get(slot) ?? [];
		const rightOrder = rightLayout.orderBySlot.get(slot) ?? [];
		appendGroupedPluginsAtSlot(merged, groupedPluginsBySlot, getMergedGroupOrder(leftOrder, rightOrder), slot);
		const commonPlugin = commonPlugins[slot];
		if (commonPlugin) merged.push(commonPlugin);
	}
	return merged;
}

function mergeBundlePlugins(
	left: readonly EcoBuildPlugin[] = [],
	right: readonly EcoBuildPlugin[] = [],
): EcoBuildPlugin[] {
	const commonPlugins = left.filter((plugin) => plugin.bundleGroupKey === undefined);
	const groupedPluginsBySlot = collectGroupedPluginsBySlot([left, right]);
	const leftLayout = getGroupablePluginLayout(left);
	const rightLayout = getGroupablePluginLayout(right);
	return mergePluginSlots(commonPlugins, groupedPluginsBySlot, leftLayout, rightLayout);
}

function setsEqual(left: readonly string[] = [], right: readonly string[] = []): boolean {
	return left.length === right.length && left.every((value) => right.includes(value));
}

function recordsEqual(left: Record<string, string> = {}, right: Record<string, string> = {}): boolean {
	const leftEntries = Object.entries(left);
	const rightEntries = Object.entries(right);
	return leftEntries.length === rightEntries.length && leftEntries.every(([key, value]) => right[key] === value);
}

function buildOptionsEqual(
	left: NonNullable<ScriptAsset['bundleOptions']>,
	right: NonNullable<ScriptAsset['bundleOptions']>,
): boolean {
	return (
		(left.minify ?? true) === (right.minify ?? true) &&
		(left.splitting ?? true) === (right.splitting ?? true) &&
		(left.treeshaking ?? true) === (right.treeshaking ?? true) &&
		setsEqual(left.external, right.external) &&
		setsEqual(left.excludeAppBuildPlugins, right.excludeAppBuildPlugins) &&
		recordsEqual(left.define, right.define) &&
		bundlePluginsEqual(left.plugins, right.plugins)
	);
}

function groupBuildEntriesByOptions(
	entries: BuildEntry[],
): Array<{ entries: BuildEntry[]; options: NonNullable<ScriptAsset['bundleOptions']> }> {
	const groups: Array<{ entries: BuildEntry[]; options: NonNullable<ScriptAsset['bundleOptions']> }> = [];
	for (const entry of entries) {
		const options = getEntryBuildOptions(entry);
		const group = groups.find((candidate) => buildOptionsEqual(candidate.options, options));
		if (group) {
			group.entries.push(entry);
			group.options = {
				...group.options,
				plugins: mergeBundlePlugins(group.options.plugins, options.plugins),
			};
		} else {
			groups.push({
				entries: [entry],
				options: { ...options, plugins: options.plugins ? [...options.plugins] : undefined },
			});
		}
	}
	return groups;
}

function registerGroupedDependency(
	appConfig: EcoPagesAppConfig,
	entriesByKey: Map<string, BuildEntry>,
	cleanupEntries: Array<() => void>,
	integrationName: string,
	routeKey: string,
	dependency: AssetDefinition,
): AssetDefinition {
	if (!canBundle(dependency)) return dependency;
	const entry = getOrCreateBuildEntry(appConfig, entriesByKey, integrationName, dependency, cleanupEntries);
	if (!entry.dependencies.includes(dependency)) entry.dependencies.push(dependency);
	const routes = entry.dependencyRoutes.get(dependency) ?? new Set<string>();
	routes.add(routeKey);
	entry.dependencyRoutes.set(dependency, routes);
	return { ...dependency, groupedBundle: { id: APP_BROWSER_CLIENT_BUNDLE_ID, entryName: entry.entryName } };
}

function registerPageClientEntry(
	appConfig: EcoPagesAppConfig,
	entriesByKey: Map<string, BuildEntry>,
	cleanupEntries: Array<() => void>,
	instance: GroupedGraphBuildPlanInstance,
	routeKey: string,
	clientEntry: NonNullable<GroupedGraphBuildPlanInstance['pageClientBuildEntries']>[number],
): NonNullable<GroupedGraphBuildPlanInstance['pageClientBuildEntries']>[number] {
	const dependency = prepareAppClientDependency(clientEntry.dependency);
	if (!canBundle(dependency)) {
		instance.prebuiltPageClientBrowserAssets ??= {
			processedAssets: [],
			islandRenderAssetsByFile: new Map(),
			fallbackDependencies: [],
		};
		instance.prebuiltPageClientBrowserAssets.fallbackDependencies.push({
			dependency,
			integrationName: clientEntry.integrationName,
		});
		return { ...clientEntry, dependency };
	}

	const entry = getOrCreateBuildEntry(
		appConfig,
		entriesByKey,
		clientEntry.integrationName,
		dependency,
		cleanupEntries,
	);
	const identity = dependencyAssociationKey(dependency);
	if (!entry.dependencies.some((entryDependency) => dependencyAssociationKey(entryDependency) === identity)) {
		entry.dependencies.push(dependency);
	}
	const association = entry.pageClientRoutes.get(identity) ?? {
		dependency,
		routes: new Map<string, string | undefined>(),
	};
	association.routes.set(routeKey, clientEntry.islandFile);
	entry.pageClientRoutes.set(identity, association);
	return { ...clientEntry, dependency };
}

function prepareRouteBuildPlan(
	appConfig: EcoPagesAppConfig,
	plan: GroupedGraphBuildPlan,
	entriesByKey: Map<string, BuildEntry>,
	cleanupEntries: Array<() => void>,
): RouteBuildPlan {
	const integration = appConfig.integrations.find((entry) => entry.name === plan.integrationName);
	const instances: RouteBuildPlanInstance[] = plan.instances.map((instance) => ({
		instance,
		routeKey: createRouteGraphLookupKey(instance.routeFile, instance.dependencyInstanceKey),
		dependencies: [...(instance.contribution?.dependencies ?? [])],
		pageClientBuildEntries: [...(instance.pageClientBuildEntries ?? [])],
	}));
	const routesByDependencyIdentity = new Map<string, Set<string>>();
	const dependencies = instances.flatMap(({ routeKey, dependencies: routeDependencies }) =>
		routeDependencies.map((dependency) => {
			const identity = dependencyAssociationKey(dependency);
			const routes = routesByDependencyIdentity.get(identity) ?? new Set<string>();
			routes.add(routeKey);
			routesByDependencyIdentity.set(identity, routes);
			return dependency;
		}),
	);
	const deduplicatedDependencies = deduplicateAssetDependencies(dependencies);
	const preparedDependencies =
		integration?.prepareAssetDependencies?.(deduplicatedDependencies) ?? deduplicatedDependencies;
	ensureGroupedContentScriptsBundle(preparedDependencies);

	for (const { instance, routeKey } of instances) {
		const routeDependencies = preparedDependencies.filter((dependency) =>
			routesByDependencyIdentity.get(dependencyAssociationKey(dependency))?.has(routeKey),
		);
		const updatedDependencies = routeDependencies.map((dependency) =>
			registerGroupedDependency(
				appConfig,
				entriesByKey,
				cleanupEntries,
				plan.integrationName,
				routeKey,
				dependency,
			),
		);
		instance.contribution = instance.contribution
			? { ...instance.contribution, dependencies: updatedDependencies }
			: undefined;
		instance.prebuiltGroupedAssets = [];
		instance.pageClientBuildEntries = instance.pageClientBuildEntries?.map((clientEntry) =>
			registerPageClientEntry(appConfig, entriesByKey, cleanupEntries, instance, routeKey, clientEntry),
		);
	}

	return { plan, instances };
}

function prepareRouteBuildPlans(
	appConfig: EcoPagesAppConfig,
	plans: readonly GroupedGraphBuildPlan[],
	cleanupEntries: Array<() => void>,
): { routePlans: RouteBuildPlan[]; entries: BuildEntry[] } {
	const entriesByKey = new Map<string, BuildEntry>();
	const routePlans = plans.map((plan) => prepareRouteBuildPlan(appConfig, plan, entriesByKey, cleanupEntries));
	return { routePlans, entries: [...entriesByKey.values()] };
}

function attachPageClientAsset(
	instance: GroupedGraphBuildPlanInstance,
	asset: ProcessedAsset,
	islandFile: string | undefined,
): void {
	const prebuilt = instance.prebuiltPageClientBrowserAssets ?? {
		processedAssets: [],
		islandRenderAssetsByFile: new Map<string, ProcessedAsset[]>(),
		fallbackDependencies: [],
	};
	prebuilt.processedAssets.push(asset);
	if (islandFile) {
		const islandAssets = prebuilt.islandRenderAssetsByFile.get(islandFile) ?? [];
		islandAssets.push(asset);
		prebuilt.islandRenderAssetsByFile.set(islandFile, islandAssets);
	}
	instance.prebuiltPageClientBrowserAssets = prebuilt;
}

function attachEntryAssetToRoutes(
	entry: BuildEntry,
	dependency: AssetDefinition,
	asset: ProcessedAsset,
	routePlans: RouteBuildPlan[],
): void {
	const clientAssociation = entry.pageClientRoutes.get(dependencyAssociationKey(dependency));
	for (const routePlan of routePlans) {
		for (const { instance, routeKey } of routePlan.instances) {
			if (entry.dependencyRoutes.get(dependency)?.has(routeKey)) {
				instance.prebuiltGroupedAssets = [...(instance.prebuiltGroupedAssets ?? []), asset];
			}
			if (clientAssociation?.routes.has(routeKey)) {
				attachPageClientAsset(instance, asset, clientAssociation.routes.get(routeKey));
			}
		}
	}
}

function attachBuiltEntryAssets(
	appConfig: EcoPagesAppConfig,
	result: BuildSuccess,
	entries: BuildEntry[],
	routePlans: RouteBuildPlan[],
): void {
	for (const entry of entries) {
		const output = getBuildEntryOutput(result, entry.entryName, appConfig.rootDir);
		if (!output) throw new Error(`No build output generated for app browser client entry ${entry.entryName}`);
		const inputPaths = collectBuildEntryInputPaths(result, entry.entryName, appConfig.rootDir);
		for (const dependency of entry.dependencies) {
			const asset = createProcessedAsset(
				appConfig,
				dependency as AssetDefinition & { kind: 'script'; groupedBundle: { id: string; entryName: string } },
				entry.entryName,
				output,
				entry.entrypoint,
				inputPaths,
			);
			attachEntryAssetToRoutes(entry, dependency, asset, routePlans);
		}
	}
}

function collectHtmlScriptUrls(
	appConfig: EcoPagesAppConfig,
	result: BuildSuccess,
	htmlEntryNames: ReadonlyMap<string, string>,
): Map<string, string> {
	const urls = new Map<string, string>();
	for (const [script, entryName] of htmlEntryNames) {
		const output = getBuildEntryOutput(result, entryName, appConfig.rootDir);
		if (output) {
			urls.set(
				realpathSync(script),
				`/${path.relative(appConfig.absolutePaths.distDir, output).split(path.sep).join('/')}`,
			);
		}
	}
	return urls;
}

async function executeAppBrowserBuild(
	appConfig: EcoPagesAppConfig,
	buildEntries: BuildEntry[],
	routePlans: RouteBuildPlan[],
	htmlEntryNames: ReadonlyMap<string, string>,
): Promise<{
	buildFingerprint: string;
	htmlScriptUrls: Map<string, string>;
	sourceFiles: string[];
	outputPaths: string[];
}> {
	const htmlScriptUrls = new Map<string, string>();
	const sourceFiles = new Set<string>();
	const outputPaths: string[] = [];
	const browserBundleService = new BrowserBundleService(appConfig);
	for (const group of groupBuildEntriesByOptions(buildEntries)) {
		const entriesForBuild: BrowserBundleGroupedEntry[] = group.entries.map(({ entryName, entrypoint }) => ({
			entryName,
			entrypoint,
		}));
		const result = await browserBundleService.bundleGroupedEntries(entriesForBuild, {
			lane: 'build',
			outdir: path.join(appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR),
			root: appConfig.rootDir,
			...group.options,
			splitting: group.options.splitting ?? true,
			naming: '[name]-[hash].[ext]',
			minify: group.options.minify ?? true,
		});
		assertBuildSucceeded(result, '[ecopages] Could not build the app browser client');
		for (const entry of group.entries) {
			for (const filepath of collectBuildEntryInputPaths(result, entry.entrypoint, appConfig.rootDir, {
				includeNodeModules: true,
			})) {
				sourceFiles.add(path.resolve(filepath));
			}
		}
		for (const { path: output } of result.outputs) {
			outputPaths.push(output);
			if (output.endsWith('.js') || output.endsWith('.css')) fileSystem.gzipFile(output);
		}
		attachBuiltEntryAssets(
			appConfig,
			result,
			group.entries.filter((entry) => entry.dependencies.length > 0),
			routePlans,
		);
		const groupHtmlEntries = new Map(
			[...htmlEntryNames].filter(([, entryName]) => group.entries.some((entry) => entry.entryName === entryName)),
		);
		for (const [script, url] of collectHtmlScriptUrls(appConfig, result, groupHtmlEntries)) {
			htmlScriptUrls.set(script, url);
		}
	}

	return {
		buildFingerprint: hash(outputPaths.sort().join('\n')),
		htmlScriptUrls,
		sourceFiles: [...sourceFiles],
		outputPaths,
	};
}

/** Builds the production browser client once for the app and attaches its route assets to plans. */
export async function buildAppBrowserClient(
	appConfig: EcoPagesAppConfig,
	plans: readonly GroupedGraphBuildPlan[],
): Promise<AppBrowserClientBuildResult> {
	const cleanupEntries: Array<() => void> = [];
	try {
		const { routePlans, entries } = prepareRouteBuildPlans(appConfig, plans, cleanupEntries);
		const htmlInputs = collectHtmlPageModuleScriptBuildInputs(appConfig);
		const buildEntries = [...entries];
		const htmlEntryNames = new Map<string, string>();
		for (const script of htmlInputs.scripts) {
			if (!fileSystem.exists(script)) continue;
			const entryName = `html-${hash(path.resolve(script))}`;
			htmlEntryNames.set(script, entryName);
			buildEntries.push({
				entryName,
				entrypoint: script,
				dependencies: [],
				dependencyRoutes: new Map(),
				pageClientRoutes: new Map(),
			});
		}

		const build =
			buildEntries.length > 0
				? await executeAppBrowserBuild(appConfig, buildEntries, routePlans, htmlEntryNames)
				: {
						buildFingerprint: 'empty',
						htmlScriptUrls: new Map<string, string>(),
						sourceFiles: [],
						outputPaths: [],
					};
		setPrebuiltHtmlPageModuleScriptUrls(appConfig, build.htmlScriptUrls);
		return {
			plans: routePlans.map(({ plan }) => ({
				...plan,
				planKey: JSON.stringify([plan.planKey, 'app-browser-client', build.buildFingerprint]),
			})),
			sourceFiles: build.sourceFiles,
			outputPaths: build.outputPaths,
		};
	} finally {
		for (const cleanup of cleanupEntries) cleanup();
	}
}
