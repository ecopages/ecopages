import type { ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';

export function dedupeProcessedAssets(assets: ProcessedAsset[]): ProcessedAsset[] {
	const unique = new Map<string, ProcessedAsset>();

	for (const asset of assets) {
		const key = [
			asset.kind,
			asset.position ?? '',
			asset.srcUrl ?? '',
			asset.filepath ?? '',
			asset.content ?? '',
			asset.inline ? 'inline' : 'external',
			asset.excludeFromHtml ? 'excluded' : 'included',
			asset.packageRole ?? '',
			JSON.stringify(asset.attributes ?? {}),
		].join('|');

		if (!unique.has(key)) {
			unique.set(key, asset);
		}
	}

	return [...unique.values()];
}
