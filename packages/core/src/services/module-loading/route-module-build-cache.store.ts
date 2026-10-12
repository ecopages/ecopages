import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { PageModuleBuildImportOptions } from './page-module-import.service.ts';
import { RouteModuleDependencyHasher, type RouteModuleDependencyHashes } from './route-module-dependency-hasher.ts';
import {
	createEmptyRouteModuleBuildCacheManifest,
	createRouteModuleBuildKey,
	normalizeRouteModuleCachePath,
	shouldCacheRouteModuleBuild,
	type RouteModuleBuildCacheLookup,
	type RouteModuleBuildCacheManifest,
} from './route-module-build-manifest.ts';

export type { RouteModuleDependencyHashes };

type RouteModuleBuildCacheDependencies = {
	exists: (filePath: string) => boolean;
	createDependencyHasher: () => RouteModuleDependencyHasher;
	/**
	 * Hash of the config module and the files it imports; `undefined` when the cache has no app config.
	 *
	 * @remarks
	 * The shared app cache takes it once per process, so entries are keyed by the options the process
	 * loaded, not by files edited since.
	 */
	getConfigHash: () => string | undefined;
};

/**
 * In-process route-module transpile metadata for one server outdir.
 */
export class RouteModuleBuildCache {
	private readonly dependencies: RouteModuleBuildCacheDependencies;
	private readonly dependencyHasher: RouteModuleDependencyHasher;
	private manifest: RouteModuleBuildCacheManifest = createEmptyRouteModuleBuildCacheManifest();

	constructor(dependencies?: Partial<RouteModuleBuildCacheDependencies>) {
		this.dependencies = {
			exists: dependencies?.exists ?? ((filePath) => fileSystem.exists(filePath)),
			createDependencyHasher: dependencies?.createDependencyHasher ?? (() => new RouteModuleDependencyHasher()),
			getConfigHash: dependencies?.getConfigHash ?? (() => undefined),
		};
		this.dependencyHasher = this.dependencies.createDependencyHasher();
	}

	lookup(
		options: PageModuleBuildImportOptions & {
			fileHash: string;
		},
	): RouteModuleBuildCacheLookup | undefined {
		if (!shouldCacheRouteModuleBuild(options)) {
			return undefined;
		}

		const buildKey = createRouteModuleBuildKey(options, this.dependencies.getConfigHash());
		const cacheFilePath = normalizeRouteModuleCachePath(options.filePath);
		const entry = this.manifest.entries[cacheFilePath];
		if (!entry || entry.sourceHash !== options.fileHash || entry.buildKey !== buildKey) {
			return undefined;
		}

		if (!this.dependencyHasher.matchesStoredHashes(entry.dependencyHashes, cacheFilePath, options.fileHash)) {
			return undefined;
		}

		const outputPath = resolveOutputPath(entry.outputPath, options.outdir);
		if (!this.dependencies.exists(outputPath)) {
			return undefined;
		}
		if (!entry.outputImports.every((importPath) => this.dependencies.exists(importPath))) {
			return undefined;
		}

		return { outputPath, entry };
	}

	recordBuild(
		options: PageModuleBuildImportOptions & {
			fileHash: string;
			outputPath: string;
			dependencyModulePaths?: readonly string[];
			/** Local imports of the output when the caller already collected them. */
			outputImports?: string[];
		},
	): void {
		if (!shouldCacheRouteModuleBuild(options)) {
			return;
		}

		const cacheFilePath = normalizeRouteModuleCachePath(options.filePath);
		const dependencyModulePaths =
			options.dependencyModulePaths && options.dependencyModulePaths.length > 0
				? options.dependencyModulePaths
				: [cacheFilePath];
		const dependencyHashes = this.dependencyHasher.createDependencyHashes(dependencyModulePaths);
		dependencyHashes[cacheFilePath] = options.fileHash;

		this.manifest.entries[cacheFilePath] = {
			sourceHash: options.fileHash,
			outputPath: options.outputPath,
			buildKey: createRouteModuleBuildKey(options, this.dependencies.getConfigHash()),
			dependencyHashes,
			outputImports: options.outputImports ?? [],
		};
	}

	/**
	 * Removes every in-process route-module entry after development invalidation.
	 *
	 * @remarks
	 * Server bundles may externalize generated modules whose source dependencies
	 * are not present in the route bundle's dependency graph. Keeping an entry
	 * after its server graph changes can therefore reload a route that still
	 * imports an obsolete external bundle.
	 */
	clearDevelopmentEntries(): void {
		this.manifest = createEmptyRouteModuleBuildCacheManifest();
	}
}

function resolveOutputPath(outputPath: string, outdir: string): string {
	return path.isAbsolute(outputPath) ? outputPath : path.join(outdir, outputPath);
}
