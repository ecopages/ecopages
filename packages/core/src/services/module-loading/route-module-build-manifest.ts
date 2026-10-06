import path from 'node:path';
import { readProductionCacheManifest } from '../../build/cache/production-build-cache.ts';
import { createJsxCacheKey, createPluginCacheKey, getCorePackageVersion } from '../../build/cache/cache-keys.ts';
import type { PageModuleBuildImportOptions } from './page-module-import.service.ts';
import type { RouteModuleDependencyHashes } from './route-module-dependency-hasher.ts';

export { ROUTE_MODULE_BUILD_CACHE_FILENAME } from '../../build/cache/cache-constants.ts';

/** One in-process route-module build entry. */
export interface RouteModuleBuildCacheEntry {
	sourceHash: string;
	outputPath: string;
	builtAt: number;
	buildKey: string;
	dependencyHashes?: RouteModuleDependencyHashes;
	/**
	 * Local files reachable from the compiled output through local imports,
	 * including shared chunks and collection modules. The entry is reused only
	 * while all of them exist.
	 */
	outputImports: string[];
	renderedOutputs?: Record<string, RouteModuleStaticRenderCacheEntry>;
}

/** Metadata for one rendered static HTML artifact derived from a route module. */
export interface RouteModuleStaticRenderCacheEntry {
	renderedOutputPath: string;
	renderedAt: number;
	sourceHash: string;
}

/** On-disk leftover from earlier releases; in-process caches use the same shape. */
export interface RouteModuleBuildCacheManifest {
	/** `getCorePackageVersion()` of the build that wrote the manifest. */
	corePackageVersion: string;
	configHash?: string;
	buildInputsFingerprint?: string;
	watchedInputsHash?: string;
	entries: Record<string, RouteModuleBuildCacheEntry>;
}

/** Successful route-module cache lookup result. */
export interface RouteModuleBuildCacheLookup {
	outputPath: string;
	entry: RouteModuleBuildCacheEntry;
}

/** Inputs that must remain stable for incremental static HTML generation. */
export interface RouteModuleStaticRenderCacheContext {
	configHash: string;
	buildInputsFingerprint: string;
	/** Hash of declared rendering inputs outside route module graphs; see `hashWatchedBuildInputs()`. */
	watchedInputsHash: string;
}

export type RouteModuleBuildCacheManifestReader = (manifestPath: string) => RouteModuleBuildCacheManifest | undefined;

export type RouteModuleBuildCacheManifestWriter = (
	manifestPath: string,
	manifest: RouteModuleBuildCacheManifest,
) => void;

/** Normalizes filesystem paths used as manifest keys and build-key inputs. */
export function normalizeRouteModuleCachePath(filePath: string): string {
	return path.resolve(filePath);
}

/**
 * Returns whether the in-process route-module cache should record this import.
 */
export function shouldPersistRouteModuleBuildCache(options: PageModuleBuildImportOptions): boolean {
	if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'development') {
		return false;
	}

	return !options.bypassCache;
}

/** Canonical reuse identity for in-process route-module caches. */
export function createRouteModuleReuseIdentity(options: PageModuleBuildImportOptions): string {
	return [
		path.resolve(options.rootDir),
		path.resolve(options.outdir),
		options.splitting ?? 'default',
		options.externalPackages ?? 'default',
		createJsxCacheKey(options.jsx),
		createPluginCacheKey(options.plugins),
	].join('::');
}

/** Derives the deterministic on-disk filename for one transpiled route module. */
export function resolvePageModuleOutputFileName(options: { filePath: string; fileHash: string }): string {
	const fileBaseName = path.basename(options.filePath, path.extname(options.filePath));
	return `${fileBaseName}-${options.fileHash}.mjs`;
}

/**
 * Builds the in-process cache key for a route-module compile.
 *
 * @param configHash - Hash of the config module and the files it imports; plugin identity alone cannot see
 * plugin options defined there.
 */
export function createPersistedRouteModuleBuildKey(options: PageModuleBuildImportOptions, configHash?: string): string {
	const reuseIdentity = createRouteModuleReuseIdentity(options);
	return configHash === undefined ? reuseIdentity : `${reuseIdentity}::config:${configHash}`;
}

export function createEmptyRouteModuleBuildCacheManifest(): RouteModuleBuildCacheManifest {
	return {
		corePackageVersion: getCorePackageVersion(),
		entries: {},
	};
}

/**
 * @remarks
 * Entries without `outputImports` predate import validation and cannot show that
 * their chunks still exist, so they are dropped and rebuild on the next lookup.
 */
export function readRouteModuleBuildCacheManifest(manifestPath: string): RouteModuleBuildCacheManifest | undefined {
	const parsed = readProductionCacheManifest<RouteModuleBuildCacheManifest>(manifestPath);
	if (!parsed || typeof parsed.entries !== 'object') {
		return undefined;
	}

	return {
		corePackageVersion: parsed.corePackageVersion ?? '',
		configHash: parsed.configHash,
		buildInputsFingerprint: parsed.buildInputsFingerprint,
		watchedInputsHash: parsed.watchedInputsHash,
		entries: Object.fromEntries(
			Object.entries(parsed.entries).filter(([, entry]) => Array.isArray(entry.outputImports)),
		),
	};
}
