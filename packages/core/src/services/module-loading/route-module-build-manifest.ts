import path from 'node:path';
import { readProductionCacheManifest, writeProductionCacheManifest } from '../../build/production-build-cache.ts';
import {
	createJsxCacheKey,
	createPluginCacheKey,
	getCorePackageVersion,
} from '../../build/cache-keys.ts';
import type { PageModuleBuildImportOptions } from './page-module-import.service.ts';
import type { RouteModuleDependencyHashes } from './route-module-dependency-hasher.ts';

export { createJsxCacheKey, createPluginCacheKey, getCorePackageVersion, hashPluginSetup } from '../../build/cache-keys.ts';

/** Filename written beside transpiled server modules that stores incremental build metadata. */
export const ROUTE_MODULE_BUILD_CACHE_FILENAME = '.build-cache.json';

/** One persisted route-module build entry in {@link ROUTE_MODULE_BUILD_CACHE_FILENAME}. */
export interface RouteModuleBuildCacheEntry {
	sourceHash: string;
	outputPath: string;
	builtAt: number;
	buildKey: string;
	dependencyHashes?: RouteModuleDependencyHashes;
	renderedOutputs?: Record<string, RouteModuleStaticRenderCacheEntry>;
}

/** Metadata for one rendered static HTML artifact derived from a route module. */
export interface RouteModuleStaticRenderCacheEntry {
	renderedOutputPath: string;
	renderedAt: number;
	sourceHash: string;
}

/** On-disk manifest describing all cached route-module builds for one server outdir. */
export interface RouteModuleBuildCacheManifest {
	invalidationVersion: string;
	configHash?: string;
	buildInputsFingerprint?: string;
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

/** Returns whether route-module disk caching should run for the current import. */
export function shouldPersistRouteModuleBuildCache(options: PageModuleBuildImportOptions): boolean {
	if (process.env.NODE_ENV !== 'production') {
		return false;
	}

	if (options.bypassCache) {
		return false;
	}

	if ((options.invalidationVersion ?? 0) > 0) {
		return false;
	}

	if (options.cacheScope) {
		return false;
	}

	return true;
}

/** Derives the deterministic on-disk filename for one transpiled route module. */
export function resolvePageModuleOutputFileName(options: {
	filePath: string;
	fileHash: string;
	cacheScope?: string;
	invalidationVersion?: number;
}): string {
	const fileBaseName = path.basename(options.filePath, path.extname(options.filePath));
	const cacheScopeSuffix = options.cacheScope ? `-${sanitizeCacheScope(options.cacheScope)}` : '';
	const invalidationSuffix = shouldVersionBuildOutputPath(options.invalidationVersion ?? 0)
		? `-v${options.invalidationVersion}`
		: '';

	return `${fileBaseName}-${options.fileHash}${cacheScopeSuffix}${invalidationSuffix}.mjs`;
}

/** Builds the cache key for persisted production route-module builds. */
export function createPersistedRouteModuleBuildKey(options: PageModuleBuildImportOptions): string {
	return [
		path.resolve(options.rootDir),
		path.resolve(options.outdir),
		options.splitting ?? 'default',
		options.externalPackages ?? 'default',
		createJsxCacheKey(options.jsx),
		createPluginCacheKey(options.plugins),
	].join('::');
}

export function createEmptyRouteModuleBuildCacheManifest(): RouteModuleBuildCacheManifest {
	return {
		invalidationVersion: getCorePackageVersion(),
		entries: {},
	};
}

export function readRouteModuleBuildCacheManifest(manifestPath: string): RouteModuleBuildCacheManifest | undefined {
	const parsed = readProductionCacheManifest<RouteModuleBuildCacheManifest>(manifestPath);
	if (!parsed || typeof parsed.entries !== 'object') {
		return undefined;
	}

	return {
		invalidationVersion: parsed.invalidationVersion ?? '',
		configHash: parsed.configHash,
		buildInputsFingerprint: parsed.buildInputsFingerprint,
		entries: parsed.entries,
	};
}

export function writeRouteModuleBuildCacheManifest(
	manifestPath: string,
	manifest: RouteModuleBuildCacheManifest,
): void {
	writeProductionCacheManifest(manifestPath, manifest);
}

function shouldVersionBuildOutputPath(invalidationVersion: number): boolean {
	return typeof Bun !== 'undefined' && invalidationVersion > 0;
}

function sanitizeCacheScope(cacheScope: string): string {
	return cacheScope.replace(/[^a-zA-Z0-9_-]+/g, '-');
}
