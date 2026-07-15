import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import {
	createBuildInputsFingerprint,
	hashAppConfigFile,
	haveBuildInputsChanged,
} from '../build/cache/build-input-fingerprint.ts';
import { clearPersistedProductionBuildCacheManifests } from '../build/cache/production-build-cache.ts';
import { type RouteModuleStaticRenderCacheContext } from '../services/module-loading/route-module-build-manifest.ts';
import {
	getSharedRouteModuleBuildCache,
	getServerModuleBuildCacheOutdir,
} from '../services/module-loading/route-module-build-cache-registry.ts';

export type { BuildInputChangeContributor, IntegrationPlugin, Processor } from '../build/cache/build-input-fingerprint.ts';
export {
	collectBuildInputContributors,
	createBuildInputsFingerprint,
	didBuildInputContributorChange,
	hashAppConfigFile,
	haveBuildInputsChanged,
} from '../build/cache/build-input-fingerprint.ts';

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

/** Removes persisted production build caches so the next build recomputes everything. */
export function clearProductionBuildCaches(appConfig: EcoPagesAppConfig): void {
	if (process.env.NODE_ENV !== 'production') {
		return;
	}

	clearPersistedProductionBuildCacheManifests(appConfig);

	for (const cache of appConfig.runtime?.routeModuleBuildCaches?.values() ?? []) {
		cache.resetMemory();
	}

	appConfig.runtime?.routeModuleBuildCaches?.clear();

	if (appConfig.runtime) {
		appConfig.runtime.buildRuntime = undefined;
	}
}
