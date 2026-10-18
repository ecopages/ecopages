import path from 'node:path';
import { isDevelopmentRuntime, isProductionRuntime } from '../../utils/runtime.ts';
import type { BuildOptions } from '../../build/build-adapter.ts';
import { createBuildRequestIdentity } from '../../build/runtime/build-request-identity.ts';
import type { PageModuleBuildImportOptions } from './page-module-import.service.ts';
import type { RouteModuleDependencyHashes } from './route-module-dependency-hasher.ts';

const ROUTE_MODULE_OUTPUT_NAMING_IDENTITY = '[route-module-output]';

/** One in-process route-module build entry. */
export interface RouteModuleBuildCacheEntry {
	sourceHash: string;
	outputPath: string;
	buildKey: string;
	dependencyHashes?: RouteModuleDependencyHashes;
	/**
	 * Local files reachable from the compiled output through local imports,
	 * including shared chunks and collection modules. The entry is reused only
	 * while all of them exist.
	 */
	outputImports: string[];
}

/** In-process route-module build entries keyed by normalized source path. */
export interface RouteModuleBuildCacheManifest {
	entries: Record<string, RouteModuleBuildCacheEntry>;
}

/** Successful route-module cache lookup result. */
export interface RouteModuleBuildCacheLookup {
	outputPath: string;
	entry: RouteModuleBuildCacheEntry;
}

/** Normalizes filesystem paths used as manifest keys and build-key inputs. */
export function normalizeRouteModuleCachePath(filePath: string): string {
	return path.resolve(filePath);
}

/**
 * Returns whether the in-process route-module cache should record this import.
 */
export function shouldCacheRouteModuleBuild(options: PageModuleBuildImportOptions): boolean {
	if (!isProductionRuntime() && !isDevelopmentRuntime()) {
		return false;
	}

	return !options.bypassCache;
}

/**
 * Canonical reuse identity for an assembled route-module build request.
 *
 * @remarks
 * All build options flow through the shared build identity. Route output naming
 * is normalized because it includes the entry source hash and development
 * generation: the cache keys the source hash separately and stores the actual
 * output path, while dependency hashes decide whether that output is reusable.
 * A generation-only naming change therefore does not force the same output to
 * be rebuilt.
 */
export function createRouteModuleReuseIdentity(options: BuildOptions): string {
	return createBuildRequestIdentity({ ...options, naming: ROUTE_MODULE_OUTPUT_NAMING_IDENTITY });
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
export function createRouteModuleBuildKey(options: BuildOptions, configHash?: string): string {
	const reuseIdentity = createRouteModuleReuseIdentity(options);
	return configHash === undefined ? reuseIdentity : `${reuseIdentity}::config:${configHash}`;
}

export function createEmptyRouteModuleBuildCacheManifest(): RouteModuleBuildCacheManifest {
	return { entries: {} };
}
