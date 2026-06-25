import path from 'node:path';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { resolveInternalExecutionDir } from '../../utils/resolve-work-dir.ts';
import { RouteModuleBuildCache } from './route-module-build-cache.store.ts';

/**
 * Returns the outdir whose transpile cache backs incremental static generation.
 *
 * @remarks
 * Static pages render through `.eco/.server-modules`. The manifest there carries
 * import-graph hashes from transpile, so static-render reuse must read the same
 * directory rather than `.server-route-modules`, which only serves route-registry
 * scanning.
 */
export function getServerModuleBuildCacheOutdir(appConfig: EcoPagesAppConfig): string {
	return path.join(resolveInternalExecutionDir(appConfig), '.server-modules');
}

/**
 * @deprecated Use {@link getServerModuleBuildCacheOutdir}.
 */
export const getRouteModuleBuildCacheOutdir = getServerModuleBuildCacheOutdir;

function getRouteModuleBuildCacheMap(appConfig: EcoPagesAppConfig): Map<string, RouteModuleBuildCache> {
	const existing = appConfig.runtime?.routeModuleBuildCaches;
	if (existing) {
		return existing;
	}

	const routeModuleBuildCaches = new Map<string, RouteModuleBuildCache>();
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		routeModuleBuildCaches,
	};
	return routeModuleBuildCaches;
}

/**
 * Returns the shared production build cache for one server-module outdir.
 *
 * @remarks
 * One app-scoped instance prevents manifest drift between page imports and static
 * generation during the same build process.
 */
export function getSharedRouteModuleBuildCache(outdir: string, appConfig?: EcoPagesAppConfig): RouteModuleBuildCache {
	if (!appConfig) {
		return new RouteModuleBuildCache(outdir);
	}

	const caches = getRouteModuleBuildCacheMap(appConfig);
	const existingCache = caches.get(outdir);
	if (existingCache) {
		return existingCache;
	}

	const routeModuleBuildCache = new RouteModuleBuildCache(outdir);
	caches.set(outdir, routeModuleBuildCache);
	return routeModuleBuildCache;
}
