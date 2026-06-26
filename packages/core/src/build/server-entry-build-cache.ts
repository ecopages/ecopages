import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { BuildDependencyGraph, BuildResult } from './build-adapter.ts';
import { getAppServerBuildPlugins } from './build-adapter.ts';
import { createBuildInputsFingerprint } from './build-input-fingerprint.ts';
import {
	isProductionCacheManifestCurrent,
	matchesProductionCacheBuildKey,
	matchesProductionCacheFingerprint,
	readProductionCacheManifest,
	writeProductionCacheManifest,
} from './production-build-cache.ts';
import { getCorePackageVersion } from '../services/module-loading/route-module-build-manifest.ts';
import {
	RouteModuleDependencyHasher,
	createRouteModuleDependencyHashes,
} from '../services/module-loading/route-module-dependency-hasher.ts';
import { resolveInternalExecutionDir } from '../utils/resolve-work-dir.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME } from '../utils/resolve-entry-file.ts';

import { ROUTE_MODULE_BUILD_CACHE_FILENAME } from '../services/module-loading/route-module-build-manifest.ts';

/** @deprecated Use {@link ROUTE_MODULE_BUILD_CACHE_FILENAME}; both caches share the same manifest filename. */
export const SERVER_ENTRY_BUILD_CACHE_FILENAME = ROUTE_MODULE_BUILD_CACHE_FILENAME;
export const SERVER_BUNDLE_MANIFEST_FILENAME = 'manifest.json';

export interface ServerBundleDeployManifest {
	serverEntry: string;
	distDir: string;
	builtAt: number;
}

export interface ServerEntryBuildCacheManifest {
	invalidationVersion: string;
	entryPath: string;
	entryHash: string;
	buildInputsFingerprint: string;
	buildKey: string;
	outputPaths: string[];
	dependencyHashes: Record<string, string>;
	builtAt: number;
}

export interface ServerEntryBuildCacheLookup {
	manifest: ServerEntryBuildCacheManifest;
	outputPaths: string[];
}

function getServerEntryCacheDir(appConfig: EcoPagesAppConfig): string {
	return path.join(resolveInternalExecutionDir(appConfig), '.server-entry');
}

function getServerEntryCacheManifestPath(appConfig: EcoPagesAppConfig): string {
	return path.join(getServerEntryCacheDir(appConfig), SERVER_ENTRY_BUILD_CACHE_FILENAME);
}

function hashDependencyGraph(
	entryPath: string,
	dependencyGraph: BuildDependencyGraph | undefined,
	hasher: RouteModuleDependencyHasher,
	rootDir: string,
): Record<string, string> {
	if (!dependencyGraph) {
		return { [path.resolve(entryPath)]: fileSystem.hash(entryPath) };
	}

	return createRouteModuleDependencyHashes(hasher, { dependencyGraph }, entryPath, rootDir);
}

function createServerEntryBuildKey(appConfig: EcoPagesAppConfig): string {
	try {
		const plugins = getAppServerBuildPlugins(appConfig);
		const pluginNames = plugins
			.map((plugin) => plugin.name)
			.sort()
			.join('|');
		return ['node', 'esm', 'external-packages', pluginNames].join('::');
	} catch {
		return 'node::esm::external-packages';
	}
}

export function getServerBundleOutputPaths(appConfig: EcoPagesAppConfig): {
	distDir: string;
	serverOutdir: string;
	serverEntryPath: string;
	manifestPath: string;
} {
	const distDir = appConfig.absolutePaths?.distDir ?? path.join(appConfig.rootDir, appConfig.distDir);
	const serverOutdir = path.join(distDir, SERVER_BUNDLE_DIR);
	const serverEntryPath = path.join(serverOutdir, SERVER_BUNDLE_FILENAME);
	const manifestPath = path.join(serverOutdir, SERVER_BUNDLE_MANIFEST_FILENAME);

	return { distDir, serverOutdir, serverEntryPath, manifestPath };
}

export function readServerEntryBuildCacheManifest(
	appConfig: EcoPagesAppConfig,
): ServerEntryBuildCacheManifest | undefined {
	return readProductionCacheManifest<ServerEntryBuildCacheManifest>(getServerEntryCacheManifestPath(appConfig));
}

function writeServerEntryBuildCacheManifest(
	appConfig: EcoPagesAppConfig,
	manifest: ServerEntryBuildCacheManifest,
): void {
	writeProductionCacheManifest(
		path.join(getServerEntryCacheDir(appConfig), SERVER_ENTRY_BUILD_CACHE_FILENAME),
		manifest,
	);
}

export function writeServerBundleDeployManifest(appConfig: EcoPagesAppConfig, serverEntryPath: string): void {
	const { distDir, manifestPath } = getServerBundleOutputPaths(appConfig);
	fileSystem.ensureDir(path.dirname(manifestPath));
	const payload: ServerBundleDeployManifest = {
		serverEntry: path.relative(path.dirname(manifestPath), serverEntryPath) || SERVER_BUNDLE_FILENAME,
		distDir,
		builtAt: Date.now(),
	};
	fileSystem.write(manifestPath, `${JSON.stringify(payload, null, '\t')}\n`);
}

export function lookupServerEntryBuildCache(options: {
	appConfig: EcoPagesAppConfig;
	entryPath: string;
	force?: boolean;
}): ServerEntryBuildCacheLookup | undefined {
	if (options.force) {
		return undefined;
	}

	if (process.env.NODE_ENV !== 'production') {
		return undefined;
	}

	const entryPath = path.resolve(options.entryPath);
	const entryHash = fileSystem.hash(entryPath);
	const buildInputsFingerprint = createBuildInputsFingerprint(options.appConfig);
	const buildKey = createServerEntryBuildKey(options.appConfig);
	const manifest = readServerEntryBuildCacheManifest(options.appConfig);

	if (!manifest) {
		return undefined;
	}

	if (!isProductionCacheManifestCurrent(manifest, getCorePackageVersion())) {
		return undefined;
	}

	if (
		manifest.entryPath !== entryPath ||
		manifest.entryHash !== entryHash ||
		!matchesProductionCacheFingerprint(manifest, buildInputsFingerprint) ||
		!matchesProductionCacheBuildKey(manifest, buildKey)
	) {
		return undefined;
	}

	const hasher = new RouteModuleDependencyHasher();
	if (!hasher.matchesStoredHashes(manifest.dependencyHashes, entryPath, entryHash)) {
		return undefined;
	}

	const existingOutputs = manifest.outputPaths.filter((outputPath) => fileSystem.exists(outputPath));
	if (existingOutputs.length === 0) {
		return undefined;
	}

	return {
		manifest,
		outputPaths: existingOutputs,
	};
}

export function recordServerEntryBuildCache(options: {
	appConfig: EcoPagesAppConfig;
	entryPath: string;
	buildResult: BuildResult;
	outputPaths: string[];
}): void {
	if (process.env.NODE_ENV !== 'production') {
		return;
	}
	const entryPath = path.resolve(options.entryPath);
	const entryHash = fileSystem.hash(entryPath);
	const hasher = new RouteModuleDependencyHasher();
	const dependencyHashes = hashDependencyGraph(
		entryPath,
		options.buildResult.dependencyGraph,
		hasher,
		options.appConfig.rootDir,
	);

	const manifest: ServerEntryBuildCacheManifest = {
		invalidationVersion: getCorePackageVersion(),
		entryPath,
		entryHash,
		buildInputsFingerprint: createBuildInputsFingerprint(options.appConfig),
		buildKey: createServerEntryBuildKey(options.appConfig),
		outputPaths: options.outputPaths,
		dependencyHashes,
		builtAt: Date.now(),
	};

	writeServerEntryBuildCacheManifest(options.appConfig, manifest);
}

export function resolveProductionServerEntry(cwd = process.cwd()): string | undefined {
	const manifestPath = path.join(cwd, 'dist', SERVER_BUNDLE_DIR, SERVER_BUNDLE_MANIFEST_FILENAME);
	if (fileSystem.exists(manifestPath)) {
		try {
			const parsed = JSON.parse(fileSystem.readFileSync(manifestPath)) as ServerBundleDeployManifest;
			if (parsed?.serverEntry) {
				const fromManifest = path.isAbsolute(parsed.serverEntry)
					? parsed.serverEntry
					: path.join(path.dirname(manifestPath), parsed.serverEntry);
				if (fileSystem.exists(fromManifest)) {
					return fromManifest;
				}
			}
			if (parsed?.distDir) {
				const fromDistDir = path.join(parsed.distDir, SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME);
				if (fileSystem.exists(fromDistDir)) {
					return fromDistDir;
				}
			}
		} catch {
			// fall through to legacy path
		}
	}

	const legacyPath = path.join(cwd, 'dist', SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME);
	return fileSystem.exists(legacyPath) ? legacyPath : undefined;
}
