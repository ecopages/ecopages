import { fileSystem } from '@ecopages/file-system';
import path from 'node:path';
import { ROUTE_MODULE_BUILD_CACHE_FILENAME } from '../services/module-loading/route-module-build-manifest.ts';
import { resolveInternalExecutionDir } from '../utils/resolve-work-dir.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';

/**
 * Shared manifest fields for persisted production build caches.
 */
export interface ProductionCacheManifestBase {
	invalidationVersion: string;
	buildInputsFingerprint?: string;
	buildKey?: string;
	builtAt?: number;
}

export type ProductionBuildCacheKind = 'server-entry' | 'route-module' | 'pages-graph';

const ROUTE_MODULE_CACHE_OUTDIRS = ['.server-modules', '.server-route-modules'] as const;
const PAGES_GRAPH_CACHE_DIR = '.server-pages-graph';

/** Returns every persisted production cache manifest path for one app. */
export function getProductionBuildCacheManifestPaths(appConfig: EcoPagesAppConfig): string[] {
	const executionDir = resolveInternalExecutionDir(appConfig);
	const paths: string[] = [];

	for (const subdir of ROUTE_MODULE_CACHE_OUTDIRS) {
		paths.push(path.join(executionDir, subdir, ROUTE_MODULE_BUILD_CACHE_FILENAME));
	}

	paths.push(path.join(executionDir, '.server-entry', ROUTE_MODULE_BUILD_CACHE_FILENAME));
	paths.push(path.join(executionDir, PAGES_GRAPH_CACHE_DIR, ROUTE_MODULE_BUILD_CACHE_FILENAME));

	return paths;
}

/** Removes all persisted production cache manifests for one app. */
export function clearPersistedProductionBuildCacheManifests(appConfig: EcoPagesAppConfig): void {
	if (process.env.NODE_ENV !== 'production') {
		return;
	}

	for (const manifestPath of getProductionBuildCacheManifestPaths(appConfig)) {
		if (fileSystem.exists(manifestPath)) {
			fileSystem.remove(manifestPath);
		}
	}
}

export function readProductionCacheManifest<T extends ProductionCacheManifestBase>(
	manifestPath: string,
): T | undefined {
	if (!fileSystem.exists(manifestPath)) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(fileSystem.readFileSync(manifestPath)) as T;
		if (!parsed || typeof parsed !== 'object') {
			return undefined;
		}
		return parsed;
	} catch {
		return undefined;
	}
}

export function writeProductionCacheManifest(manifestPath: string, manifest: unknown): void {
	fileSystem.ensureDir(path.dirname(manifestPath));
	fileSystem.write(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`);
}

export function isProductionCacheManifestCurrent(
	manifest: ProductionCacheManifestBase | undefined,
	invalidationVersion: string,
): boolean {
	return manifest?.invalidationVersion === invalidationVersion;
}

export function matchesProductionCacheFingerprint(
	manifest: ProductionCacheManifestBase | undefined,
	buildInputsFingerprint: string,
): boolean {
	return manifest?.buildInputsFingerprint === buildInputsFingerprint;
}

export function matchesProductionCacheBuildKey(
	manifest: ProductionCacheManifestBase | undefined,
	buildKey: string,
): boolean {
	return manifest?.buildKey === buildKey;
}
