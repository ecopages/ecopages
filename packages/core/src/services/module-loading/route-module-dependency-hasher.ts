import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { BuildResult } from '../../build/build-adapter.ts';

/**
 * Content hashes for every trackable source file in one route module's import graph.
 *
 * @remarks
 * Keys are normalized absolute filesystem paths. Values are opaque content hashes
 * produced by the active {@link FileSystem} implementation. Only app-owned source
 * files are tracked; `node:` builtins and `node_modules` paths are excluded
 * because they are covered by the core package {@link getCorePackageVersion | invalidation version}.
 */
export type RouteModuleDependencyHashes = Record<string, string>;

type HashFileFn = (filePath: string) => string;
type ExistsFn = (filePath: string) => boolean;

/**
 * Lazily hashes route-module dependency files while memoizing results for one build run.
 *
 * @remarks
 * Multiple route modules often share layouts or utilities. Memoizing per path avoids
 * re-reading the same dependency file while validating or recording many cache entries
 * during one production build.
 */
export class RouteModuleDependencyHasher {
	private readonly memo = new Map<string, string>();
	private readonly hashFile: HashFileFn;
	private readonly exists: ExistsFn;

	constructor(dependencies?: { hashFile?: HashFileFn; exists?: ExistsFn }) {
		this.hashFile = dependencies?.hashFile ?? ((filePath) => fileSystem.hash(filePath));
		this.exists = dependencies?.exists ?? ((filePath) => fileSystem.exists(filePath));
	}

	/**
	 * Returns a memoized content hash for one trackable dependency path.
	 *
	 * @param filePath - Absolute or project-relative source path.
	 * @returns The content hash, or `undefined` when the path is not trackable or missing.
	 */
	hashDependency(filePath: string): string | undefined {
		const normalizedPath = path.normalize(filePath);
		if (!isTrackableRouteModuleDependency(normalizedPath)) {
			return undefined;
		}

		if (!this.exists(normalizedPath)) {
			return undefined;
		}

		const cachedHash = this.memo.get(normalizedPath);
		if (cachedHash) {
			return cachedHash;
		}

		const nextHash = this.hashFile(normalizedPath);
		this.memo.set(normalizedPath, nextHash);
		return nextHash;
	}

	/**
	 * Builds the dependency-hash map for one route entrypoint graph.
	 *
	 * @param modulePaths - Raw module ids from the bundler dependency graph.
	 * @returns Hashes for every trackable, existing source file in the graph.
	 */
	createDependencyHashes(modulePaths: readonly string[]): RouteModuleDependencyHashes {
		const dependencyHashes: RouteModuleDependencyHashes = {};

		for (const modulePath of filterTrackableRouteModuleDependencies(modulePaths)) {
			const dependencyHash = this.hashDependency(modulePath);
			if (dependencyHash) {
				dependencyHashes[modulePath] = dependencyHash;
			}
		}

		return dependencyHashes;
	}

	/**
	 * Returns whether every stored dependency hash still matches the current file contents.
	 *
	 * @param storedHashes - Dependency hashes previously persisted for one route module.
	 * @param entrypointPath - Route entry file whose hash is validated separately.
	 * @param entrypointSourceHash - Already-validated content hash for {@link entrypointPath}.
	 * @returns `true` when all stored hashes are present and still valid.
	 */
	matchesStoredHashes(
		storedHashes: RouteModuleDependencyHashes | undefined,
		entrypointPath?: string,
		entrypointSourceHash?: string,
	): boolean {
		if (!storedHashes || Object.keys(storedHashes).length === 0) {
			return false;
		}

		const normalizedEntrypoint = entrypointPath ? path.normalize(entrypointPath) : undefined;

		for (const [dependencyPath, storedHash] of Object.entries(storedHashes)) {
			if (normalizedEntrypoint && path.normalize(dependencyPath) === normalizedEntrypoint) {
				if (entrypointSourceHash && storedHash !== entrypointSourceHash) {
					return false;
				}
				continue;
			}

			const currentHash = this.hashDependency(dependencyPath);
			if (!currentHash || currentHash !== storedHash) {
				return false;
			}
		}

		return true;
	}

	/** Clears the per-build memo. Intended for unit tests only. */
	clearMemoForTests(): void {
		this.memo.clear();
	}
}

/**
 * Returns whether a bundler module id should participate in route-module cache invalidation.
 *
 * @remarks
 * Builtins and installed packages are excluded. Their changes are expected to be
 * reflected through framework-level invalidation instead of per-route file hashing.
 */
export function isTrackableRouteModuleDependency(modulePath: string): boolean {
	const normalizedPath = path.normalize(modulePath);
	if (normalizedPath.startsWith('node:')) {
		return false;
	}

	if (normalizedPath.includes(`${path.sep}node_modules${path.sep}`)) {
		return false;
	}

	return /\.(?:[cm]?[jt]sx?|mdx)$/iu.test(normalizedPath) || normalizedPath.endsWith('.json');
}

/**
 * Filters a bundler module list down to trackable app-owned source files.
 */
export function filterTrackableRouteModuleDependencies(modulePaths: readonly string[]): string[] {
	const uniquePaths = new Set<string>();

	for (const modulePath of modulePaths) {
		const normalizedPath = path.normalize(modulePath);
		if (isTrackableRouteModuleDependency(normalizedPath)) {
			uniquePaths.add(normalizedPath);
		}
	}

	return Array.from(uniquePaths).sort();
}

/**
 * Resolves the dependency module list for one route entrypoint from a build result.
 *
 * @param buildResult - Completed route-module build output.
 * @param entrypointPath - Absolute or root-relative route source path used as the build entry.
 * @param rootDir - Project root used to normalize relative module ids.
 * @returns Normalized module paths, falling back to the entrypoint when no graph is available.
 */
export function resolveRouteModuleDependencyPaths(
	buildResult: Pick<BuildResult, 'dependencyGraph'>,
	entrypointPath: string,
	rootDir: string,
): string[] {
	const normalizedEntrypoint = path.isAbsolute(entrypointPath)
		? path.normalize(entrypointPath)
		: path.normalize(path.resolve(rootDir, entrypointPath));

	const graphEntrypoints = buildResult.dependencyGraph?.entrypoints ?? {};
	const dependencyPaths =
		graphEntrypoints[normalizedEntrypoint] ??
		graphEntrypoints[entrypointPath] ??
		Object.entries(graphEntrypoints).find(([candidate]) => path.normalize(candidate) === normalizedEntrypoint)?.[1];

	if (!dependencyPaths || dependencyPaths.length === 0) {
		return [normalizedEntrypoint];
	}

	return dependencyPaths.map((dependencyPath) =>
		path.isAbsolute(dependencyPath)
			? path.normalize(dependencyPath)
			: path.normalize(path.resolve(rootDir, dependencyPath)),
	);
}

/**
 * Convenience helper that combines graph extraction and dependency hashing.
 */
export function createRouteModuleDependencyHashes(
	hasher: RouteModuleDependencyHasher,
	buildResult: Pick<BuildResult, 'dependencyGraph'>,
	entrypointPath: string,
	rootDir: string,
): RouteModuleDependencyHashes {
	return hasher.createDependencyHashes(resolveRouteModuleDependencyPaths(buildResult, entrypointPath, rootDir));
}
