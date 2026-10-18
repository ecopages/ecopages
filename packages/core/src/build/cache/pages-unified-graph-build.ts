/**
 * Unified pages Rolldown graph (Phase A build + Phase C import).
 *
 * Enabled by default in production builds. Opt out with
 * `ECOPAGES_UNIFIED_PAGES_GRAPH=false` or `0`. Covers all static page template extensions
 * registered on the app config.
 */

import path from 'node:path';
import { isEcopagesEnvDisabled } from '../../env.ts';
import { isProductionRuntime } from '../../utils/runtime.ts';
import { pathToFileURL } from 'node:url';
import { fileSystem } from '@ecopages/file-system';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import { appLogger } from '../../global/app-logger.ts';
import { findIntegrationForFile } from '../../plugins/find-integration-for-file.ts';
import { buildOrThrow } from '../runtime/build-queue.ts';
import { createServerBuildRequest, resolveAppBuildPlugins } from '../runtime/build-request-policy.ts';
import { hashAppConfigFile } from './app-config-hash.ts';
import { collectBuildOutputImports, getBuildEntryOutput } from '../build-graph.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import {
	getServerModuleBuildCacheOutdir,
	getSharedRouteModuleBuildCache,
} from '../server/route-module-build-cache-registry.ts';
import {
	RouteModuleDependencyHasher,
	resolveRouteModuleDependencyPaths,
	type RouteModuleDependencyHashes,
} from '../server/route-module-dependency-hasher.ts';

export interface PagesUnifiedGraphCacheManifest {
	buildKey: string;
	outputs: Record<string, string>;
	/**
	 * Local files reachable from the outputs through local imports, including
	 * shared chunks. The graph is reused only while all of them exist.
	 */
	outputImports: string[];
	/**
	 * Content hashes for every trackable source file in the graph.
	 *
	 * @remarks
	 * Compiled chunks can outlive a deleted layout or component. Reuse also
	 * requires these hashes so a source edit or deletion rebuilds the graph.
	 */
	dependencyHashes: RouteModuleDependencyHashes;
	/**
	 * Memoized result of {@link isGraphManifestCurrent} for page imports.
	 */
	importable?: boolean;
}

/**
 * True when the unified graph should build or serve prebuilt page modules.
 *
 * @remarks
 * Enabled by default in production builds. `ECOPAGES_UNIFIED_PAGES_GRAPH=false` or `0` opts out, which the
 * bench parity suite uses as its per-page build oracle.
 */
export function shouldBuildPagesUnifiedGraph(): boolean {
	return !isEcopagesEnvDisabled('ECOPAGES_UNIFIED_PAGES_GRAPH') && isProductionRuntime();
}

/**
 * @remarks
 * Pages of an Integration that compiles its own modules (`compilePageModule`), such as
 * HTML Pages, are not bundled, so they stay out of the graph.
 */
export function isPagesUnifiedGraphPage(filePath: string, appConfig: EcoPagesAppConfig): boolean {
	const owner = findIntegrationForFile(appConfig.integrations, path.normalize(filePath));
	return owner !== undefined && !owner.compilePageModule;
}

function createPagesUnifiedGraphBuildKey(appConfig: EcoPagesAppConfig, outdir: string): string {
	const pluginNames = resolveAppBuildPlugins(appConfig, 'server')
		.map((plugin) => plugin.name)
		.sort()
		.join('|');
	const templateExtensions = [...appConfig.templatesExt].sort().join('|');
	return [
		path.resolve(outdir),
		hashAppConfigFile(appConfig),
		templateExtensions,
		pluginNames,
		'node',
		'esm',
		'external-packages',
	].join('::');
}

function readPagesUnifiedGraphManifest(appConfig: EcoPagesAppConfig): PagesUnifiedGraphCacheManifest | undefined {
	return requireAppRuntime(appConfig).pagesUnifiedGraphManifest ?? undefined;
}

function sourceDependenciesAreCurrent(manifest: PagesUnifiedGraphCacheManifest): boolean {
	return new RouteModuleDependencyHasher().matchesStoredHashes(manifest.dependencyHashes);
}

function writePagesUnifiedGraphManifest(appConfig: EcoPagesAppConfig, manifest: PagesUnifiedGraphCacheManifest): void {
	requireAppRuntime(appConfig).pagesUnifiedGraphManifest = manifest;
}

function createSafeGraphEntryKey(entryPath: string, rootDir: string): string {
	const relativePath = path.relative(rootDir, entryPath).replace(/\.[^.]+$/u, '');
	const safeKey = relativePath.replace(/[^a-zA-Z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
	return safeKey.length > 0 ? safeKey : 'page';
}

/**
 * Whether `manifest` was built for this graph setup, every file its outputs import
 * still exists, and source hashes still match.
 */
function isGraphManifestCurrent(
	manifest: PagesUnifiedGraphCacheManifest,
	appConfig: EcoPagesAppConfig,
	outdir: string,
): boolean {
	return (
		manifest.buildKey === createPagesUnifiedGraphBuildKey(appConfig, outdir) &&
		manifest.outputImports.every((filePath) => fileSystem.exists(filePath)) &&
		sourceDependenciesAreCurrent(manifest)
	);
}

/**
 * @remarks
 * In addition to graph freshness and chunk existence on disk, the manifest must
 * match the exact count of active template entries so removing or adding a page
 * invalidates the graph.
 */
function isManifestValidForEntries(
	manifest: PagesUnifiedGraphCacheManifest,
	appConfig: EcoPagesAppConfig,
	outdir: string,
	entryPaths: readonly string[],
): boolean {
	return (
		isGraphManifestCurrent(manifest, appConfig, outdir) &&
		entryPaths.length === Object.keys(manifest.outputs).length &&
		entryPaths.every((entryPath) => {
			const outputPath = manifest.outputs[path.resolve(entryPath)];
			return outputPath ? fileSystem.exists(outputPath) : false;
		})
	);
}

/**
 * {@link isGraphManifestCurrent} for page imports, memoized per manifest.
 *
 * @remarks
 * Page modules can be imported before the static site generator calls
 * {@link ensurePagesUnifiedGraphBuilt} (for example while collecting static
 * paths), so the import path must not trust a graph this process has already
 * invalidated.
 */
function isGraphImportable(manifest: PagesUnifiedGraphCacheManifest, appConfig: EcoPagesAppConfig): boolean {
	if (manifest.importable !== undefined) return manifest.importable;

	const current = isGraphManifestCurrent(manifest, appConfig, getServerModuleBuildCacheOutdir(appConfig));
	manifest.importable = current;
	return current;
}

/**
 * Builds eligible static pages in one Rolldown invocation and records outputs for this process.
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

	const eligibleEntryPaths = Array.from(
		new Set(
			options.entryPaths
				.map((entryPath) => path.resolve(entryPath))
				.filter((entryPath) => isPagesUnifiedGraphPage(entryPath, options.appConfig)),
		),
	);

	if (eligibleEntryPaths.length === 0) {
		return undefined;
	}

	const outdir = path.resolve(options.outdir);
	const existingManifest = options.force ? undefined : readPagesUnifiedGraphManifest(options.appConfig);
	if (
		existingManifest &&
		isManifestValidForEntries(existingManifest, options.appConfig, outdir, eligibleEntryPaths)
	) {
		appLogger.debug('Reusing pages unified graph built in this process');
		return existingManifest;
	}

	const routeModuleBuildCache = getSharedRouteModuleBuildCache(outdir, options.appConfig);
	const entryRecord: Record<string, string> = {};

	for (const entryPath of eligibleEntryPaths) {
		const entryKey = createSafeGraphEntryKey(entryPath, options.appConfig.rootDir);
		entryRecord[entryKey] = entryPath;
	}

	appLogger.debugTime('pagesUnifiedGraphBuild');
	const buildOptions = createServerBuildRequest(options.appConfig, {
		entrypoints: entryRecord,
		outdir,
		splitting: true,
		naming: '[name]-[hash].[ext]',
	});
	const plugins = buildOptions.plugins ?? [];
	const buildResult = await buildOrThrow(options.appConfig, buildOptions, 'Pages unified graph build failed').finally(
		() => appLogger.debugTimeEnd('pagesUnifiedGraphBuild'),
	);

	const outputs: Record<string, string> = {};
	const outputImports = new Set<string>();
	const dependencyHasher = new RouteModuleDependencyHasher();
	const dependencyHashes: RouteModuleDependencyHashes = {};

	for (const entryPath of eligibleEntryPaths) {
		const fileHash = fileSystem.hash(entryPath);
		const compiledOutput = getBuildEntryOutput(buildResult, entryPath, options.appConfig.rootDir);
		if (!compiledOutput) {
			throw new Error(`Pages unified graph build produced no output for ${entryPath}`);
		}

		outputs[entryPath] = compiledOutput;
		const compiledOutputImports = collectBuildOutputImports(buildResult, compiledOutput);
		for (const importPath of compiledOutputImports) outputImports.add(importPath);

		const dependencyModulePaths = resolveRouteModuleDependencyPaths(
			buildResult,
			entryPath,
			options.appConfig.rootDir,
		);
		Object.assign(dependencyHashes, dependencyHasher.createDependencyHashes(dependencyModulePaths));
		dependencyHashes[path.normalize(entryPath)] = fileHash;

		routeModuleBuildCache.recordBuild({
			filePath: entryPath,
			rootDir: options.appConfig.rootDir,
			outdir,
			buildOptions,
			fileHash,
			outputPath: compiledOutput,
			dependencyModulePaths,
			externalPackages: true,
			plugins,
			outputImports: compiledOutputImports,
		});
	}

	const manifest: PagesUnifiedGraphCacheManifest = {
		buildKey: createPagesUnifiedGraphBuildKey(options.appConfig, outdir),
		outputs,
		outputImports: [...outputImports],
		dependencyHashes,
	};

	writePagesUnifiedGraphManifest(options.appConfig, manifest);
	appLogger.debug(`Built pages unified graph for ${eligibleEntryPaths.length} entries`);

	return manifest;
}

export async function importPagesUnifiedGraphModule<T>(
	appConfig: EcoPagesAppConfig,
	filePath: string,
): Promise<T | undefined> {
	const manifest = readPagesUnifiedGraphManifest(appConfig);
	if (!manifest || !isGraphImportable(manifest, appConfig)) {
		return undefined;
	}

	const resolvedFilePath = path.resolve(filePath);
	const outputPath = manifest.outputs[resolvedFilePath];
	if (!outputPath || !fileSystem.exists(outputPath)) {
		return undefined;
	}

	return (await import(/* @vite-ignore */ pathToFileURL(outputPath).href)) as T;
}
