import path from 'node:path';

/**
 * Maps source dependency paths to rendered HTML cache keys for selective invalidation.
 */
export class HtmlPageCacheDependencyIndex {
	private readonly sourcePathToCacheKeys = new Map<string, Set<string>>();
	private readonly cacheKeyToSourcePaths = new Map<string, Set<string>>();

	/**
	 * Records which source paths contributed to one cached HTML entry.
	 */
	register(cacheKey: string, sourcePaths: readonly string[]): void {
		this.unregister(cacheKey);

		if (sourcePaths.length === 0) {
			return;
		}

		const normalizedSourcePaths = new Set(sourcePaths.map((sourcePath) => normalizeSourcePath(sourcePath)));
		this.cacheKeyToSourcePaths.set(cacheKey, normalizedSourcePaths);

		for (const sourcePath of normalizedSourcePaths) {
			const cacheKeys = this.sourcePathToCacheKeys.get(sourcePath) ?? new Set<string>();
			cacheKeys.add(cacheKey);
			this.sourcePathToCacheKeys.set(sourcePath, cacheKeys);
		}
	}

	/**
	 * Removes dependency metadata for one cache key.
	 */
	unregister(cacheKey: string): void {
		const sourcePaths = this.cacheKeyToSourcePaths.get(cacheKey);
		if (!sourcePaths) {
			return;
		}

		for (const sourcePath of sourcePaths) {
			const cacheKeys = this.sourcePathToCacheKeys.get(sourcePath);
			cacheKeys?.delete(cacheKey);
			if (cacheKeys?.size === 0) {
				this.sourcePathToCacheKeys.delete(sourcePath);
			}
		}

		this.cacheKeyToSourcePaths.delete(cacheKey);
	}

	/**
	 * Returns cache keys that depend on any of the given source paths.
	 */
	resolveCacheKeysForSourcePaths(sourcePaths: readonly string[]): string[] {
		const cacheKeys = new Set<string>();

		for (const sourcePath of sourcePaths) {
			const normalizedSourcePath = normalizeSourcePath(sourcePath);
			const matches = this.sourcePathToCacheKeys.get(normalizedSourcePath);
			if (!matches) {
				continue;
			}

			for (const cacheKey of matches) {
				cacheKeys.add(cacheKey);
			}
		}

		return [...cacheKeys];
	}

	clear(): void {
		this.sourcePathToCacheKeys.clear();
		this.cacheKeyToSourcePaths.clear();
	}
}

function normalizeSourcePath(sourcePath: string): string {
	return path.resolve(sourcePath);
}

type CollectHtmlCacheSourceDependencyPathsInput = {
	routeFile: string;
	processedAssets: readonly { sourceFilepath?: string; bundledSourceFilepaths?: readonly string[] }[];
	graphDependencyPaths?: ReadonlySet<string>;
	additionalSourcePaths?: readonly string[];
};

/**
 * Merges route, graph, processed-asset, and caller-supplied source paths for HTML cache invalidation.
 */
export function collectHtmlCacheSourceDependencyPaths(input: CollectHtmlCacheSourceDependencyPathsInput): string[] {
	const sourcePaths = new Set<string>([normalizeSourcePath(input.routeFile)]);

	for (const additionalPath of input.additionalSourcePaths ?? []) {
		sourcePaths.add(normalizeSourcePath(additionalPath));
	}

	if (input.graphDependencyPaths) {
		for (const graphPath of input.graphDependencyPaths) {
			sourcePaths.add(normalizeSourcePath(graphPath));
		}
	}

	for (const asset of input.processedAssets) {
		if (asset.sourceFilepath) {
			sourcePaths.add(normalizeSourcePath(asset.sourceFilepath));
		}

		for (const bundledSourceFilepath of asset.bundledSourceFilepaths ?? []) {
			sourcePaths.add(normalizeSourcePath(bundledSourceFilepath));
		}
	}

	return [...sourcePaths];
}
