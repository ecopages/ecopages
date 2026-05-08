import type { PagePackageResult } from '../../../types/public-types.ts';
import type { ProcessedAsset } from './assets.types.ts';

export function createPagePackage(assets: ProcessedAsset[]): PagePackageResult {
	const inlineAssets: ProcessedAsset[] = [];
	const separateAssets: ProcessedAsset[] = [];
	const dynamicChunks: ProcessedAsset[] = [];
	let pageScript: ProcessedAsset | undefined;
	let pageStylesheet: ProcessedAsset | undefined;

	for (const asset of assets) {
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
		assets,
		htmlAssets: assets.filter(shouldIncludeInHtml),
		pageScript,
		pageStylesheet,
		inlineAssets,
		separateAssets,
		dynamicChunks,
	};
}

function shouldIncludeInHtml(asset: ProcessedAsset): boolean {
	if (asset.excludeFromHtml) {
		return false;
	}

	if (asset.packageRole === 'runtime') {
		return false;
	}

	return true;
}