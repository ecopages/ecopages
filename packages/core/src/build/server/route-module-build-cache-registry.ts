import path from 'node:path';
import { hashAppConfigFile } from '../../build/cache/app-config-hash.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { resolveInternalExecutionDir } from '../../utils/resolve-work-dir.ts';
import { RouteModuleBuildCache } from './route-module-build-cache.store.ts';

/**
 * Returns the outdir of route-module server builds and their transpile cache.
 *
 * @remarks
 * Development builds every server module here. Production imports the modules emitted
 * into `dist/.server/` and builds here only for a module the server-modules map does not
 * list, or for every module when `ECOPAGES_UNIFIED_PAGES_GRAPH` disables the map.
 * `.server-route-modules` only serves route-registry scanning.
 */
export function getServerModuleBuildCacheOutdir(appConfig: EcoPagesAppConfig): string {
	return path.join(resolveInternalExecutionDir(appConfig), '.server-modules');
}

/**
 * Returns the shared production build cache for one server-module outdir.
 *
 * @remarks
 * One app-scoped instance prevents in-process cache drift between page imports and static
 * generation during the same build process.
 */
export function getSharedRouteModuleBuildCache(outdir: string, appConfig: EcoPagesAppConfig): RouteModuleBuildCache {
	const caches = requireAppRuntime(appConfig).routeModuleBuildCaches;
	const existingCache = caches.get(outdir);
	if (existingCache) {
		return existingCache;
	}

	let configHash: string | undefined;
	const routeModuleBuildCache = new RouteModuleBuildCache({
		getConfigHash: () => (configHash ??= hashAppConfigFile(appConfig)),
	});
	caches.set(outdir, routeModuleBuildCache);
	return routeModuleBuildCache;
}

/** Clears route-module cache entries that can retain stale external server modules during development. */
export function clearAppDevelopmentRouteModuleBuildCaches(appConfig: EcoPagesAppConfig): void {
	for (const cache of requireAppRuntime(appConfig).routeModuleBuildCaches.values()) {
		cache.clearDevelopmentEntries();
	}
}
