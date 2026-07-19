import fs from 'node:fs';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { getAppBrowserBuildPlugins } from '../build-adapter.ts';
import { createBuildInputsFingerprint, hashAppConfigFile } from './build-input-fingerprint.ts';
import {
	readProductionCacheManifest,
	writeProductionCacheManifest,
	isProductionCacheManifestCurrent,
	matchesProductionCacheFingerprint,
} from './production-build-cache.ts';
import { getCorePackageVersion } from './cache-keys.ts';
import { isDevelopmentRuntime } from '../../utils/runtime.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';

/**
 * @remarks
 * Unlike the dev browser-script cache (which lives under `.eco`), the HMR
 * entrypoint cache is written under `node_modules/.cache/ecopages` so a
 * `rm -rf apps/<app>/.eco` during iteration still keeps persistent
 * cold-graph artifacts across dev sessions for unchanged sources.
 */
export const DEV_HMR_ENTRYPOINT_CACHE_DIR = '.cache/ecopages/hmr-entrypoints';
export const DEV_HMR_ENTRYPOINT_CACHE_FILENAME = '.hmr-entrypoints.json';

export interface DevHmrEntrypointCacheEntry {
	outputPath: string;
	outputUrl: string;
	sourceMtimeMs: number;
	builtAt: number;
}

export interface DevHmrEntrypointCacheManifest {
	invalidationVersion: string;
	buildInputsFingerprint: string;
	entries: Record<string, DevHmrEntrypointCacheEntry>;
}

export type DevHmrEntrypointCache = {
	appConfig: EcoPagesAppConfig;
	manifest: DevHmrEntrypointCacheManifest;
};

function getDevHmrEntrypointCacheDir(appConfig: EcoPagesAppConfig): string {
	return path.join(appConfig.rootDir, 'node_modules', DEV_HMR_ENTRYPOINT_CACHE_DIR);
}

function getDevHmrEntrypointCacheManifestPath(appConfig: EcoPagesAppConfig): string {
	return path.join(getDevHmrEntrypointCacheDir(appConfig), DEV_HMR_ENTRYPOINT_CACHE_FILENAME);
}

function createBrowserBuildKey(appConfig: EcoPagesAppConfig): string {
	try {
		const pluginNames = getAppBrowserBuildPlugins(appConfig)
			.map((plugin) => plugin.name)
			.sort()
			.join('|');
		return pluginNames || 'default';
	} catch {
		return 'default';
	}
}

function createDevHmrEntrypointInvalidationVersion(appConfig: EcoPagesAppConfig): string {
	return [getCorePackageVersion(), hashAppConfigFile(appConfig), createBrowserBuildKey(appConfig)].join('::');
}

function readManifest(appConfig: EcoPagesAppConfig): DevHmrEntrypointCacheManifest | undefined {
	const manifest = readProductionCacheManifest<DevHmrEntrypointCacheManifest>(
		getDevHmrEntrypointCacheManifestPath(appConfig),
	);

	if (!manifest) {
		return undefined;
	}

	const invalidationVersion = createDevHmrEntrypointInvalidationVersion(appConfig);
	const buildInputsFingerprint = createBuildInputsFingerprint(appConfig);

	if (
		!isProductionCacheManifestCurrent(manifest, invalidationVersion) ||
		!matchesProductionCacheFingerprint(manifest, buildInputsFingerprint)
	) {
		return undefined;
	}

	return manifest;
}

/** Returns whether the dev HMR entrypoint disk cache is active. */
export function shouldUseDevHmrEntrypointCache(): boolean {
	return isDevelopmentRuntime();
}

/** Loads (or initializes) the persistent HMR entrypoint cache for one app. */
export function createDevHmrEntrypointCache(appConfig: EcoPagesAppConfig): DevHmrEntrypointCache {
	const invalidationVersion = createDevHmrEntrypointInvalidationVersion(appConfig);
	const buildInputsFingerprint = createBuildInputsFingerprint(appConfig);
	const existing = readManifest(appConfig);
	const manifest: DevHmrEntrypointCacheManifest = existing ?? {
		invalidationVersion,
		buildInputsFingerprint,
		entries: {},
	};

	return { appConfig, manifest };
}

/**
 * Looks up a persisted HMR entrypoint by source path.
 *
 * @remarks
 * Returns the cached entry only when the on-disk artifact still exists and the
 * recorded source mtime matches. A stale artifact (e.g. removed `.eco`) or a
 * source edit invalidates the entry so the caller rebuilds it.
 */
export function getDevHmrEntrypointCacheEntry(
	cache: DevHmrEntrypointCache,
	sourcePath: string,
): DevHmrEntrypointCacheEntry | null {
	if (!shouldUseDevHmrEntrypointCache()) {
		return null;
	}

	const entry = cache.manifest.entries[sourcePath];
	if (!entry?.outputPath || !entry.outputUrl) {
		return null;
	}

	if (!fileSystem.exists(entry.outputPath)) {
		return null;
	}

	try {
		if (fs.statSync(sourcePath).mtimeMs !== entry.sourceMtimeMs) {
			return null;
		}
	} catch {
		return null;
	}

	return entry;
}

/** Persists one HMR entrypoint output for cross-session cold-graph reuse. */
export function setDevHmrEntrypointCacheEntry(
	cache: DevHmrEntrypointCache,
	sourcePath: string,
	entry: DevHmrEntrypointCacheEntry,
): void {
	if (!shouldUseDevHmrEntrypointCache()) {
		return;
	}

	const invalidationVersion = createDevHmrEntrypointInvalidationVersion(cache.appConfig);
	const buildInputsFingerprint = createBuildInputsFingerprint(cache.appConfig);

	cache.manifest.invalidationVersion = invalidationVersion;
	cache.manifest.buildInputsFingerprint = buildInputsFingerprint;
	cache.manifest.entries[sourcePath] = entry;

	writeProductionCacheManifest(getDevHmrEntrypointCacheManifestPath(cache.appConfig), cache.manifest);
}

/** Drops one persisted cold-graph entry after a source change or HMR rebuild. */
export function removeDevHmrEntrypointCacheEntry(cache: DevHmrEntrypointCache, sourcePath: string): void {
	if (!shouldUseDevHmrEntrypointCache()) {
		return;
	}

	if (!(sourcePath in cache.manifest.entries)) {
		return;
	}

	delete cache.manifest.entries[sourcePath];
	writeProductionCacheManifest(getDevHmrEntrypointCacheManifestPath(cache.appConfig), cache.manifest);
}
