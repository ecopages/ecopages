/**
 * Unified pages Rolldown graph (Phase A build + Phase C import).
 *
 * Enabled by default in production builds. Opt out with
 * `ECOPAGES_UNIFIED_PAGES_GRAPH=0`. Covers all static page template extensions
 * registered on the app config.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../../global/app-logger.ts';
import { build } from '../build-adapter.ts';
import { requireBuildRuntime } from '../runtime/build-runtime.ts';
import { createServerBuildRequest, resolveServerAppBuildPlugins } from '../runtime/build-request-policy.ts';
import { createBuildInputsFingerprint, hashAppConfigFile } from './build-input-fingerprint.ts';
import {
	isProductionCacheManifestCurrent,
	matchesProductionCacheBuildKey,
	matchesProductionCacheFingerprint,
	readProductionCacheManifest,
	writeProductionCacheManifest,
} from './production-build-cache.ts';
import { getCorePackageVersion } from './cache-keys.ts';
import { readLocalImports } from './output-imports.ts';
import { resolveInternalExecutionDir } from '../../utils/resolve-work-dir.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { BuildResult } from '../build-adapter.ts';
import {
	getServerModuleBuildCacheOutdir,
	getSharedRouteModuleBuildCache,
} from '../../services/module-loading/route-module-build-cache-registry.ts';
import { resolveRouteModuleDependencyPaths } from '../../services/module-loading/route-module-dependency-hasher.ts';

export const PAGES_UNIFIED_GRAPH_CACHE_DIR = '.server-pages-graph';
export const PAGES_UNIFIED_GRAPH_CACHE_FILENAME = '.build-cache.json';

export interface PagesUnifiedGraphCacheManifest {
	corePackageVersion: string;
	buildInputsFingerprint: string;
	buildKey: string;
	builtAt: number;
	outputs: Record<string, string>;
	/** Local files the outputs import; the graph is reused only while all of them exist. */
	outputImports: string[];
}

export function isPagesUnifiedGraphEnabled(): boolean {
	if (process.env.ECOPAGES_UNIFIED_PAGES_GRAPH === '0') {
		return false;
	}

	if (process.env.ECOPAGES_UNIFIED_PAGES_GRAPH === '1') {
		return true;
	}

	return process.env.NODE_ENV === 'production';
}

/** True when the unified graph should build or serve prebuilt page modules. */
export function shouldBuildPagesUnifiedGraph(): boolean {
	return isPagesUnifiedGraphEnabled() && process.env.NODE_ENV === 'production';
}

export function isPagesUnifiedGraphPage(filePath: string, appConfig: EcoPagesAppConfig): boolean {
	const normalizedPath = path.normalize(filePath);
	return appConfig.templatesExt.some((extension) => normalizedPath.endsWith(extension));
}

function getPagesUnifiedGraphCachePath(appConfig: EcoPagesAppConfig): string {
	return path.join(
		resolveInternalExecutionDir(appConfig),
		PAGES_UNIFIED_GRAPH_CACHE_DIR,
		PAGES_UNIFIED_GRAPH_CACHE_FILENAME,
	);
}

function createPagesUnifiedGraphBuildKey(appConfig: EcoPagesAppConfig, outdir: string): string {
	const pluginNames = resolveServerAppBuildPlugins(appConfig)
		.map((plugin) => plugin.name)
		.sort()
		.join('|');
	const templateExtensions = [...appConfig.templatesExt].sort().join('|');
	return [
		path.resolve(outdir),
		hashAppConfigFile(appConfig),
		templateExtensions,
		pluginNames,
		'es2022',
		'esm',
		'external-packages',
	].join('::');
}

function readPagesUnifiedGraphManifest(appConfig: EcoPagesAppConfig): PagesUnifiedGraphCacheManifest | undefined {
	const manifest = readProductionCacheManifest<PagesUnifiedGraphCacheManifest>(
		getPagesUnifiedGraphCachePath(appConfig),
	);
	if (!manifest?.outputs) {
		return undefined;
	}
	return manifest;
}

function writePagesUnifiedGraphManifest(appConfig: EcoPagesAppConfig, manifest: PagesUnifiedGraphCacheManifest): void {
	writeProductionCacheManifest(getPagesUnifiedGraphCachePath(appConfig), manifest);
}

function createSafeGraphEntryKey(entryPath: string, rootDir: string): string {
	const relativePath = path.relative(rootDir, entryPath).replace(/\.[^.]+$/u, '');
	const safeKey = relativePath.replace(/[^a-zA-Z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
	return safeKey.length > 0 ? safeKey : 'page';
}

/**
 * @remarks
 * Uses {@link BuildResult.entryOutputs} when present so resolution follows the
 * bundler's `facadeModuleId` instead of guessing from sanitized entry keys.
 * Basename prefix matching remains only as a fallback for backends that omit
 * `entryOutputs`; it can mis-associate keys such as `pages-blog` and
 * `pages-blog-index`.
 */
function resolveOutputForEntrypoint(entryPath: string, entryKey: string, buildResult: BuildResult): string | undefined {
	const exactOutput = buildResult.entryOutputs?.[path.resolve(entryPath)];
	if (exactOutput) {
		return exactOutput;
	}

	for (const { path: outputPath } of buildResult.outputs) {
		const outputBaseName = path.basename(outputPath);
		if (outputBaseName.startsWith(`${entryKey}-`) && /\.(?:m?js)$/u.test(outputBaseName)) {
			return outputPath;
		}
		if (outputBaseName === `${entryKey}.js` || outputBaseName === `${entryKey}.mjs`) {
			return outputPath;
		}
	}

	return undefined;
}

/**
 * Whether `manifest` was written by the current core version, build inputs and graph
 * setup, and every file its outputs import still exists.
 */
function isGraphManifestCurrent(
	manifest: PagesUnifiedGraphCacheManifest,
	appConfig: EcoPagesAppConfig,
	outdir: string,
): boolean {
	return (
		isProductionCacheManifestCurrent(manifest, getCorePackageVersion()) &&
		matchesProductionCacheFingerprint(manifest, createBuildInputsFingerprint(appConfig)) &&
		matchesProductionCacheBuildKey(manifest, createPagesUnifiedGraphBuildKey(appConfig, outdir)) &&
		manifest.outputImports?.every((filePath) => fileSystem.exists(filePath)) === true
	);
}

function isManifestValidForEntries(
	manifest: PagesUnifiedGraphCacheManifest,
	appConfig: EcoPagesAppConfig,
	outdir: string,
	entryPaths: readonly string[],
): boolean {
	return (
		isGraphManifestCurrent(manifest, appConfig, outdir) &&
		entryPaths.every((entryPath) => {
			const outputPath = manifest.outputs[path.resolve(entryPath)];
			return outputPath ? fileSystem.exists(outputPath) : false;
		})
	);
}

const importableGraphs = new WeakMap<EcoPagesAppConfig, { builtAt: number; current: boolean }>();

/**
 * {@link isGraphManifestCurrent} for page imports, memoized per manifest write.
 *
 * @remarks
 * Page modules can be imported before the static site generator calls
 * {@link ensurePagesUnifiedGraphBuilt} (for example while collecting static
 * paths), so the import path must not trust a manifest left by an older build.
 */
function isGraphImportable(manifest: PagesUnifiedGraphCacheManifest, appConfig: EcoPagesAppConfig): boolean {
	const known = importableGraphs.get(appConfig);
	if (known?.builtAt === manifest.builtAt) return known.current;

	const current = isGraphManifestCurrent(manifest, appConfig, getServerModuleBuildCacheOutdir(appConfig));
	importableGraphs.set(appConfig, { builtAt: manifest.builtAt, current });
	return current;
}

/**
 * Builds eligible static pages in one Rolldown invocation and seeds route-module disk cache.
 */
export async function ensurePagesUnifiedGraphBuilt(options: {
	appConfig: EcoPagesAppConfig;
	entryPaths: readonly string[];
	outdir: string;
	force?: boolean;
}): Promise<PagesUnifiedGraphCacheManifest | undefined> {
	if (!shouldBuildPagesUnifiedGraph()) {
		return undefined;
	}

	const eligibleEntryPaths = options.entryPaths
		.map((entryPath) => path.resolve(entryPath))
		.filter((entryPath) => isPagesUnifiedGraphPage(entryPath, options.appConfig));

	if (eligibleEntryPaths.length === 0) {
		return undefined;
	}

	const outdir = path.resolve(options.outdir);
	const existingManifest = options.force ? undefined : readPagesUnifiedGraphManifest(options.appConfig);
	if (
		existingManifest &&
		isManifestValidForEntries(existingManifest, options.appConfig, outdir, eligibleEntryPaths)
	) {
		appLogger.debug('Reusing pages unified graph cache');
		return existingManifest;
	}

	const routeModuleBuildCache = getSharedRouteModuleBuildCache(outdir, options.appConfig);
	const entryRecord: Record<string, string> = {};
	const entryKeysByPath = new Map<string, string>();

	for (const entryPath of eligibleEntryPaths) {
		const entryKey = createSafeGraphEntryKey(entryPath, options.appConfig.rootDir);
		entryRecord[entryKey] = entryPath;
		entryKeysByPath.set(entryPath, entryKey);
	}

	appLogger.debugTime('pagesUnifiedGraphBuild');
	const buildOptions = createServerBuildRequest(options.appConfig, {
		profile: 'route-module',
		entrypoints: entryRecord,
		outdir,
		splitting: true,
		naming: '[name]-[hash].[ext]',
	});
	const plugins = buildOptions.plugins ?? [];
	const buildResult = await build(buildOptions, requireBuildRuntime(options.appConfig).getProfile('route-module'));
	appLogger.debugTimeEnd('pagesUnifiedGraphBuild');

	if (!buildResult.success) {
		const details = buildResult.logs.map((log) => log.message).join(' | ');
		throw new Error(`Pages unified graph build failed: ${details}`);
	}

	const outputs: Record<string, string> = {};
	const outputImports = new Set<string>();

	for (const entryPath of eligibleEntryPaths) {
		const fileHash = fileSystem.hash(entryPath);
		const entryKey = entryKeysByPath.get(entryPath);
		const compiledOutput = entryKey ? resolveOutputForEntrypoint(entryPath, entryKey, buildResult) : undefined;
		if (!compiledOutput) {
			throw new Error(`Pages unified graph build produced no output for ${entryPath}`);
		}

		outputs[entryPath] = compiledOutput;
		const compiledOutputImports = readLocalImports(compiledOutput);
		for (const importPath of compiledOutputImports) outputImports.add(importPath);

		routeModuleBuildCache.recordBuild({
			filePath: entryPath,
			rootDir: options.appConfig.rootDir,
			outdir,
			fileHash,
			outputPath: compiledOutput,
			dependencyModulePaths: resolveRouteModuleDependencyPaths(buildResult, entryPath, options.appConfig.rootDir),
			externalPackages: true,
			plugins,
			outputImports: compiledOutputImports,
		});
	}

	const manifest: PagesUnifiedGraphCacheManifest = {
		corePackageVersion: getCorePackageVersion(),
		buildInputsFingerprint: createBuildInputsFingerprint(options.appConfig),
		buildKey: createPagesUnifiedGraphBuildKey(options.appConfig, outdir),
		builtAt: Date.now(),
		outputs,
		outputImports: [...outputImports],
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
