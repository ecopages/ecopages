import type { ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import type { PagePackageResult } from '../../types/public-types.ts';

/**
 * Creates the structured page package consumed by final HTML injection.
 *
 * This first pass is intentionally behavior-preserving. It establishes the
 * packaging seam while forwarding the current flat processed asset list.
 */
export class PagePackagingService {
	/**
	 * Partitions processed assets into the page-level groups used during final
	 * HTML injection and post-processing.
	 */
	createPagePackage(assets: ProcessedAsset[]): PagePackageResult {
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

		const htmlAssets = assets.filter((asset) => this.shouldIncludeInHtml(asset));

		return {
			assets,
			htmlAssets,
			pageScript,
			pageStylesheet,
			inlineAssets,
			separateAssets,
			dynamicChunks,
		};
	}

	private shouldIncludeInHtml(asset: ProcessedAsset): boolean {
		if (asset.excludeFromHtml) {
			return false;
		}

		if (asset.packageRole === 'runtime') {
			return false;
		}

		return true;
	}
}
