import { randomUUID } from 'node:crypto';
import { contentHash } from '../utils/content-hash.ts';
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
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
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
	pageClientRoutes: Map<string, Set<string>>;
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
	return contentHash(value, 16);
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

function setsEqual(left: readonly string[] = [], right: readonly string[] = []): boolean {
	return left.length === right.length && left.every((value) => right.includes(value));
}

function recordsEqual(left: Record<string, string> = {}, right: Record<string, string> = {}): boolean {
	const leftEntries = Object.entries(left);
	const rightEntries = Object.entries(right);
	return leftEntries.length === rightEntries.length && leftEntries.every(([key, value]) => right[key] === value);
}

/**
 * Whether two entries can share one build.
 *
 * @remarks
 * Only options that apply to the whole build keep entries apart. Plugins and external modules do not: each
 * plugin is scoped to the entries that declared it (see {@link mergeEntryPlugins}), and an external module
 * stays external for the whole build. Splitting is always on in the app-wide build.
 */
function buildWideOptionsEqual(
	left: NonNullable<ScriptAsset['bundleOptions']>,
	right: NonNullable<ScriptAsset['bundleOptions']>,
): boolean {
	return (
		(left.minify ?? true) === (right.minify ?? true) &&
		(left.treeshaking ?? true) === (right.treeshaking ?? true) &&
		setsEqual(left.excludeAppBuildPlugins, right.excludeAppBuildPlugins) &&
		recordsEqual(left.define, right.define)
	);
}

/** Instances with one `bundleGroupKey` count as one plugin; any other plugin is its own identity. */
function pluginIdentity(plugin: EcoBuildPlugin): unknown {
	return plugin.bundleGroupKey === undefined ? plugin : JSON.stringify([plugin.name, plugin.bundleGroupKey]);
}

function pluginIdentityOrder(plugins: readonly EcoBuildPlugin[]): unknown[] {
	return [...new Set(plugins.map(pluginIdentity))];
}

/**
 * Whether `plugins` keeps the relative order of every plugin it shares with `merged`.
 *
 * @remarks
 * The first plugin that returns a result wins a hook, so two entries that order the same plugins differently
 * need different builds.
 */
function pluginOrderCompatible(merged: readonly EcoBuildPlugin[], plugins: readonly EcoBuildPlugin[]): boolean {
	const entryOrder = pluginIdentityOrder(plugins);
	const mergedOrder = pluginIdentityOrder(merged);
	const shared = new Set(entryOrder.filter((identity) => mergedOrder.includes(identity)));
	const mergedShared = mergedOrder.filter((identity) => shared.has(identity));
	const entryShared = entryOrder.filter((identity) => shared.has(identity));
	return mergedShared.every((identity, index) => entryShared[index] === identity);
}

/** Adds `plugins` to `merged`, keeping the relative order of both lists and instances of one identity together. */
function insertEntryPlugins(merged: EcoBuildPlugin[], plugins: readonly EcoBuildPlugin[]): void {
	let insertAt = 0;
	for (const plugin of plugins) {
		const existing = merged.indexOf(plugin);
		if (existing !== -1) {
			insertAt = existing + 1;
			continue;
		}
		const identity = pluginIdentity(plugin);
		const lastSameIdentity = merged.findLastIndex((candidate) => pluginIdentity(candidate) === identity);
		const position = lastSameIdentity === -1 ? insertAt : lastSameIdentity + 1;
		merged.splice(position, 0, plugin);
		insertAt = position + 1;
	}
}

/**
 * Scopes each merged plugin to the entries that declared it.
 *
 * @remarks
 * A plugin that every entry of the build declares applies to the whole build. Any other plugin gets an
 * `entryScope`, so the bridge applies it only to modules those entries reach and fails the build when a module
 * it changed is also reached by another entry.
 */
function scopeEntryPlugins(
	merged: readonly EcoBuildPlugin[],
	entries: ReadonlyArray<{ entryName: string; plugins: readonly EcoBuildPlugin[] }>,
): EcoBuildPlugin[] {
	const carriers = new Map<unknown, Set<string>>();
	for (const { entryName, plugins } of entries) {
		for (const plugin of plugins) {
			const identity = pluginIdentity(plugin);
			carriers.set(identity, (carriers.get(identity) ?? new Set<string>()).add(entryName));
		}
	}
	return merged.map((plugin) => {
		const scope = carriers.get(pluginIdentity(plugin)) ?? new Set<string>();
		return scope.size === entries.length ? plugin : { ...plugin, entryScope: [...scope].sort() };
	});
}

type BuildGroup = {
	entries: BuildEntry[];
	options: NonNullable<ScriptAsset['bundleOptions']>;
	plugins: EcoBuildPlugin[];
};

function groupBuildEntriesByOptions(
	entries: BuildEntry[],
): Array<{ entries: BuildEntry[]; options: NonNullable<ScriptAsset['bundleOptions']> }> {
	const groups: BuildGroup[] = [];
	for (const entry of entries) {
		const options = getEntryBuildOptions(entry);
		const plugins = options.plugins ?? [];
		const group = groups.find(
			(candidate) =>
				buildWideOptionsEqual(candidate.options, options) && pluginOrderCompatible(candidate.plugins, plugins),
		);
		if (group) {
			group.entries.push(entry);
			insertEntryPlugins(group.plugins, plugins);
		} else {
			const merged: EcoBuildPlugin[] = [];
			insertEntryPlugins(merged, plugins);
			groups.push({ entries: [entry], options, plugins: merged });
		}
	}
	return groups.map((group) => {
		const external = [...new Set(group.entries.flatMap((entry) => getEntryBuildOptions(entry).external ?? []))];
		const plugins = scopeEntryPlugins(
			group.plugins,
			group.entries.map((entry) => ({
				entryName: entry.entryName,
				plugins: getEntryBuildOptions(entry).plugins ?? [],
			})),
		);
		return {
			entries: group.entries,
			options: {
				...group.options,
				external: external.length > 0 ? external : undefined,
				plugins: plugins.length > 0 ? plugins : undefined,
			},
		};
	});
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
	const routes = entry.pageClientRoutes.get(identity) ?? new Set<string>();
	routes.add(routeKey);
	entry.pageClientRoutes.set(identity, routes);
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

function attachPageClientAsset(instance: GroupedGraphBuildPlanInstance, asset: ProcessedAsset): void {
	const prebuilt = instance.prebuiltPageClientBrowserAssets ?? { processedAssets: [], fallbackDependencies: [] };
	prebuilt.processedAssets.push(asset);
	instance.prebuiltPageClientBrowserAssets = prebuilt;
}

function attachEntryAssetToRoutes(
	entry: BuildEntry,
	dependency: AssetDefinition,
	asset: ProcessedAsset,
	routePlans: RouteBuildPlan[],
): void {
	const pageClientRoutes = entry.pageClientRoutes.get(dependencyAssociationKey(dependency));
	for (const routePlan of routePlans) {
		for (const { instance, routeKey } of routePlan.instances) {
			if (entry.dependencyRoutes.get(dependency)?.has(routeKey)) {
				instance.prebuiltGroupedAssets = [...(instance.prebuiltGroupedAssets ?? []), asset];
			}
			if (pageClientRoutes?.has(routeKey)) {
				attachPageClientAsset(instance, asset);
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
				fileSystem.realpath(script),
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
			splitting: true,
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
