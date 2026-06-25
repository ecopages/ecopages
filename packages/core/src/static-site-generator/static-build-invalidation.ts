import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import {
	createBuildInputsFingerprint,
	hashAppConfigFile,
	haveBuildInputsChanged,
} from '../build/build-input-fingerprint.ts';
import {
	ROUTE_MODULE_BUILD_CACHE_FILENAME,
	type RouteModuleStaticRenderCacheContext,
} from '../services/module-loading/route-module-build-manifest.ts';
import {
	getSharedRouteModuleBuildCache,
	getServerModuleBuildCacheOutdir,
} from '../services/module-loading/route-module-build-cache-registry.ts';
import { resolveInternalExecutionDir } from '../utils/resolve-work-dir.ts';

export type {
	BuildInputChangeContributor,
	IntegrationPlugin,
	Processor,
} from '../build/build-input-fingerprint.ts';
export {
	collectBuildInputContributors,
	createBuildInputsFingerprint,
	didBuildInputContributorChange,
	hashAppConfigFile,
	haveBuildInputsChanged,
} from '../build/build-input-fingerprint.ts';

/** Builds the static-render invalidation context for one app config. */
export function createRouteModuleStaticRenderCacheContext(
	appConfig: EcoPagesAppConfig,
): RouteModuleStaticRenderCacheContext {
	return {
		configHash: hashAppConfigFile(appConfig),
		buildInputsFingerprint: createBuildInputsFingerprint(appConfig),
	};
}

/** Returns whether `dist/` should be wiped before the next static export. */
export function shouldResetStaticExportDirectory(appConfig: EcoPagesAppConfig, force = false): boolean {
	if (force) {
		return true;
	}

	if (haveBuildInputsChanged(appConfig)) {
		return true;
	}

	const routeModuleCache = getSharedRouteModuleBuildCache(getServerModuleBuildCacheOutdir(appConfig), appConfig);
	return !routeModuleCache.isIncrementalStaticGenerationAvailable(
		createRouteModuleStaticRenderCacheContext(appConfig),
	);
}

const PRODUCTION_BUILD_CACHE_OUTDIRS = ['.server-modules', '.server-route-modules'] as const;

/** Removes persisted production build caches so the next build recomputes everything. */
export function clearProductionBuildCaches(appConfig: EcoPagesAppConfig): void {
	if (process.env.NODE_ENV !== 'production') {
		return;
	}

	const executionDir = resolveInternalExecutionDir(appConfig);
	for (const subdir of PRODUCTION_BUILD_CACHE_OUTDIRS) {
		const manifestPath = path.join(executionDir, subdir, ROUTE_MODULE_BUILD_CACHE_FILENAME);
		if (fileSystem.exists(manifestPath)) {
			fileSystem.remove(manifestPath);
		}
	}

	const serverEntryCachePath = path.join(executionDir, '.server-entry', ROUTE_MODULE_BUILD_CACHE_FILENAME);
	if (fileSystem.exists(serverEntryCachePath)) {
		fileSystem.remove(serverEntryCachePath);
	}

	const pagesGraphCachePath = path.join(executionDir, '.server-pages-graph', ROUTE_MODULE_BUILD_CACHE_FILENAME);
	if (fileSystem.exists(pagesGraphCachePath)) {
		fileSystem.remove(pagesGraphCachePath);
	}

	for (const cache of appConfig.runtime?.routeModuleBuildCaches?.values() ?? []) {
		cache.resetMemory();
	}

	appConfig.runtime?.routeModuleBuildCaches?.clear();

	if (appConfig.runtime) {
		appConfig.runtime.serverEntryBuildExecutor = undefined;
	}
}
