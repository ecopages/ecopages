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
import { appLogger } from '../global/app-logger.ts';
import { build, getAppServerBuildPlugins } from './build-adapter.ts';
import { requireBuildRuntime } from './build-runtime.ts';
import { resolveBuildProfileOptions } from './build-profile-options.ts';
import { createBuildInputsFingerprint, hashAppConfigFile } from './build-input-fingerprint.ts';
import {
	isProductionCacheManifestCurrent,
	matchesProductionCacheBuildKey,
	matchesProductionCacheFingerprint,
	readProductionCacheManifest,
	writeProductionCacheManifest,
} from './production-build-cache.ts';
import { getCorePackageVersion } from '../services/module-loading/route-module-build-manifest.ts';
import { resolveInternalExecutionDir } from '../utils/resolve-work-dir.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { BuildResult } from './build-adapter.ts';
import { getSharedRouteModuleBuildCache } from '../services/module-loading/route-module-build-cache-registry.ts';
import { normalizeNodeRuntimeBuildOutputFile } from './runtime-build-output-normalizer.ts';
import { resolveRouteModuleDependencyPaths } from '../services/module-loading/route-module-dependency-hasher.ts';
import { getJsxOwnershipPlugins } from './jsx-ownership-plugins.ts';

export const PAGES_UNIFIED_GRAPH_CACHE_DIR = '.server-pages-graph';
export const PAGES_UNIFIED_GRAPH_CACHE_FILENAME = '.build-cache.json';

export interface PagesUnifiedGraphCacheManifest {
	invalidationVersion: string;
	buildInputsFingerprint: string;
	buildKey: string;
	builtAt: number;
	outputs: Record<string, string>;
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
	const plugins = appConfig.runtime?.buildManifest ? getAppServerBuildPlugins(appConfig) : [];
	const pluginNames = [...plugins, ...getJsxOwnershipPlugins(appConfig)]
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

function isManifestValidForEntries(
	manifest: PagesUnifiedGraphCacheManifest,
	appConfig: EcoPagesAppConfig,
	outdir: string,
	entryPaths: readonly string[],
): boolean {
	if (!isProductionCacheManifestCurrent(manifest, getCorePackageVersion())) {
		return false;
	}

	if (!matchesProductionCacheFingerprint(manifest, createBuildInputsFingerprint(appConfig))) {
		return false;
	}

	if (!matchesProductionCacheBuildKey(manifest, createPagesUnifiedGraphBuildKey(appConfig, outdir))) {
		return false;
	}

	return entryPaths.every((entryPath) => {
		const resolvedEntryPath = path.resolve(entryPath);
		const outputPath = manifest.outputs[resolvedEntryPath];
		return outputPath ? fileSystem.exists(outputPath) : false;
	});
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

	const plugins = options.appConfig.runtime?.buildManifest ? getAppServerBuildPlugins(options.appConfig) : [];
	const mergedPlugins = [...plugins, ...getJsxOwnershipPlugins(options.appConfig)];
	const routeModuleBuildCache = getSharedRouteModuleBuildCache(outdir, options.appConfig);
	const entryRecord: Record<string, string> = {};
	const entryKeysByPath = new Map<string, string>();

	for (const entryPath of eligibleEntryPaths) {
		const entryKey = createSafeGraphEntryKey(entryPath, options.appConfig.rootDir);
		entryRecord[entryKey] = entryPath;
		entryKeysByPath.set(entryPath, entryKey);
	}

	appLogger.debugTime('pagesUnifiedGraphBuild');
	const buildResult = await build(
		{
			...resolveBuildProfileOptions('route-module', options.appConfig, {
				entrypoints: entryRecord,
				outdir,
				splitting: true,
				naming: '[name]-[hash].[ext]',
				plugins: mergedPlugins.length > 0 ? mergedPlugins : undefined,
			}),
		},
		requireBuildRuntime(options.appConfig).getProfile('route-module'),
	);
	appLogger.debugTimeEnd('pagesUnifiedGraphBuild');

	if (!buildResult.success) {
		const details = buildResult.logs.map((log) => log.message).join(' | ');
		throw new Error(`Pages unified graph build failed: ${details}`);
	}

	const outputs: Record<string, string> = {};

	for (const entryPath of eligibleEntryPaths) {
		const fileHash = fileSystem.hash(entryPath);
		const entryKey = entryKeysByPath.get(entryPath);
		const compiledOutput = entryKey ? resolveOutputForEntrypoint(entryPath, entryKey, buildResult) : undefined;
		if (!compiledOutput) {
			throw new Error(`Pages unified graph build produced no output for ${entryPath}`);
		}

		normalizeNodeRuntimeBuildOutputFile(compiledOutput, options.appConfig.rootDir);
		outputs[entryPath] = compiledOutput;

		routeModuleBuildCache.recordBuild({
			filePath: entryPath,
			rootDir: options.appConfig.rootDir,
			outdir,
			fileHash,
			outputPath: compiledOutput,
			dependencyModulePaths: resolveRouteModuleDependencyPaths(buildResult, entryPath, options.appConfig.rootDir),
			externalPackages: true,
			plugins: mergedPlugins,
		});
	}

	const manifest: PagesUnifiedGraphCacheManifest = {
		invalidationVersion: getCorePackageVersion(),
		buildInputsFingerprint: createBuildInputsFingerprint(options.appConfig),
		buildKey: createPagesUnifiedGraphBuildKey(options.appConfig, outdir),
		builtAt: Date.now(),
		outputs,
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
	if (!manifest) {
		return undefined;
	}

	const resolvedFilePath = path.resolve(filePath);
	const outputPath = manifest.outputs[resolvedFilePath];
	if (!outputPath || !fileSystem.exists(outputPath)) {
		return undefined;
	}

	return (await import(/* @vite-ignore */ pathToFileURL(outputPath).href)) as T;
}
