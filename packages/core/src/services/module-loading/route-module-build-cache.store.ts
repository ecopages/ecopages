import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { PageModuleBuildImportOptions } from './page-module-import.service.ts';
import { RouteModuleDependencyHasher, type RouteModuleDependencyHashes } from './route-module-dependency-hasher.ts';
import {
	ROUTE_MODULE_BUILD_CACHE_FILENAME,
	createEmptyRouteModuleBuildCacheManifest,
	createPersistedRouteModuleBuildKey,
	getCorePackageVersion,
	normalizeRouteModuleCachePath,
	readRouteModuleBuildCacheManifest,
	shouldPersistRouteModuleBuildCache,
	writeRouteModuleBuildCacheManifest,
	type RouteModuleBuildCacheLookup,
	type RouteModuleBuildCacheManifest,
	type RouteModuleStaticRenderCacheContext,
} from './route-module-build-manifest.ts';
import {
	isProductionCacheManifestCurrent,
	matchesProductionCacheFingerprint,
} from '../../build/cache/production-build-cache.ts';

export type { RouteModuleDependencyHashes };

type RouteModuleBuildCacheDependencies = {
	readManifest: (manifestPath: string) => RouteModuleBuildCacheManifest | undefined;
	writeManifest: (manifestPath: string, manifest: RouteModuleBuildCacheManifest) => void;
	exists: (filePath: string) => boolean;
	getCorePackageVersion: () => string;
	createDependencyHasher: () => RouteModuleDependencyHasher;
};

/**
 * Persists route-module transpile and static-render metadata under one server outdir.
 */
export class RouteModuleBuildCache {
	private readonly manifestPath: string;
	private readonly dependencies: RouteModuleBuildCacheDependencies;
	private readonly dependencyHasher: RouteModuleDependencyHasher;
	private manifest: RouteModuleBuildCacheManifest | undefined;
	private manifestLoaded = false;

	constructor(outdir: string, dependencies?: Partial<RouteModuleBuildCacheDependencies>) {
		this.manifestPath = path.join(outdir, ROUTE_MODULE_BUILD_CACHE_FILENAME);
		this.dependencies = {
			readManifest: dependencies?.readManifest ?? readRouteModuleBuildCacheManifest,
			writeManifest: dependencies?.writeManifest ?? writeRouteModuleBuildCacheManifest,
			exists: dependencies?.exists ?? ((filePath) => fileSystem.exists(filePath)),
			getCorePackageVersion: dependencies?.getCorePackageVersion ?? getCorePackageVersion,
			createDependencyHasher: dependencies?.createDependencyHasher ?? (() => new RouteModuleDependencyHasher()),
		};
		this.dependencyHasher = this.dependencies.createDependencyHasher();
	}

	lookup(
		options: PageModuleBuildImportOptions & {
			fileHash: string;
		},
	): RouteModuleBuildCacheLookup | undefined {
		if (!shouldPersistRouteModuleBuildCache(options)) {
			return undefined;
		}

		const manifest = this.loadManifest();
		if (manifest.invalidationVersion !== this.dependencies.getCorePackageVersion()) {
			return undefined;
		}

		const buildKey = createPersistedRouteModuleBuildKey(options);
		const cacheFilePath = normalizeRouteModuleCachePath(options.filePath);
		const entry = manifest.entries[cacheFilePath];
		if (!entry || entry.sourceHash !== options.fileHash || entry.buildKey !== buildKey) {
			return undefined;
		}

		if (!this.dependencyHasher.matchesStoredHashes(entry.dependencyHashes, cacheFilePath, options.fileHash)) {
			return undefined;
		}

		const outputPath = path.isAbsolute(entry.outputPath)
			? entry.outputPath
			: path.join(options.outdir, entry.outputPath);

		if (!this.dependencies.exists(outputPath)) {
			return undefined;
		}

		return { outputPath, entry };
	}

	recordBuild(
		options: PageModuleBuildImportOptions & {
			fileHash: string;
			outputPath: string;
			dependencyModulePaths?: readonly string[];
		},
	): void {
		if (!shouldPersistRouteModuleBuildCache(options)) {
			return;
		}

		const cacheFilePath = normalizeRouteModuleCachePath(options.filePath);
		const dependencyModulePaths =
			options.dependencyModulePaths && options.dependencyModulePaths.length > 0
				? options.dependencyModulePaths
				: [cacheFilePath];
		const dependencyHashes = this.dependencyHasher.createDependencyHashes(dependencyModulePaths);
		dependencyHashes[cacheFilePath] = options.fileHash;

		const manifest = this.loadManifest();
		const existingEntry = manifest.entries[cacheFilePath];
		manifest.invalidationVersion = this.dependencies.getCorePackageVersion();
		manifest.entries[cacheFilePath] = {
			sourceHash: options.fileHash,
			outputPath: options.outputPath,
			builtAt: Date.now(),
			buildKey: createPersistedRouteModuleBuildKey(options),
			dependencyHashes,
			renderedOutputs: existingEntry?.renderedOutputs,
		};

		this.persistManifest(manifest);
	}

	isIncrementalStaticGenerationAvailable(context: RouteModuleStaticRenderCacheContext): boolean {
		if (process.env.NODE_ENV !== 'production') {
			return false;
		}

		const manifest = this.loadManifest();
		if (!isProductionCacheManifestCurrent(manifest, this.dependencies.getCorePackageVersion())) {
			return false;
		}

		return (
			manifest.configHash === context.configHash &&
			matchesProductionCacheFingerprint(manifest, context.buildInputsFingerprint)
		);
	}

	ensureIncrementalStaticGenerationContext(context: RouteModuleStaticRenderCacheContext): void {
		if (process.env.NODE_ENV !== 'production') {
			return;
		}

		const manifest = this.loadManifest();
		manifest.invalidationVersion = this.dependencies.getCorePackageVersion();
		manifest.configHash = context.configHash;
		manifest.buildInputsFingerprint = context.buildInputsFingerprint;
		this.persistManifest(manifest);
	}

	canReuseStaticRender(options: {
		sourceFile: string;
		pathname: string;
		renderedOutputPath: string;
		context: RouteModuleStaticRenderCacheContext;
		force?: boolean;
	}): boolean {
		if (options.force) {
			return false;
		}

		if (!fileSystem.exists(options.sourceFile)) {
			return false;
		}

		const sourceHash = fileSystem.hash(options.sourceFile);
		return this.lookupStaticRender({
			filePath: options.sourceFile,
			pathname: options.pathname,
			sourceHash,
			renderedOutputPath: options.renderedOutputPath,
			context: options.context,
		});
	}

	lookupStaticRender(options: {
		filePath: string;
		pathname: string;
		sourceHash: string;
		renderedOutputPath: string;
		context: RouteModuleStaticRenderCacheContext;
	}): boolean {
		if (!this.isIncrementalStaticGenerationAvailable(options.context)) {
			return false;
		}

		const manifest = this.loadManifest();
		const cacheFilePath = normalizeRouteModuleCachePath(options.filePath);
		const entry = manifest.entries[cacheFilePath];
		const renderedOutput = entry?.renderedOutputs?.[options.pathname];
		if (!entry || !renderedOutput) {
			return false;
		}

		if (entry.sourceHash !== options.sourceHash || renderedOutput.sourceHash !== options.sourceHash) {
			return false;
		}

		if (!this.dependencyHasher.matchesStoredHashes(entry.dependencyHashes, cacheFilePath, options.sourceHash)) {
			return false;
		}

		const cachedOutputPath = path.isAbsolute(renderedOutput.renderedOutputPath)
			? renderedOutput.renderedOutputPath
			: path.resolve(renderedOutput.renderedOutputPath);

		if (cachedOutputPath !== path.resolve(options.renderedOutputPath)) {
			return false;
		}

		return this.dependencies.exists(cachedOutputPath);
	}

	recordStaticRender(options: {
		filePath: string;
		pathname: string;
		sourceHash: string;
		renderedOutputPath: string;
		context: RouteModuleStaticRenderCacheContext;
	}): void {
		if (process.env.NODE_ENV !== 'production') {
			return;
		}

		const cacheFilePath = normalizeRouteModuleCachePath(options.filePath);
		const manifest = this.loadManifest();
		const existingEntry = manifest.entries[cacheFilePath];
		manifest.invalidationVersion = this.dependencies.getCorePackageVersion();
		manifest.configHash = options.context.configHash;
		manifest.buildInputsFingerprint = options.context.buildInputsFingerprint;
		manifest.entries[cacheFilePath] = {
			sourceHash: options.sourceHash,
			outputPath: existingEntry?.outputPath ?? '',
			builtAt: existingEntry?.builtAt ?? Date.now(),
			buildKey: existingEntry?.buildKey ?? '',
			dependencyHashes: existingEntry?.dependencyHashes,
			renderedOutputs: {
				...(existingEntry?.renderedOutputs ?? {}),
				[options.pathname]: {
					renderedOutputPath: options.renderedOutputPath,
					renderedAt: Date.now(),
					sourceHash: options.sourceHash,
				},
			},
		};

		this.persistManifest(manifest);
	}

	resetMemory(): void {
		this.manifest = undefined;
		this.manifestLoaded = false;
	}

	pruneStaleRenderedOutputs(activePathnames: ReadonlySet<string>): string[] {
		if (process.env.NODE_ENV !== 'production') {
			return [];
		}

		const manifest = this.loadManifest();
		const removedOutputPaths: string[] = [];

		for (const entry of Object.values(manifest.entries)) {
			if (!entry.renderedOutputs) {
				continue;
			}

			for (const [pathname, renderedOutput] of Object.entries(entry.renderedOutputs)) {
				if (activePathnames.has(pathname)) {
					continue;
				}

				removedOutputPaths.push(renderedOutput.renderedOutputPath);
				delete entry.renderedOutputs[pathname];
			}
		}

		if (removedOutputPaths.length > 0) {
			this.persistManifest(manifest);
		}

		return removedOutputPaths;
	}

	private loadManifest(): RouteModuleBuildCacheManifest {
		if (this.manifestLoaded) {
			return this.manifest ?? createEmptyRouteModuleBuildCacheManifest();
		}

		this.manifestLoaded = true;
		this.manifest = this.dependencies.readManifest(this.manifestPath) ?? createEmptyRouteModuleBuildCacheManifest();
		return this.manifest;
	}

	private persistManifest(manifest: RouteModuleBuildCacheManifest): void {
		this.manifest = manifest;
		this.dependencies.writeManifest(this.manifestPath, manifest);
	}
}
