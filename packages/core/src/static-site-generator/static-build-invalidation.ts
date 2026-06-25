import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { IntegrationPlugin } from '../plugins/integration-plugin.ts';
import type { Processor } from '../plugins/processor.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import {
	ROUTE_MODULE_BUILD_CACHE_FILENAME,
	type RouteModuleStaticRenderCacheContext,
} from '../services/module-loading/route-module-build-manifest.ts';
import {
	getSharedRouteModuleBuildCache,
	getServerModuleBuildCacheOutdir,
} from '../services/module-loading/route-module-build-cache-registry.ts';
import { resolveInternalExecutionDir } from '../utils/resolve-work-dir.ts';

/**
 * Optional contributor surface for build-time cache invalidation.
 *
 * @remarks
 * Processors and integrations may override {@link didChange} to report that
 * their build inputs changed independently of route source files.
 */
export interface BuildInputChangeContributor {
	/**
	 * Returns `true` when this contributor's build inputs changed since the last
	 * persisted incremental build metadata was written.
	 */
	didChange?(): boolean;
}

/** Returns whether a processor or integration signals changed build inputs. */
export function didBuildInputContributorChange(contributor: BuildInputChangeContributor): boolean {
	return contributor.didChange?.() === true;
}

/** Hashes the app's eco.config.ts file when present. */
export function hashAppConfigFile(appConfig: EcoPagesAppConfig): string {
	const configPath = appConfig.absolutePaths?.config;
	if (!configPath || !fileSystem.exists(configPath)) {
		return 'missing';
	}

	return fileSystem.hash(configPath);
}

/** Fingerprints processor/integration build-input state for cache invalidation. */
export function createBuildInputsFingerprint(appConfig: EcoPagesAppConfig): string {
	const changedContributors = [
		...Array.from(appConfig.processors?.values() ?? [])
			.filter((processor) => didBuildInputContributorChange(processor))
			.map((processor) => `processor:${processor.getName()}`),
		...(appConfig.integrations ?? [])
			.filter((integration) => didBuildInputContributorChange(integration))
			.map((integration) => `integration:${integration.name}`),
	];

	return changedContributors.length > 0 ? changedContributors.sort().join('|') : 'stable';
}

/** Returns true when any processor or integration reports changed build inputs. */
export function haveBuildInputsChanged(appConfig: EcoPagesAppConfig): boolean {
	return createBuildInputsFingerprint(appConfig) !== 'stable';
}

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

/** Collects every processor and integration that can invalidate incremental builds. */
export function collectBuildInputContributors(appConfig: EcoPagesAppConfig): BuildInputChangeContributor[] {
	return [...Array.from(appConfig.processors?.values() ?? []), ...(appConfig.integrations ?? [])];
}

export type { Processor, IntegrationPlugin };
