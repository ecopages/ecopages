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

export function createPagePackage(
	assets: ProcessedAsset[],
	options: { pageBrowserGraph?: PageBrowserGraphResult } = {},
): PagePackageResult {
	const allAssets = [
		...assets,
		...(options.pageBrowserGraph?.entryAssets ?? []),
		...(options.pageBrowserGraph?.chunkAssets ?? []),
	];
	const inlineAssets: ProcessedAsset[] = [];
	const separateAssets: ProcessedAsset[] = [];
	const dynamicChunks: ProcessedAsset[] = [];
	let pageScript: ProcessedAsset | undefined;
	let pageStylesheet: ProcessedAsset | undefined;
	const suppressedSourceFilepaths = getSuppressedSourceFilepaths(allAssets);

	for (const asset of allAssets) {
		if (asset.inline) {
			inlineAssets.push(asset);
			continue;
		}

		if (asset.packageRole === 'dynamic-chunk') {
			dynamicChunks.push(asset);
			continue;
		}

		if (!pageScript && asset.packageRole === 'page-script') {
			pageScript = asset;
			continue;
		}

		if (!pageStylesheet && asset.packageRole === 'page-style') {
			pageStylesheet = asset;
			continue;
		}

		if (asset.packageRole === 'keep-separate' || asset.packageRole === 'runtime') {
			separateAssets.push(asset);
			continue;
		}

		if (!pageScript && asset.kind === 'script' && !asset.excludeFromHtml) {
			pageScript = asset;
			continue;
		}

		if (!pageStylesheet && asset.kind === 'stylesheet') {
			pageStylesheet = asset;
			continue;
		}

		separateAssets.push(asset);
	}

	return {
		assets: allAssets,
		pageBrowserGraph: options.pageBrowserGraph,
		htmlAssets: allAssets.filter((asset) => shouldIncludeInHtml(asset, suppressedSourceFilepaths)),
		pageScript,
		pageStylesheet,
		inlineAssets,
		separateAssets,
		dynamicChunks,
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
