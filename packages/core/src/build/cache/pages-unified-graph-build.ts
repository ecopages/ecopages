/**
 * Unified production server-module graph.
 *
 * `ecopages build` emits every server entry into `dist/.server/` and writes
 * `server-modules.json`. `ecopages start` imports those modules and never compiles.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileSystem } from '@ecopages/file-system';
import { isEcopagesEnvDisabled } from '../../env.ts';
import { isProductionRuntime } from '../../utils/runtime.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import { appLogger } from '../../global/app-logger.ts';
import { findIntegrationForFile } from '../../plugins/find-integration-for-file.ts';
import { buildOrThrow } from '../runtime/build-queue.ts';
import { createServerBuildRequest } from '../runtime/build-request-policy.ts';
import { getBuildEntryOutput } from '../build-graph.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import type { ErrorPageLoaders, StaticRoute } from '../../types/contracts.ts';
import { contentHash } from '../../utils/content-hash.ts';
import { toRootRelativePath } from '../../utils/root-relative-path.ts';
import {
	type ProductionServerModulesManifest,
	loadProductionServerModules,
	writeProductionServerModulesManifest,
} from '../server/server-modules-manifest.ts';
import { getServerBundleOutputPaths } from '../server-bundle-deploy-manifest.ts';
import {
	collectServerModuleEntries,
	collectSsrScriptPaths,
	isRolldownServerModuleEntry,
	type ServerModuleEntryRouteSource,
} from './server-module-entries.ts';

/**
 * @deprecated In-memory graph shape kept for tests that still inspect outputs.
 */
export interface PagesUnifiedGraphCacheManifest {
	buildKey: string;
	outputs: Record<string, string>;
	outputImports: string[];
	dependencyHashes: Record<string, string>;
	importable?: boolean;
}

/**
 * True when the unified graph should build or serve prebuilt page modules.
 *
 * @remarks
 * Enabled by default in production builds. `ECOPAGES_UNIFIED_PAGES_GRAPH=false` or `0` opts out, which the
 * bench parity suite uses as its per-page build oracle. Production `ecopages start` still requires
 * the emitted server-modules map from a build that did emit.
 */
export function shouldBuildPagesUnifiedGraph(): boolean {
	return !isEcopagesEnvDisabled('ECOPAGES_UNIFIED_PAGES_GRAPH') && isProductionRuntime();
}

/**
 * @remarks
 * Pages of an Integration that compiles its own modules (`compilePageModule`), such as
 * HTML Pages, are not bundled, so they stay out of the Rolldown graph.
 */
export function isPagesUnifiedGraphPage(filePath: string, appConfig: EcoPagesAppConfig): boolean {
	const owner = findIntegrationForFile(appConfig.integrations, path.normalize(filePath));
	return owner !== undefined && !owner.compilePageModule;
}

/**
 * Readable output stem unique for every source path.
 *
 * @remarks
 * Sanitizing `src/pages/foo-bar` and `src/pages/foo/bar` would otherwise yield
 * the same stem and overwrite one emitted module with the other.
 */
function createSafeGraphEntryKey(entryPath: string, rootDir: string): string {
	const sourceKey = toRootRelativePath(rootDir, entryPath);
	const relativePath = sourceKey.replace(/\.[^.]+$/u, '');
	const readable = relativePath.replace(/[^a-zA-Z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
	return `${readable.length > 0 ? readable : 'page'}-${contentHash(sourceKey, 8)}`;
}

function uniqueEntryPaths(entryPaths: readonly string[]): string[] {
	return [...new Set(entryPaths.map((entryPath) => path.resolve(entryPath)))];
}

function emittedFilesExist(manifest: ProductionServerModulesManifest, sourceKeys: readonly string[]): boolean {
	return sourceKeys.every((sourceKey) => {
		const relativePath = manifest.modules[sourceKey];
		return relativePath ? fileSystem.exists(path.join(manifest.outdir, relativePath)) : false;
	});
}

function canReuseEmittedModules(
	manifest: ProductionServerModulesManifest | null,
	outdir: string,
	sourceKeys: readonly string[],
): manifest is ProductionServerModulesManifest {
	if (!manifest || path.resolve(manifest.outdir) !== path.resolve(outdir)) {
		return false;
	}
	return sourceKeys.every((sourceKey) => sourceKey in manifest.modules) && emittedFilesExist(manifest, sourceKeys);
}

async function emitCompiledPageModule(
	appConfig: EcoPagesAppConfig,
	filePath: string,
	outdir: string,
): Promise<{ sourceKey: string; relativePath: string; outputPath: string }> {
	const owner = findIntegrationForFile(appConfig.integrations, path.normalize(filePath));
	if (!owner?.compilePageModule) {
		throw new Error(`No compilePageModule implementation for ${filePath}`);
	}
	if (!owner.serializeCompiledPageModule) {
		throw new Error(`No serializeCompiledPageModule implementation for ${filePath}`);
	}

	const compiled = await owner.compilePageModule(filePath, appConfig);
	const { contents } = owner.serializeCompiledPageModule(compiled, { rootDir: appConfig.rootDir, filePath });

	const sourceKey = toRootRelativePath(appConfig.rootDir, filePath);
	const relativePath = `${createSafeGraphEntryKey(filePath, appConfig.rootDir)}-html.json`;
	const outputPath = path.join(outdir, relativePath);
	fileSystem.ensureDir(outdir);
	fileSystem.write(outputPath, contents);
	return { sourceKey, relativePath, outputPath };
}

function reviveCompiledPageModuleFromDisk(appConfig: EcoPagesAppConfig, filePath: string, outputPath: string): unknown {
	const owner = findIntegrationForFile(appConfig.integrations, path.normalize(filePath));
	if (!owner?.reviveCompiledPageModule) {
		throw new Error(`No reviveCompiledPageModule implementation for ${filePath}`);
	}
	return owner.reviveCompiledPageModule(fileSystem.readFileSync(outputPath).toString(), {
		rootDir: appConfig.rootDir,
		filePath,
	});
}

export async function importEmittedServerModule<T>(
	appConfig: EcoPagesAppConfig,
	filePath: string,
	outputPath: string,
): Promise<T> {
	const owner = findIntegrationForFile(appConfig.integrations, path.normalize(filePath));
	if (owner?.reviveCompiledPageModule) {
		return reviveCompiledPageModuleFromDisk(appConfig, filePath, outputPath) as T;
	}
	return (await import(/* @vite-ignore */ pathToFileURL(outputPath).href)) as T;
}

async function emitRolldownServerModules(
	appConfig: EcoPagesAppConfig,
	entryPaths: readonly string[],
	outdir: string,
): Promise<Record<string, string>> {
	if (entryPaths.length === 0) {
		return {};
	}

	const entryRecord: Record<string, string> = {};
	for (const entryPath of entryPaths) {
		entryRecord[createSafeGraphEntryKey(entryPath, appConfig.rootDir)] = entryPath;
	}

	appLogger.debugTime('pagesUnifiedGraphBuild');
	const buildOptions = createServerBuildRequest(appConfig, {
		entrypoints: entryRecord,
		outdir,
		splitting: true,
		naming: '[name]-[hash].[ext]',
	});
	const buildResult = await buildOrThrow(appConfig, buildOptions, 'Pages unified graph build failed').finally(() =>
		appLogger.debugTimeEnd('pagesUnifiedGraphBuild'),
	);

	const modules: Record<string, string> = {};
	for (const entryPath of entryPaths) {
		const compiledOutput = getBuildEntryOutput(buildResult, entryPath, appConfig.rootDir);
		if (!compiledOutput) {
			throw new Error(`Pages unified graph build produced no output for ${entryPath}`);
		}
		modules[toRootRelativePath(appConfig.rootDir, entryPath)] = path
			.relative(outdir, compiledOutput)
			.split(path.sep)
			.join('/');
	}
	return modules;
}

async function importEmittedModules(
	manifest: ProductionServerModulesManifest,
	sourceKeys: readonly string[],
): Promise<unknown[]> {
	const modules: unknown[] = [];
	for (const sourceKey of sourceKeys) {
		const relativePath = manifest.modules[sourceKey];
		if (!relativePath) {
			continue;
		}
		modules.push(await import(/* @vite-ignore */ pathToFileURL(path.join(manifest.outdir, relativePath)).href));
	}
	return modules;
}

function assignProductionServerModules(appConfig: EcoPagesAppConfig, manifest: ProductionServerModulesManifest): void {
	const runtime = requireAppRuntime(appConfig);
	runtime.productionServerModules = manifest;
	runtime.pagesUnifiedGraphManifest = null;
}

function storeProductionServerModules(appConfig: EcoPagesAppConfig, manifest: ProductionServerModulesManifest): void {
	assignProductionServerModules(appConfig, manifest);
	writeProductionServerModulesManifest(manifest);
}

/**
 * Emits every production server entry into `outdir` and writes `server-modules.json`.
 */
export async function emitProductionServerModules(options: {
	appConfig: EcoPagesAppConfig;
	router: ServerModuleEntryRouteSource;
	staticRoutes?: readonly StaticRoute[];
	errorPageLoaders?: ErrorPageLoaders;
	outdir?: string;
}): Promise<ProductionServerModulesManifest> {
	const appConfig = options.appConfig;
	requireAppRuntime(appConfig);
	const outdir = path.resolve(options.outdir ?? getServerBundleOutputPaths(appConfig).serverOutdir);
	fileSystem.ensureDir(outdir);

	const collected = await collectServerModuleEntries({
		appConfig,
		router: options.router,
		staticRoutes: options.staticRoutes,
		errorPageLoaders: options.errorPageLoaders,
	});

	let rolldownEntries = collected.filter((entryPath) => isRolldownServerModuleEntry(entryPath, appConfig));
	const htmlEntries = collected.filter((entryPath) => !isRolldownServerModuleEntry(entryPath, appConfig));

	const modules: Record<string, string> = {};
	Object.assign(modules, await emitRolldownServerModules(appConfig, uniqueEntryPaths(rolldownEntries), outdir));

	for (const htmlEntry of uniqueEntryPaths(htmlEntries)) {
		const emitted = await emitCompiledPageModule(appConfig, htmlEntry, outdir);
		modules[emitted.sourceKey] = emitted.relativePath;
	}

	let manifest: ProductionServerModulesManifest = { outdir, modules };
	assignProductionServerModules(appConfig, manifest);

	const discoveredScripts = collectSsrScriptPaths(
		await importEmittedModules(
			manifest,
			rolldownEntries.map((entryPath) => toRootRelativePath(appConfig.rootDir, entryPath)),
		),
	).filter(
		(scriptPath) =>
			fileSystem.exists(scriptPath) && !(toRootRelativePath(appConfig.rootDir, scriptPath) in modules),
	);

	if (discoveredScripts.length > 0) {
		rolldownEntries = uniqueEntryPaths([...rolldownEntries, ...discoveredScripts]);
		Object.assign(modules, await emitRolldownServerModules(appConfig, rolldownEntries, outdir));
		manifest = { outdir, modules };
		assignProductionServerModules(appConfig, manifest);
	}

	writeProductionServerModulesManifest(manifest);

	appLogger.debug(`Emitted ${Object.keys(modules).length} production server modules`);
	return manifest;
}

/**
 * Builds eligible server entries in one Rolldown invocation and records outputs.
 *
 * @remarks
 * Production emit writes `dist/.server/server-modules.json`. HTML Pages compile
 * through `compilePageModule` and join the same map.
 */
export async function ensurePagesUnifiedGraphBuilt(options: {
	appConfig: EcoPagesAppConfig;
	entryPaths: readonly string[];
	outdir: string;
	force?: boolean;
}): Promise<PagesUnifiedGraphCacheManifest | undefined> {
	requireAppRuntime(options.appConfig);
	if (!shouldBuildPagesUnifiedGraph()) {
		return undefined;
	}

	const eligibleEntryPaths = uniqueEntryPaths(options.entryPaths);
	if (eligibleEntryPaths.length === 0) {
		return undefined;
	}

	const outdir = path.resolve(options.outdir);
	const runtime = requireAppRuntime(options.appConfig);
	const sourceKeys = eligibleEntryPaths.map((entryPath) => toRootRelativePath(options.appConfig.rootDir, entryPath));
	if (!options.force && canReuseEmittedModules(runtime.productionServerModules, outdir, sourceKeys)) {
		appLogger.debug('Reusing pages unified graph built in this process');
		return {
			buildKey: outdir,
			outputs: Object.fromEntries(
				eligibleEntryPaths.map((entryPath, index) => [
					entryPath,
					path.join(outdir, runtime.productionServerModules!.modules[sourceKeys[index]!]!),
				]),
			),
			outputImports: [],
			dependencyHashes: {},
		};
	}

	const rolldownEntries = eligibleEntryPaths.filter((entryPath) =>
		isRolldownServerModuleEntry(entryPath, options.appConfig),
	);
	const htmlEntries = eligibleEntryPaths.filter(
		(entryPath) => !isRolldownServerModuleEntry(entryPath, options.appConfig),
	);

	const modules: Record<string, string> = {
		...(await emitRolldownServerModules(options.appConfig, rolldownEntries, outdir)),
	};
	const outputs: Record<string, string> = {};
	for (const entryPath of rolldownEntries) {
		const sourceKey = toRootRelativePath(options.appConfig.rootDir, entryPath);
		const relativePath = modules[sourceKey];
		if (relativePath) {
			outputs[entryPath] = path.join(outdir, relativePath);
		}
	}

	for (const htmlEntry of htmlEntries) {
		const emitted = await emitCompiledPageModule(options.appConfig, htmlEntry, outdir);
		modules[emitted.sourceKey] = emitted.relativePath;
		outputs[htmlEntry] = emitted.outputPath;
	}

	storeProductionServerModules(options.appConfig, {
		outdir,
		modules: { ...runtime.productionServerModules?.modules, ...modules },
	});
	appLogger.debug(`Built pages unified graph for ${eligibleEntryPaths.length} entries`);

	return {
		buildKey: outdir,
		outputs,
		outputImports: Object.values(outputs),
		dependencyHashes: {},
	};
}

export async function importPagesUnifiedGraphModule<T>(
	appConfig: EcoPagesAppConfig,
	filePath: string,
): Promise<T | undefined> {
	const manifest = loadProductionServerModules(appConfig);
	if (!manifest) {
		return undefined;
	}

	const sourceKey = toRootRelativePath(appConfig.rootDir, filePath);
	const relativePath = manifest.modules[sourceKey];
	if (!relativePath) {
		return undefined;
	}
	const outputPath = path.join(manifest.outdir, relativePath);
	if (!fileSystem.exists(outputPath)) {
		return undefined;
	}

	return importEmittedServerModule<T>(appConfig, filePath, outputPath);
}
