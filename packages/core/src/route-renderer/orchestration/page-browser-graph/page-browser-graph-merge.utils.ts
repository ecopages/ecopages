import { createPagePackage, type ProcessedAsset } from '../../../services/assets/asset-processing-service/index.ts';
import type { PageBrowserGraphResult, PagePackageResult } from '../../../types/public-types.ts';
import { buildProcessedAssetDedupeKey, dedupeProcessedAssets } from './processed-asset-dedupe.ts';

/**
 * Merges a page browser graph into an existing page package (or processed dependencies).
 *
 * Deduplicates entry/chunk assets against the existing package and rebuilds the
 * package so downstream HTML finalization sees one canonical graph.
 */
export function mergePageBrowserGraph(
	currentPagePackage: PagePackageResult | undefined,
	processedDependencies: ProcessedAsset[],
	pageBrowserGraph: PageBrowserGraphResult,
): { pagePackage: PagePackageResult; mergedGraph: PageBrowserGraphResult } {
	const mergedGraph = currentPagePackage?.pageBrowserGraph
		? {
				entryAssets: dedupeProcessedAssets([
					...currentPagePackage.pageBrowserGraph.entryAssets,
					...pageBrowserGraph.entryAssets,
				]),
				chunkAssets: dedupeProcessedAssets([
					...currentPagePackage.pageBrowserGraph.chunkAssets,
					...pageBrowserGraph.chunkAssets,
				]),
			}
		: pageBrowserGraph;
	const pageBrowserGraphAssetKeys = new Set(
		[...mergedGraph.entryAssets, ...mergedGraph.chunkAssets].map((asset) => buildProcessedAssetDedupeKey(asset)),
	);
	const baseAssets = currentPagePackage
		? currentPagePackage.assets.filter(
				(asset) => !pageBrowserGraphAssetKeys.has(buildProcessedAssetDedupeKey(asset)),
			)
		: processedDependencies;

	return {
		pagePackage: createPagePackage(dedupeProcessedAssets(baseAssets), {
			pageBrowserGraph: mergedGraph,
		}),
		mergedGraph,
	};
}
