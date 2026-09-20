import type { PagePackageResult } from '../../../types/public-types.ts';
import type { ProcessedAsset } from './assets.types.ts';
import type { PageBrowserGraphResult } from '../../../types/public-types.ts';

function getSuppressedSourceFilepaths(assets: ProcessedAsset[]): Set<string> {
	const suppressed = new Set<string>();

	for (const asset of assets) {
		if (
			(asset.packageRole === 'page-style' || asset.packageRole === 'page-script') &&
			Array.isArray(asset.bundledSourceFilepaths)
		) {
			for (const filepath of asset.bundledSourceFilepaths) {
				suppressed.add(filepath);
			}
		}
	}

	return suppressed;
}

type PagePackageBuckets = {
	inlineAssets: ProcessedAsset[];
	separateAssets: ProcessedAsset[];
	dynamicChunks: ProcessedAsset[];
	pageScript?: ProcessedAsset;
	pageStylesheet?: ProcessedAsset;
};

function classifyProcessedAsset(asset: ProcessedAsset, buckets: PagePackageBuckets): void {
	if (asset.inline) {
		buckets.inlineAssets.push(asset);
		return;
	}

	if (asset.packageRole === 'dynamic-chunk') {
		buckets.dynamicChunks.push(asset);
		return;
	}

	if (!buckets.pageScript && asset.packageRole === 'page-script') {
		buckets.pageScript = asset;
		return;
	}

	if (!buckets.pageStylesheet && asset.packageRole === 'page-style') {
		buckets.pageStylesheet = asset;
		return;
	}

	if (asset.packageRole === 'keep-separate' || asset.packageRole === 'runtime') {
		buckets.separateAssets.push(asset);
		return;
	}

	if (!buckets.pageScript && asset.kind === 'script' && !asset.excludeFromHtml) {
		buckets.pageScript = asset;
		return;
	}

	if (!buckets.pageStylesheet && asset.kind === 'stylesheet') {
		buckets.pageStylesheet = asset;
		return;
	}

	buckets.separateAssets.push(asset);
}

export function createPagePackage(
	assets: ProcessedAsset[],
	options: { pageBrowserGraph?: PageBrowserGraphResult } = {},
): PagePackageResult {
	const allAssets = [
		...assets,
		...(options.pageBrowserGraph?.entryAssets ?? []),
		...(options.pageBrowserGraph?.chunkAssets ?? []),
	];
	const buckets: PagePackageBuckets = {
		inlineAssets: [],
		separateAssets: [],
		dynamicChunks: [],
	};
	const suppressedSourceFilepaths = getSuppressedSourceFilepaths(allAssets);

	for (const asset of allAssets) {
		classifyProcessedAsset(asset, buckets);
	}

	return {
		assets: allAssets,
		pageBrowserGraph: options.pageBrowserGraph,
		htmlAssets: allAssets.filter((asset) => shouldIncludeInHtml(asset, suppressedSourceFilepaths)),
		pageScript: buckets.pageScript,
		pageStylesheet: buckets.pageStylesheet,
		inlineAssets: buckets.inlineAssets,
		separateAssets: buckets.separateAssets,
		dynamicChunks: buckets.dynamicChunks,
	};
}

function shouldIncludeInHtml(asset: ProcessedAsset, suppressedSourceFilepaths: Set<string>): boolean {
	if (asset.excludeFromHtml) {
		return false;
	}

	if (asset.packageRole === 'runtime') {
		return false;
	}

	if (asset.sourceFilepath && suppressedSourceFilepaths.has(asset.sourceFilepath)) {
		return false;
	}

	return true;
}
