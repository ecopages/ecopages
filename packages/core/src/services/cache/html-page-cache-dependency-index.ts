import path from 'node:path';
import { collectedLoadedBuildInputs } from '../../build/cache/build-input-dependency-index.ts';

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

	for (const additionalPath of [...(input.additionalSourcePaths ?? []), ...collectedLoadedBuildInputs()]) {
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
