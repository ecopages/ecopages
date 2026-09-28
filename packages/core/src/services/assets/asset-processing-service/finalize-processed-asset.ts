import type { ProcessedAsset } from './assets.types.ts';

/** Applies the public source URL to one processed asset when available. */
export function finalizeProcessedAsset(
	processed: ProcessedAsset,
	resolveProcessedAssetSrcUrl: (processed: ProcessedAsset) => string | undefined,
): ProcessedAsset {
	const srcUrl = resolveProcessedAssetSrcUrl(processed);
	return srcUrl ? { ...processed, srcUrl } : processed;
}
