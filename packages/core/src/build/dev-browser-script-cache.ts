import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { getAppBrowserBuildPlugins } from './build-adapter.ts';
import { createBuildInputsFingerprint, hashAppConfigFile } from './build-input-fingerprint.ts';
import {
	readProductionCacheManifest,
	writeProductionCacheManifest,
	isProductionCacheManifestCurrent,
	matchesProductionCacheFingerprint,
} from './production-build-cache.ts';
import { getCorePackageVersion } from '../services/module-loading/route-module-build-manifest.ts';
import { resolveInternalExecutionDir } from '../utils/resolve-work-dir.ts';
import { isDevelopmentRuntime } from '../utils/runtime.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { ProcessedAsset } from '../services/assets/asset-processing-service/assets.types.ts';

export const DEV_BROWSER_SCRIPT_CACHE_DIR = '.browser-script-bundles';
export const DEV_BROWSER_SCRIPT_CACHE_FILENAME = '.build-cache.json';

/**
 * @remarks
 * Dev asset caching spans three scopes that should not be conflated:
 * - request dedupe (`request-build-dedupe.ts`) — one in-flight build per request key
 * - in-memory service cache (`AssetProcessingService`) — per-process reuse within one dev server
 * - this disk manifest (`.eco/.browser-script-bundles`) — cross-request reuse of content-script bundles
 */
export interface DevBrowserScriptCacheEntry {
	filepath: string;
	builtAt: number;
}

export interface DevBrowserScriptCacheManifest {
	invalidationVersion: string;
	buildInputsFingerprint: string;
	entries: Record<string, DevBrowserScriptCacheEntry>;
}

function getDevBrowserScriptCacheDir(appConfig: EcoPagesAppConfig): string {
	return path.join(resolveInternalExecutionDir(appConfig), DEV_BROWSER_SCRIPT_CACHE_DIR);
}

function getDevBrowserScriptCacheManifestPath(appConfig: EcoPagesAppConfig): string {
	return path.join(getDevBrowserScriptCacheDir(appConfig), DEV_BROWSER_SCRIPT_CACHE_FILENAME);
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

function createDevBrowserScriptCacheInvalidationVersion(appConfig: EcoPagesAppConfig): string {
	return [getCorePackageVersion(), hashAppConfigFile(appConfig), createBrowserBuildKey(appConfig)].join('::');
}

function readManifest(appConfig: EcoPagesAppConfig): DevBrowserScriptCacheManifest | undefined {
	const manifest = readProductionCacheManifest<DevBrowserScriptCacheManifest>(
		getDevBrowserScriptCacheManifestPath(appConfig),
	);

	if (!manifest) {
		return undefined;
	}

	const invalidationVersion = createDevBrowserScriptCacheInvalidationVersion(appConfig);
	const buildInputsFingerprint = createBuildInputsFingerprint(appConfig);

	if (
		!isProductionCacheManifestCurrent(manifest, invalidationVersion) ||
		!matchesProductionCacheFingerprint(manifest, buildInputsFingerprint)
	) {
		return undefined;
	}

	return manifest;
}

function writeManifest(appConfig: EcoPagesAppConfig, manifest: DevBrowserScriptCacheManifest): void {
	writeProductionCacheManifest(getDevBrowserScriptCacheManifestPath(appConfig), manifest);
}

/** Returns whether dev-only cross-request content-script bundle cache is active. */
export function shouldUseDevBrowserScriptCache(): boolean {
	return isDevelopmentRuntime();
}

/** Looks up one persisted dev content-script bundle by dependency cache key. */
export function getDevBrowserScriptCacheEntry(appConfig: EcoPagesAppConfig, depKey: string): ProcessedAsset | null {
	if (!shouldUseDevBrowserScriptCache()) {
		return null;
	}

	const manifest = readManifest(appConfig);
	const entry = manifest?.entries[depKey];
	if (!entry?.filepath || !fileSystem.exists(entry.filepath)) {
		return null;
	}

	return {
		filepath: entry.filepath,
		kind: 'script',
		inline: false,
	};
}

/** Persists one dev content-script bundle output for cross-request reuse. */
export function setDevBrowserScriptCacheEntry(
	appConfig: EcoPagesAppConfig,
	depKey: string,
	asset: ProcessedAsset,
): void {
	if (!shouldUseDevBrowserScriptCache() || !asset.filepath) {
		return;
	}

	const invalidationVersion = createDevBrowserScriptCacheInvalidationVersion(appConfig);
	const buildInputsFingerprint = createBuildInputsFingerprint(appConfig);
	const existing = readManifest(appConfig);
	const manifest: DevBrowserScriptCacheManifest = existing ?? {
		invalidationVersion,
		buildInputsFingerprint,
		entries: {},
	};

	manifest.invalidationVersion = invalidationVersion;
	manifest.buildInputsFingerprint = buildInputsFingerprint;
	manifest.entries[depKey] = {
		filepath: asset.filepath,
		builtAt: Date.now(),
	};

	writeManifest(appConfig, manifest);
}
