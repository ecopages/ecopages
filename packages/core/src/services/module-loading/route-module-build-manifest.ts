import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import type { PageModuleBuildImportOptions } from './page-module-import.service.ts';
import type { RouteModuleDependencyHashes } from './route-module-dependency-hasher.ts';

/** Filename written beside transpiled server modules that stores incremental build metadata. */
export const ROUTE_MODULE_BUILD_CACHE_FILENAME = '.build-cache.json';

/** One persisted route-module build entry in {@link ROUTE_MODULE_BUILD_CACHE_FILENAME}. */
export interface RouteModuleBuildCacheEntry {
	sourceHash: string;
	outputPath: string;
	builtAt: number;
	buildKey: string;
	dependencyHashes?: RouteModuleDependencyHashes;
	renderedOutputs?: Record<string, RouteModuleStaticRenderCacheEntry>;
}

/** Metadata for one rendered static HTML artifact derived from a route module. */
export interface RouteModuleStaticRenderCacheEntry {
	renderedOutputPath: string;
	renderedAt: number;
	sourceHash: string;
}

/** On-disk manifest describing all cached route-module builds for one server outdir. */
export interface RouteModuleBuildCacheManifest {
	invalidationVersion: string;
	configHash?: string;
	buildInputsFingerprint?: string;
	entries: Record<string, RouteModuleBuildCacheEntry>;
}

/** Successful route-module cache lookup result. */
export interface RouteModuleBuildCacheLookup {
	outputPath: string;
	entry: RouteModuleBuildCacheEntry;
}

/** Inputs that must remain stable for incremental static HTML generation. */
export interface RouteModuleStaticRenderCacheContext {
	configHash: string;
	buildInputsFingerprint: string;
}

export type RouteModuleBuildCacheManifestReader = (manifestPath: string) => RouteModuleBuildCacheManifest | undefined;

export type RouteModuleBuildCacheManifestWriter = (
	manifestPath: string,
	manifest: RouteModuleBuildCacheManifest,
) => void;

let cachedCorePackageVersion: string | undefined;

/** Returns the installed `@ecopages/core` package version used to invalidate persisted caches. */
export function getCorePackageVersion(): string {
	if (cachedCorePackageVersion) {
		return cachedCorePackageVersion;
	}

	const packageJsonPath = new URL('../../../package.json', import.meta.url);
	const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string };
	cachedCorePackageVersion = packageJson.version ?? '0.0.0';
	return cachedCorePackageVersion;
}

/** Normalizes filesystem paths used as manifest keys and build-key inputs. */
export function normalizeRouteModuleCachePath(filePath: string): string {
	return path.resolve(filePath);
}

/** Returns whether route-module disk caching should run for the current import. */
export function shouldPersistRouteModuleBuildCache(options: PageModuleBuildImportOptions): boolean {
	if (process.env.NODE_ENV !== 'production') {
		return false;
	}

	if (options.bypassCache) {
		return false;
	}

	if ((options.invalidationVersion ?? 0) > 0) {
		return false;
	}

	if (options.cacheScope) {
		return false;
	}

	return true;
}

/** Derives the deterministic on-disk filename for one transpiled route module. */
export function resolvePageModuleOutputFileName(options: {
	filePath: string;
	fileHash: string;
	cacheScope?: string;
	invalidationVersion?: number;
}): string {
	const fileBaseName = path.basename(options.filePath, path.extname(options.filePath));
	const cacheScopeSuffix = options.cacheScope ? `-${sanitizeCacheScope(options.cacheScope)}` : '';
	const invalidationSuffix = shouldVersionBuildOutputPath(options.invalidationVersion ?? 0)
		? `-v${options.invalidationVersion}`
		: '';

	return `${fileBaseName}-${options.fileHash}${cacheScopeSuffix}${invalidationSuffix}.mjs`;
}

/** Builds the cache key for persisted production route-module builds. */
export function createPersistedRouteModuleBuildKey(options: PageModuleBuildImportOptions): string {
	return [
		path.resolve(options.rootDir),
		path.resolve(options.outdir),
		options.splitting ?? 'default',
		options.externalPackages ?? 'default',
		createJsxCacheKey(options.jsx),
		createPluginCacheKey(options.plugins),
	].join('::');
}

export function createEmptyRouteModuleBuildCacheManifest(): RouteModuleBuildCacheManifest {
	return {
		invalidationVersion: getCorePackageVersion(),
		entries: {},
	};
}

export function readRouteModuleBuildCacheManifest(manifestPath: string): RouteModuleBuildCacheManifest | undefined {
	if (!fileSystem.exists(manifestPath)) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(fileSystem.readFileSync(manifestPath)) as RouteModuleBuildCacheManifest;
		if (!parsed || typeof parsed !== 'object' || typeof parsed.entries !== 'object') {
			return undefined;
		}

		return {
			invalidationVersion: parsed.invalidationVersion ?? '',
			configHash: parsed.configHash,
			buildInputsFingerprint: parsed.buildInputsFingerprint,
			entries: parsed.entries,
		};
	} catch {
		return undefined;
	}
}

export function writeRouteModuleBuildCacheManifest(
	manifestPath: string,
	manifest: RouteModuleBuildCacheManifest,
): void {
	fileSystem.write(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`);
}

function shouldVersionBuildOutputPath(invalidationVersion: number): boolean {
	return typeof Bun !== 'undefined' && invalidationVersion > 0;
}

function sanitizeCacheScope(cacheScope: string): string {
	return cacheScope.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

export function createJsxCacheKey(jsx: PageModuleBuildImportOptions['jsx']): string {
	if (!jsx) {
		return 'jsx:default';
	}

	return JSON.stringify({
		development: jsx.development ?? false,
		factory: jsx.factory ?? null,
		fragment: jsx.fragment ?? null,
		importSource: jsx.importSource ?? null,
		runtime: jsx.runtime ?? null,
		sideEffects: jsx.sideEffects ?? null,
	});
}

export function createPluginCacheKey(plugins?: EcoBuildPlugin[]): string {
	if (!plugins || plugins.length === 0) {
		return 'plugins:default';
	}

	return `plugins:${plugins.map((plugin) => `${plugin.name}:${hashPluginSetup(plugin.setup)}`).join(',')}`;
}

/** Exported for in-process import caches that must match persisted build keys. */
export function hashPluginSetup(setup: EcoBuildPlugin['setup']): string {
	let hash = 0;
	const source = setup.toString();

	for (let index = 0; index < source.length; index += 1) {
		hash = (hash * 31 + source.charCodeAt(index)) | 0;
	}

	return (hash >>> 0).toString(36);
}
