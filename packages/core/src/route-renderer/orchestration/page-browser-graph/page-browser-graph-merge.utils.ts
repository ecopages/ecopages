import { createPagePackage, type ProcessedAsset } from '../../../services/assets/asset-processing-service/index.ts';
import type { PageBrowserGraphResult, PagePackageResult } from '../../../types/public-types.ts';
import { buildProcessedAssetDedupeKey } from './processed-asset-dedupe.ts';

export type PageBrowserGraphMergeHost = {
	getPagePackage(): PagePackageResult | undefined;
	getProcessedDependencies(): ProcessedAsset[];
	dedupeProcessedAssets(assets: readonly ProcessedAsset[]): ProcessedAsset[];
	setPagePackage(pagePackage: PagePackageResult): void;
};

/**
 * Merges a page browser graph into the active HTML transformer page package.
 *
 * Deduplicates entry/chunk assets against the existing package and rebuilds the
 * package so downstream HTML finalization sees one canonical graph.
 */
export function mergePageBrowserGraphIntoPagePackage(
	host: PageBrowserGraphMergeHost,
	pageBrowserGraph?: PageBrowserGraphResult,
): PageBrowserGraphResult | undefined {
	if (!pageBrowserGraph) {
		return undefined;
	}

	const currentPagePackage = host.getPagePackage();
	const mergedPageBrowserGraph = currentPagePackage?.pageBrowserGraph
		? {
				entryAssets: host.dedupeProcessedAssets([
					...currentPagePackage.pageBrowserGraph.entryAssets,
					...pageBrowserGraph.entryAssets,
				]),
				chunkAssets: host.dedupeProcessedAssets([
					...currentPagePackage.pageBrowserGraph.chunkAssets,
					...pageBrowserGraph.chunkAssets,
				]),
			}
		: pageBrowserGraph;
	const pageBrowserGraphAssetKeys = new Set(
		[...mergedPageBrowserGraph.entryAssets, ...mergedPageBrowserGraph.chunkAssets].map((asset) =>
			buildProcessedAssetDedupeKey(asset),
		),
	);
	const baseAssets = currentPagePackage
		? currentPagePackage.assets.filter(
				(asset) => !pageBrowserGraphAssetKeys.has(buildProcessedAssetDedupeKey(asset)),
			)
		: host.getProcessedDependencies();

	host.setPagePackage(
		createPagePackage(host.dedupeProcessedAssets(baseAssets), {
			pageBrowserGraph: mergedPageBrowserGraph,
		}),
	);

	return mergedPageBrowserGraph;
}
