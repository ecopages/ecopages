import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileSystem } from '@ecopages/file-system';
import type { PageParams } from '../types/public-types.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import {
	collectHtmlPageModuleScriptBuildInputs,
	getPrebuiltHtmlPageModuleScriptUrls,
} from '../html-pages/html-page-module-scripts.ts';
import type { GroupedGraphBuildPlan } from '../route-renderer/orchestration/page-browser-graph/grouped-graph-build-plan.ts';
import { createAppBrowserClientEntryKey } from './app-browser-client-build.ts';
import {
	createPageDependencyInstanceKey,
	createRouteGraphLookupKey,
} from '../route-renderer/orchestration/page-browser-graph/route-instance-key.ts';
import type { ProcessedAsset } from './asset-processing-service/assets.types.ts';

const APP_BROWSER_CLIENT_MANIFEST_FILENAME = 'browser-client-manifest.json';

type SerializedProcessedAsset = Omit<ProcessedAsset, 'filepath' | 'sourceFilepath' | 'bundledSourceFilepaths'> & {
	filepath?: string;
	sourceFilepath?: string;
	bundledSourceFilepaths?: string[];
};

/**
 * One route's persisted assets from the application-wide browser build.
 *
 * @remarks
 * The manifest still uses route-instance keys and HTML Page script data from Rendering; #556 tracks
 * moving those contracts behind the Build layer.
 */
export type AppBrowserClientManifestEntry = {
	integrationName: string;
	routeFile: string;
	params?: PageParams;
	skipStaticProps?: boolean;
	isRouteTemplate?: boolean;
	planKey: string;
	groupedDependencyKeys: string[];
	pageClientBuildEntryKeys: string[];
	groupedAssets: SerializedProcessedAsset[];
	pageClientAssets: {
		processedAssets: SerializedProcessedAsset[];
		islandRenderAssetsByFile: Array<[string, SerializedProcessedAsset[]]>;
		fallbackPageClientBuildEntryKeys: string[];
	};
};

export type AppBrowserClientManifest = {
	version: 1;
	entries: AppBrowserClientManifestEntry[];
	htmlPageModuleScriptUrls: Record<string, string>;
	htmlPageModuleScriptFingerprint: string;
	sourceFingerprints: Record<string, string>;
	browserOutputPaths: string[];
};

function getManifestPath(appConfig: EcoPagesAppConfig): string {
	return path.join(appConfig.absolutePaths.distDir, '.server', APP_BROWSER_CLIENT_MANIFEST_FILENAME);
}

function toProjectPath(rootDir: string, filePath: string): string {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

/** Rewrites the file path inside a client dependency key so it survives moving the project root. */
export function normalizeAppBrowserClientEntryKey(rootDir: string, key: string): string {
	try {
		const parsedKey: unknown = JSON.parse(key);
		if (!Array.isArray(parsedKey) || parsedKey.length !== 2 || typeof parsedKey[1] !== 'string') return key;
		const dependency: unknown = JSON.parse(parsedKey[1]);
		if (!isRecord(dependency) || typeof dependency.filepath !== 'string') return key;
		return JSON.stringify([
			parsedKey[0],
			JSON.stringify({ ...dependency, filepath: toProjectPath(rootDir, path.resolve(dependency.filepath)) }),
		]);
	} catch {
		return key;
	}
}

/** Creates a browser client key with a project-relative file path. */
export function createNormalizedAppBrowserClientEntryKey(
	rootDir: string,
	integrationName: string,
	dependency: Parameters<typeof createAppBrowserClientEntryKey>[1],
): string {
	return normalizeAppBrowserClientEntryKey(rootDir, createAppBrowserClientEntryKey(integrationName, dependency));
}

function serializeProcessedAsset(rootDir: string, asset: ProcessedAsset): SerializedProcessedAsset {
	return {
		...asset,
		filepath: asset.filepath ? toProjectPath(rootDir, asset.filepath) : undefined,
		sourceFilepath: asset.sourceFilepath ? toProjectPath(rootDir, asset.sourceFilepath) : undefined,
		bundledSourceFilepaths: asset.bundledSourceFilepaths?.map((filePath) => toProjectPath(rootDir, filePath)),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
	return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function isPageParams(value: unknown): value is PageParams {
	return (
		isRecord(value) &&
		Object.values(value).every(
			(item) =>
				typeof item === 'string' || (Array.isArray(item) && item.every((part) => typeof part === 'string')),
		)
	);
}

function isOptionalString(record: Record<string, unknown>, key: string): boolean {
	return record[key] === undefined || typeof record[key] === 'string';
}

function isOptionalStringArray(record: Record<string, unknown>, key: string): boolean {
	const value = record[key];
	return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
}

function isOptionalBoolean(record: Record<string, unknown>, key: string): boolean {
	return record[key] === undefined || typeof record[key] === 'boolean';
}

function isProcessedAsset(value: unknown): value is SerializedProcessedAsset {
	if (!isRecord(value) || (value.kind !== 'script' && value.kind !== 'stylesheet')) return false;
	return (
		isOptionalString(value, 'filepath') &&
		isOptionalString(value, 'sourceFilepath') &&
		isOptionalString(value, 'srcUrl') &&
		isOptionalString(value, 'content') &&
		(value.attributes === undefined || isStringRecord(value.attributes)) &&
		isOptionalStringArray(value, 'bundledSourceFilepaths')
	);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isProcessedAssetArray(value: unknown): value is SerializedProcessedAsset[] {
	return Array.isArray(value) && value.every(isProcessedAsset);
}

function isIslandRenderAssetEntries(value: unknown): value is Array<[string, SerializedProcessedAsset[]]> {
	return (
		Array.isArray(value) &&
		value.every(
			(entry) =>
				Array.isArray(entry) &&
				entry.length === 2 &&
				typeof entry[0] === 'string' &&
				isProcessedAssetArray(entry[1]),
		)
	);
}

function isManifestEntry(value: unknown): value is AppBrowserClientManifestEntry {
	if (!isRecord(value) || !isRecord(value.pageClientAssets)) return false;
	const pageClientAssets = value.pageClientAssets;
	return (
		typeof value.integrationName === 'string' &&
		typeof value.routeFile === 'string' &&
		(value.params === undefined || isPageParams(value.params)) &&
		isOptionalBoolean(value, 'skipStaticProps') &&
		isOptionalBoolean(value, 'isRouteTemplate') &&
		typeof value.planKey === 'string' &&
		isStringArray(value.groupedDependencyKeys) &&
		isStringArray(value.pageClientBuildEntryKeys) &&
		isProcessedAssetArray(value.groupedAssets) &&
		isProcessedAssetArray(pageClientAssets.processedAssets) &&
		isStringArray(pageClientAssets.fallbackPageClientBuildEntryKeys) &&
		isIslandRenderAssetEntries(pageClientAssets.islandRenderAssetsByFile)
	);
}

function isManifest(value: unknown): value is AppBrowserClientManifest {
	return (
		isRecord(value) &&
		value.version === 1 &&
		Array.isArray(value.entries) &&
		value.entries.every(isManifestEntry) &&
		isStringRecord(value.htmlPageModuleScriptUrls) &&
		typeof value.htmlPageModuleScriptFingerprint === 'string' &&
		isStringRecord(value.sourceFingerprints) &&
		isStringArray(value.browserOutputPaths)
	);
}

function serializeEntry(
	rootDir: string,
	plan: GroupedGraphBuildPlan,
	instance: GroupedGraphBuildPlan['instances'][number],
	params: PageParams | undefined,
): AppBrowserClientManifestEntry {
	const pageClientAssets = instance.prebuiltPageClientBrowserAssets;
	const pageClientBuildEntryKeys = (instance.pageClientBuildEntries ?? [])
		.map((entry) => createNormalizedAppBrowserClientEntryKey(rootDir, entry.integrationName, entry.dependency))
		.sort();
	const fallbackPageClientBuildEntryKeys = (pageClientAssets?.fallbackDependencies ?? []).map((fallback) =>
		createNormalizedAppBrowserClientEntryKey(rootDir, fallback.integrationName, fallback.dependency),
	);
	for (const fallbackKey of fallbackPageClientBuildEntryKeys) {
		if (!pageClientBuildEntryKeys.includes(fallbackKey)) {
			throw new Error(
				`Could not record a fallback client entry for ${instance.routeFile} in the app browser build manifest.`,
			);
		}
	}
	return {
		integrationName: plan.integrationName,
		routeFile: toProjectPath(rootDir, instance.routeFile),
		params,
		skipStaticProps: instance.skipStaticProps,
		isRouteTemplate: instance.isRouteTemplate,
		planKey: plan.planKey,
		groupedDependencyKeys: [
			...new Set(
				(instance.contribution?.dependencies ?? []).map((dependency) =>
					createNormalizedAppBrowserClientEntryKey(rootDir, plan.integrationName, dependency),
				),
			),
		].sort(),
		pageClientBuildEntryKeys,
		groupedAssets: (instance.prebuiltGroupedAssets ?? []).map((asset) => serializeProcessedAsset(rootDir, asset)),
		pageClientAssets: {
			processedAssets: (pageClientAssets?.processedAssets ?? []).map((asset) =>
				serializeProcessedAsset(rootDir, asset),
			),
			islandRenderAssetsByFile: [...(pageClientAssets?.islandRenderAssetsByFile ?? [])].map(
				([filePath, assets]) => [
					toProjectPath(rootDir, filePath),
					assets.map((asset) => serializeProcessedAsset(rootDir, asset)),
				],
			),
			fallbackPageClientBuildEntryKeys,
		},
	};
}

function addDependencySourceFilepaths(
	filepaths: Set<string>,
	dependency: { source?: string; filepath?: string; bundledSourceFilepaths?: string[] },
): void {
	if (dependency.source === 'file' && dependency.filepath) filepaths.add(path.resolve(dependency.filepath));
	for (const filepath of dependency.bundledSourceFilepaths ?? []) filepaths.add(path.resolve(filepath));
}

function addAssetSourceFilepaths(filepaths: Set<string>, asset: ProcessedAsset): void {
	if (asset.sourceFilepath) filepaths.add(path.resolve(asset.sourceFilepath));
	for (const filepath of asset.bundledSourceFilepaths ?? []) filepaths.add(path.resolve(filepath));
}

function collectInstanceSourceFilepaths(
	filepaths: Set<string>,
	instance: GroupedGraphBuildPlan['instances'][number],
): void {
	for (const dependency of instance.contribution?.dependencies ?? [])
		addDependencySourceFilepaths(filepaths, dependency);
	for (const clientEntry of instance.pageClientBuildEntries ?? []) {
		addDependencySourceFilepaths(filepaths, clientEntry.dependency);
	}
	for (const asset of instance.prebuiltGroupedAssets ?? []) addAssetSourceFilepaths(filepaths, asset);
	for (const asset of instance.prebuiltPageClientBrowserAssets?.processedAssets ?? []) {
		addAssetSourceFilepaths(filepaths, asset);
	}
	for (const assets of instance.prebuiltPageClientBrowserAssets?.islandRenderAssetsByFile.values() ?? []) {
		for (const asset of assets) addAssetSourceFilepaths(filepaths, asset);
	}
}

function collectSourceFilepaths(plans: readonly GroupedGraphBuildPlan[]): Set<string> {
	const filepaths = new Set<string>();
	for (const plan of plans) {
		for (const instance of plan.instances) collectInstanceSourceFilepaths(filepaths, instance);
	}
	return filepaths;
}

function addAssetOutputFilepaths(filepaths: Set<string>, assets: readonly ProcessedAsset[] = []): void {
	for (const asset of assets) {
		if (asset.filepath) filepaths.add(path.resolve(asset.filepath));
	}
}

function collectInstanceOutputFilepaths(
	filepaths: Set<string>,
	instance: GroupedGraphBuildPlan['instances'][number],
): void {
	addAssetOutputFilepaths(filepaths, instance.prebuiltGroupedAssets);
	addAssetOutputFilepaths(filepaths, instance.prebuiltPageClientBrowserAssets?.processedAssets);
	for (const assets of instance.prebuiltPageClientBrowserAssets?.islandRenderAssetsByFile.values() ?? []) {
		addAssetOutputFilepaths(filepaths, assets);
	}
}

function addHtmlScriptOutputFilepaths(
	filepaths: Set<string>,
	distDir: string,
	htmlPageModuleScriptUrls: Readonly<Record<string, string>>,
): void {
	for (const url of Object.values(htmlPageModuleScriptUrls)) {
		const relativePath = url.replace(/^\/+/, '').split(/[?#]/, 1)[0];
		if (relativePath) filepaths.add(path.resolve(distDir, relativePath));
	}
}

function collectOutputFilepaths(
	appConfig: EcoPagesAppConfig,
	plans: readonly GroupedGraphBuildPlan[],
	htmlPageModuleScriptUrls: Readonly<Record<string, string>>,
	browserOutputPaths: readonly string[],
): Set<string> {
	const filepaths = new Set(browserOutputPaths.map((filepath) => path.resolve(filepath)));
	for (const plan of plans) {
		for (const instance of plan.instances) collectInstanceOutputFilepaths(filepaths, instance);
	}
	addHtmlScriptOutputFilepaths(filepaths, appConfig.absolutePaths.distDir, htmlPageModuleScriptUrls);
	return filepaths;
}

function fingerprintSources(rootDir: string, filepaths: Iterable<string>): Record<string, string> {
	return Object.fromEntries(
		[...new Set(filepaths)]
			.filter((filepath) => fileSystem.exists(filepath))
			.sort()
			.map((filepath) => [
				toProjectPath(rootDir, filepath),
				createHash('sha256').update(fileSystem.readFileSync(filepath)).digest('hex'),
			]),
	);
}

/** Persists the browser outputs built for production routes so `ecopages start` can reuse them. */
export async function writeAppBrowserClientManifest(
	appConfig: EcoPagesAppConfig,
	plans: readonly GroupedGraphBuildPlan[],
	routeInstances: readonly {
		routeFile: string;
		params?: PageParams;
		skipStaticProps?: boolean;
		isRouteTemplate?: boolean;
	}[],
	browserBuild: { sourceFiles: readonly string[]; outputPaths: readonly string[] },
): Promise<void> {
	const paramsByRouteKey = new Map(
		routeInstances.map((instance) => [
			JSON.stringify([
				createRouteGraphLookupKey(
					instance.routeFile,
					createPageDependencyInstanceKey({ params: instance.params }),
				),
				instance.skipStaticProps ?? false,
				instance.isRouteTemplate ?? false,
			]),
			instance.params,
		]),
	);
	const entries = plans.flatMap((plan) =>
		plan.instances.map((instance) => {
			const routeKey = JSON.stringify([
				createRouteGraphLookupKey(instance.routeFile, instance.dependencyInstanceKey),
				instance.skipStaticProps ?? false,
				instance.isRouteTemplate ?? false,
			]);
			if (!paramsByRouteKey.has(routeKey)) {
				throw new Error(`Missing route params for app browser client entry ${instance.routeFile}`);
			}
			return serializeEntry(appConfig.rootDir, plan, instance, paramsByRouteKey.get(routeKey));
		}),
	);
	const htmlPageModuleScriptUrls = Object.fromEntries(
		[...(await getPrebuiltHtmlPageModuleScriptUrls(appConfig))].map(([filePath, url]) => [
			toProjectPath(appConfig.rootDir, filePath),
			url,
		]),
	);
	const htmlBuildInputs = collectHtmlPageModuleScriptBuildInputs(appConfig);
	const sourceFilepaths = collectSourceFilepaths(plans);
	for (const filepath of [...htmlBuildInputs.htmlFiles, ...htmlBuildInputs.files]) {
		sourceFilepaths.add(path.resolve(filepath));
	}
	for (const filepath of browserBuild.sourceFiles) {
		sourceFilepaths.add(path.resolve(filepath));
	}
	const manifest: AppBrowserClientManifest = {
		version: 1,
		entries,
		htmlPageModuleScriptUrls,
		htmlPageModuleScriptFingerprint: htmlBuildInputs.fingerprint,
		sourceFingerprints: fingerprintSources(appConfig.rootDir, sourceFilepaths),
		browserOutputPaths: [
			...collectOutputFilepaths(appConfig, plans, htmlPageModuleScriptUrls, browserBuild.outputPaths),
		]
			.map((filepath) => toProjectPath(appConfig.rootDir, filepath))
			.sort(),
	};
	const manifestPath = getManifestPath(appConfig);
	fileSystem.ensureDir(path.dirname(manifestPath));
	fileSystem.write(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`);
}

export function clearAppBrowserClientManifest(appConfig: EcoPagesAppConfig): void {
	fileSystem.remove(getManifestPath(appConfig));
}

/** Reads the deployable browser build outputs written by `ecopages build`. */
export function readAppBrowserClientManifest(appConfig: EcoPagesAppConfig): AppBrowserClientManifest | undefined {
	const manifestPath = getManifestPath(appConfig);
	if (!fileSystem.exists(manifestPath)) return undefined;
	try {
		const parsed: unknown = JSON.parse(fileSystem.readFileSync(manifestPath).toString());
		if (!isManifest(parsed)) throw new Error('unsupported manifest shape');
		return parsed;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Could not read ${path.relative(appConfig.rootDir, manifestPath)} (${detail}). Run \`ecopages build\` again.`,
			{ cause: error },
		);
	}
}

/** Ensures every HTML module-script URL in the manifest points to a file in dist. */
export function assertAppBrowserClientManifestHtmlOutputsExist(
	appConfig: EcoPagesAppConfig,
	htmlPageModuleScriptUrls: Readonly<Record<string, string>>,
): void {
	for (const [sourcePath, url] of Object.entries(htmlPageModuleScriptUrls)) {
		const outputPath = path.resolve(
			appConfig.absolutePaths.distDir,
			url.replace(/^\/+/, '').split(/[?#]/, 1)[0] ?? '',
		);
		const relativeOutputPath = path.relative(appConfig.absolutePaths.distDir, outputPath);
		if (relativeOutputPath.startsWith('..') || relativeOutputPath === '' || !fileSystem.exists(outputPath)) {
			throw new Error(
				`The app browser build manifest references missing HTML module-script output for ${sourcePath}. Run \`ecopages build\` again.`,
			);
		}
	}
}

/** Ensures every browser output emitted by the app build still exists under dist. */
export function assertAppBrowserClientOutputsExist(
	appConfig: EcoPagesAppConfig,
	relativeOutputPaths: readonly string[],
): void {
	for (const relativeOutputPath of relativeOutputPaths) {
		const outputPath = path.resolve(appConfig.rootDir, relativeOutputPath);
		const relativeDistPath = path.relative(appConfig.absolutePaths.distDir, outputPath);
		if (path.isAbsolute(relativeDistPath) || relativeDistPath.startsWith('..') || !fileSystem.exists(outputPath)) {
			throw new Error(
				`The app browser build manifest references missing output ${relativeOutputPath}. Run \`ecopages build\` again.`,
			);
		}
	}
}

/** Resolves the project-relative asset paths in a build manifest for the current runtime. */
export function restoreAppBrowserClientAssets(
	appConfig: EcoPagesAppConfig,
	assets: readonly SerializedProcessedAsset[],
): ProcessedAsset[] {
	return assets.map((asset) => {
		const filepath = asset.filepath ? path.resolve(appConfig.rootDir, asset.filepath) : undefined;
		if (filepath && !fileSystem.exists(filepath)) {
			throw new Error(
				`The app browser build manifest references missing output ${path.relative(appConfig.rootDir, filepath)}. Run \`ecopages build\` again.`,
			);
		}
		return {
			...asset,
			filepath,
			sourceFilepath: asset.sourceFilepath ? path.resolve(appConfig.rootDir, asset.sourceFilepath) : undefined,
			bundledSourceFilepaths: asset.bundledSourceFilepaths?.map((filePath) =>
				path.resolve(appConfig.rootDir, filePath),
			),
		};
	});
}

/** Ensures the source files used by the browser build have not changed since export. */
export function assertAppBrowserClientSourcesMatch(
	appConfig: EcoPagesAppConfig,
	sourceFingerprints: Readonly<Record<string, string>>,
): void {
	for (const [relativePath, expectedFingerprint] of Object.entries(sourceFingerprints)) {
		const filepath = path.resolve(appConfig.rootDir, relativePath);
		if (
			!fileSystem.exists(filepath) ||
			createHash('sha256').update(fileSystem.readFileSync(filepath)).digest('hex') !== expectedFingerprint
		) {
			throw new Error(
				`The app browser build manifest is stale because ${relativePath} changed or is missing. Run \`ecopages build\` again.`,
			);
		}
	}
}

/** Resolves an app-relative file path stored in the build manifest. */
export function resolveAppBrowserClientManifestPath(appConfig: EcoPagesAppConfig, filePath: string): string {
	return path.resolve(appConfig.rootDir, filePath);
}
