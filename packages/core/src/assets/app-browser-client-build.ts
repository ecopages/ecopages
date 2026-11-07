import { randomUUID } from 'node:crypto';
import { contentHash } from '../utils/content-hash.ts';
import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import { getBuildEntryOutput, collectBuildEntryInputPaths } from '../build/build-graph.ts';
import type { BuildSuccess } from '../build/build-adapter.ts';
import { assertBuildSucceeded } from '../build/build-log.ts';
import { RESOLVED_ASSETS_DIR } from '../constants.ts';
import type { GroupedGraphBuildPlan } from '../route-renderer/orchestration/page-browser-graph/grouped-graph-build-plan.ts';
import {
	collectHtmlPageModuleScriptBuildInputs,
	setPrebuiltHtmlPageModuleScriptUrls,
} from '../html-pages/html-page-module-scripts.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import { requireAppRuntime } from '../utils/app-runtime.ts';
import { BrowserBundleService, type BrowserBundleGroupedEntry } from './browser-bundle.service.ts';
import { getAssetDependencyKey, getDeclaredDependencyKey } from './asset-processing-service/asset-dependency-keys.ts';
import type { AssetDefinition, ProcessedAsset, ScriptAsset } from './asset-processing-service/assets.types.ts';
import { isBundleableScript } from './asset-processing-service/bundleable-script.ts';

type BundledScript = Extract<AssetDefinition, { kind: 'script' }>;

type BuildEntry = {
	entryName: string;
	entrypoint: string;
	/** The first dependency that declared this entry, which supplies its build options; none for an HTML module script. */
	dependency?: BundledScript;
	/** Each dependency that declared this entry, by the dependency key rendering looks its output up with. */
	declarations: Map<string, AssetDefinition>;
	cleanup?: () => void;
};

function hash(value: string): string {
	return contentHash(value, 16);
}

function toPublicUrl(appConfig: EcoPagesAppConfig, filepath: string): string {
	return `/${path.relative(appConfig.absolutePaths.distDir, filepath)}`;
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

/**
 * The entries of one app-wide build, one per declared dependency key.
 *
 * @remarks
 * Each entry keeps the dependencies that declared it under their own dependency key, so the output is recorded
 * where rendering looks each declaration up, whether it was declared before or after the build prepared it.
 */
class BuildEntries {
	private readonly entriesByKey = new Map<string, BuildEntry>();
	private readonly appConfig: EcoPagesAppConfig;
	private readonly cleanupEntries: Array<() => void>;

	constructor(appConfig: EcoPagesAppConfig, cleanupEntries: Array<() => void>) {
		this.appConfig = appConfig;
		this.cleanupEntries = cleanupEntries;
	}

	get entries(): BuildEntry[] {
		return [...this.entriesByKey.values()];
	}

	/** Adds `dependency` to the build when it can be bundled, and records it as one of its entry's declarations. */
	add(dependency: AssetDefinition): void {
		if (dependency.kind !== 'script' || !isBundleableScript(dependency)) return;
		const key = getDeclaredDependencyKey(dependency, this.appConfig.rootDir);
		let entry = this.entriesByKey.get(key);
		if (!entry) {
			const entrypoint = createBundleEntryPath(this.appConfig, dependency);
			entry = {
				entryName: `client-${hash(key)}`,
				entrypoint: entrypoint.entrypoint,
				dependency,
				declarations: new Map(),
				...(entrypoint.cleanup ? { cleanup: entrypoint.cleanup } : {}),
			};
			this.entriesByKey.set(key, entry);
			if (entrypoint.cleanup) this.cleanupEntries.push(entrypoint.cleanup);
		}
		entry.declarations.set(getAssetDependencyKey(dependency, this.appConfig.rootDir), dependency);
	}
}

/** The emitted form of one declaration, as asset processing would return it for that declaration. */
function createProcessedAsset(
	appConfig: EcoPagesAppConfig,
	declaration: AssetDefinition,
	filepath: string,
	entrypoint: string,
	inputPaths: string[],
): ProcessedAsset {
	const bundledSourceFilepaths = [
		...new Set([
			...(declaration.bundledSourceFilepaths ?? []),
			...inputPaths.filter((inputPath) => path.resolve(inputPath) !== path.resolve(entrypoint)),
		]),
	];
	return {
		filepath,
		sourceFilepath: declaration.source === 'file' ? declaration.filepath : undefined,
		srcUrl: toPublicUrl(appConfig, filepath),
		kind: 'script',
		position: declaration.position,
		attributes: declaration.attributes,
		inline: false,
		excludeFromHtml: declaration.kind === 'script' ? declaration.excludeFromHtml : undefined,
		packageRole: declaration.packageRole,
		groupedBundle: declaration.kind === 'script' ? declaration.groupedBundle : undefined,
		...(bundledSourceFilepaths.length > 0 ? { bundledSourceFilepaths } : {}),
	};
}

function getEntryBuildOptions(entry: BuildEntry): NonNullable<ScriptAsset['bundleOptions']> {
	return entry.dependency?.bundleOptions ?? {};
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
 * Only options that apply to the whole build keep entries apart. Plugins and external modules do not: a module
 * has one URL and so one compiled form, so every plugin of the build applies to every module and decides by the
 * module itself whether it handles it, and an external module stays external for the whole build. Splitting is
 * always on in the app-wide build.
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

type BuildGroup = {
	entries: BuildEntry[];
	options: NonNullable<ScriptAsset['bundleOptions']>;
};

function groupBuildEntriesByOptions(entries: BuildEntry[]): BuildGroup[] {
	const groups: BuildGroup[] = [];
	for (const entry of entries) {
		const options = getEntryBuildOptions(entry);
		const group = groups.find((candidate) => buildWideOptionsEqual(candidate.options, options));
		if (group) {
			group.entries.push(entry);
		} else {
			groups.push({ entries: [entry], options });
		}
	}
	return groups.map((group) => {
		const entryOptions = group.entries.map(getEntryBuildOptions);
		const external = [...new Set(entryOptions.flatMap((options) => options.external ?? []))];
		const plugins = [...new Set(entryOptions.flatMap((options) => options.plugins ?? []))];
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

/**
 * Adds one plan's scripts to the build.
 *
 * @remarks
 * Planning prepared each script as asset processing prepares it, so it is recorded under the key rendering looks
 * it up with. Island and lazy entries are recorded under the key they were declared with.
 */
function addPlanEntries(plan: GroupedGraphBuildPlan, entries: BuildEntries): void {
	for (const script of plan.bundledScripts) {
		entries.add(script);
	}
	for (const { dependency } of plan.pageClientEntries) {
		entries.add(dependency);
	}
}

/** Records each entry's output under the key of every dependency that declared it. */
function recordBuiltEntries(appConfig: EcoPagesAppConfig, result: BuildSuccess, entries: BuildEntry[]): void {
	const ledger = requireAppRuntime(appConfig).processedAssets;
	for (const entry of entries) {
		const output = getBuildEntryOutput(result, entry.entryName, appConfig.rootDir);
		if (!output) throw new Error(`No build output generated for app browser client entry ${entry.entryName}`);
		const inputPaths = collectBuildEntryInputPaths(result, entry.entrypoint, appConfig.rootDir);
		for (const declaration of entry.declarations.values()) {
			ledger.record(
				declaration,
				createProcessedAsset(appConfig, declaration, output, entry.entrypoint, inputPaths),
			);
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
			urls.set(fileSystem.realpath(script), toPublicUrl(appConfig, output));
		}
	}
	return urls;
}

async function executeAppBrowserBuild(
	appConfig: EcoPagesAppConfig,
	buildEntries: BuildEntry[],
	htmlEntryNames: ReadonlyMap<string, string>,
): Promise<{ htmlScriptUrls: Map<string, string>; outputPaths: string[] }> {
	const htmlScriptUrls = new Map<string, string>();
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
		for (const { path: output } of result.outputs) {
			outputPaths.push(output);
			if (output.endsWith('.js') || output.endsWith('.css')) fileSystem.gzipFile(output);
		}
		recordBuiltEntries(
			appConfig,
			result,
			group.entries.filter((entry) => entry.declarations.size > 0),
		);
		const groupHtmlEntries = new Map(
			[...htmlEntryNames].filter(([, entryName]) => group.entries.some((entry) => entry.entryName === entryName)),
		);
		for (const [script, url] of collectHtmlScriptUrls(appConfig, result, groupHtmlEntries)) {
			htmlScriptUrls.set(script, url);
		}
	}

	return { htmlScriptUrls, outputPaths };
}

/**
 * Builds the production browser client once for the app.
 *
 * @remarks
 * Every script the plans declare and every HTML module script are entries of one build per set of build-wide
 * options, so a module they share is one chunk. Each entry's output is recorded in `AppRuntime.processedAssets`,
 * along with every emitted file; HTML module-script URLs go to the HTML Page state.
 */
export async function buildAppBrowserClient(
	appConfig: EcoPagesAppConfig,
	plans: readonly GroupedGraphBuildPlan[],
): Promise<void> {
	const cleanupEntries: Array<() => void> = [];
	try {
		const entries = new BuildEntries(appConfig, cleanupEntries);
		for (const plan of plans) addPlanEntries(plan, entries);
		const htmlInputs = collectHtmlPageModuleScriptBuildInputs(appConfig);
		const buildEntries = entries.entries;
		const htmlEntryNames = new Map<string, string>();
		for (const script of htmlInputs.scripts) {
			if (!fileSystem.exists(script)) continue;
			const entryName = `html-${hash(path.resolve(script))}`;
			htmlEntryNames.set(script, entryName);
			buildEntries.push({ entryName, entrypoint: script, declarations: new Map() });
		}

		const build =
			buildEntries.length > 0
				? await executeAppBrowserBuild(appConfig, buildEntries, htmlEntryNames)
				: { htmlScriptUrls: new Map<string, string>(), outputPaths: [] };
		requireAppRuntime(appConfig).processedAssets.recordBrowserOutputs(build.outputPaths);
		setPrebuiltHtmlPageModuleScriptUrls(appConfig, build.htmlScriptUrls);
	} finally {
		for (const cleanup of cleanupEntries) cleanup();
	}
}
