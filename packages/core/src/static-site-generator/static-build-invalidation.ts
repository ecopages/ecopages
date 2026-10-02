import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import {
	createBuildInputsFingerprint,
	hashAppConfigFile,
	hashWatchedBuildInputs,
	haveBuildInputsChanged,
} from '../build/cache/build-input-fingerprint.ts';
import { clearPersistedProductionBuildCacheManifests } from '../build/cache/production-build-cache.ts';
import { type RouteModuleStaticRenderCacheContext } from '../services/module-loading/route-module-build-manifest.ts';
import {
	getSharedRouteModuleBuildCache,
	getServerModuleBuildCacheOutdir,
} from '../services/module-loading/route-module-build-cache-registry.ts';

export type {
	BuildInputChangeContributor,
	IntegrationPlugin,
	Processor,
} from '../build/cache/build-input-fingerprint.ts';
export {
	collectBuildInputContributors,
	createBuildInputsFingerprint,
	didBuildInputContributorChange,
	hashAppConfigFile,
	hashWatchedBuildInputs,
	haveBuildInputsChanged,
} from '../build/cache/build-input-fingerprint.ts';

/**
 * Builds the static-render invalidation context for one app config.
 *
 * @param watchedInputsHash - A `hashWatchedBuildInputs()` result already computed for this export.
 */
export function createRouteModuleStaticRenderCacheContext(
	appConfig: EcoPagesAppConfig,
	watchedInputsHash: string = hashWatchedBuildInputs(appConfig),
): RouteModuleStaticRenderCacheContext {
	return {
		configHash: hashAppConfigFile(appConfig),
		buildInputsFingerprint: createBuildInputsFingerprint(appConfig),
		watchedInputsHash,
	};
}

/**
 * Returns whether `dist/` should be wiped before the next static export.
 *
 * @param watchedInputsHash - A `hashWatchedBuildInputs()` result already computed for this export.
 */
export function shouldResetStaticExportDirectory(
	appConfig: EcoPagesAppConfig,
	force = false,
	watchedInputsHash?: string,
): boolean {
	if (force) {
		return true;
	}

	if (haveBuildInputsChanged(appConfig)) {
		return true;
	}

	const routeModuleCache = getSharedRouteModuleBuildCache(getServerModuleBuildCacheOutdir(appConfig), appConfig);
	return !routeModuleCache.isIncrementalStaticGenerationAvailable(
		createRouteModuleStaticRenderCacheContext(appConfig, watchedInputsHash),
	);
}

/**
 * Returns whether Processor-declared rendering inputs changed since the last production export.
 *
 * @remarks
 * Compiled route modules and the unified pages graph track only static imports,
 * so content that a module loads through dynamic `import()` (such as content
 * collection entries) can change without invalidating them. Callers treat a
 * change like `--force` and clear the production caches, which recompiles every
 * route module; tracking dynamic-import sources in module dependency hashes would
 * narrow this to the affected routes.
 */
export function haveWatchedBuildInputsChanged(
	appConfig: EcoPagesAppConfig,
	watchedInputsHash: string = hashWatchedBuildInputs(appConfig),
): boolean {
	const routeModuleCache = getSharedRouteModuleBuildCache(getServerModuleBuildCacheOutdir(appConfig), appConfig);
	return routeModuleCache.getRecordedWatchedInputsHash() !== watchedInputsHash;
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
