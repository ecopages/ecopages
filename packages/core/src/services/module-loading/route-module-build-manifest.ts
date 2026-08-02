import path from 'node:path';
import { readProductionCacheManifest, writeProductionCacheManifest } from '../../build/cache/production-build-cache.ts';
import {
	createJsxCacheKey,
	createPluginCacheKey,
	createSourceTransformCacheKey,
	getCorePackageVersion,
} from '../../build/cache/cache-keys.ts';
import type { BuildOptions } from '../../build/contracts/build-contracts.ts';
import type { PageModuleBuildImportOptions } from './page-module-import.service.ts';
import type { RouteModuleDependencyHashes } from './route-module-dependency-hasher.ts';

export {
	createJsxCacheKey,
	createPluginCacheKey,
	getCorePackageVersion,
	hashPluginSetup,
} from '../../build/cache/cache-keys.ts';

export { ROUTE_MODULE_BUILD_CACHE_FILENAME } from '../../build/cache/cache-constants.ts';

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
	corePackageVersion: string;
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

/**
 * Returns whether route-module disk caching should run for the current import.
 */
export function shouldPersistRouteModuleBuildCache(options: PageModuleBuildImportOptions): boolean {
	if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'development') {
		return false;
	}

	return !options.bypassCache;
}

/** Canonical reuse identity for route-module memory and disk caches. */
export function createRouteModuleReuseIdentity(
	options: PageModuleBuildImportOptions,
	sourceTransforms?: BuildOptions['sourceTransforms'],
): string {
	return [
		path.resolve(options.rootDir),
		path.resolve(options.outdir),
		options.splitting ?? 'default',
		options.externalPackages ?? 'default',
		createJsxCacheKey(options.jsx),
		createPluginCacheKey(options.plugins),
		createSourceTransformCacheKey(sourceTransforms),
	].join('::');
}

/** Derives the deterministic on-disk filename for one transpiled route module. */
export function resolvePageModuleOutputFileName(options: { filePath: string; fileHash: string }): string {
	const fileBaseName = path.basename(options.filePath, path.extname(options.filePath));
	return `${fileBaseName}-${options.fileHash}.mjs`;
}

/** Builds the cache key for persisted production route-module builds. */
export function createPersistedRouteModuleBuildKey(
	options: PageModuleBuildImportOptions,
	sourceTransforms?: BuildOptions['sourceTransforms'],
): string {
	return createRouteModuleReuseIdentity(options, sourceTransforms);
}

export function createEmptyRouteModuleBuildCacheManifest(): RouteModuleBuildCacheManifest {
	return {
		corePackageVersion: getCorePackageVersion(),
		entries: {},
	};
}

export function readRouteModuleBuildCacheManifest(manifestPath: string): RouteModuleBuildCacheManifest | undefined {
	const parsed = readProductionCacheManifest<RouteModuleBuildCacheManifest & { invalidationVersion?: string }>(
		manifestPath,
	);
	if (!parsed || typeof parsed.entries !== 'object') {
		return undefined;
	}

	return {
		corePackageVersion: parsed.corePackageVersion ?? parsed.invalidationVersion ?? '',
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
