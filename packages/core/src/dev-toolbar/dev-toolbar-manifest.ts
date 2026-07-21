import type { PagePackageResult } from '../types/public-types.ts';
import type { ProcessedAsset } from '../services/assets/asset-processing-service/assets.types.ts';
import { DEV_TRANSFORM_URL_PREFIX, VENDOR_URL_PREFIX } from '../hmr/hmr-asset-paths.ts';

export {
	DEV_MANIFEST_ELEMENT_ID,
	type DevManifestAsset as DevToolbarManifestAsset,
	type EcoDevManifest as DevToolbarManifestPayload,
} from '@ecopages/dev-toolbar/manifest';

import { DEV_MANIFEST_ELEMENT_ID, type DevManifestAsset, type EcoDevManifest } from '@ecopages/dev-toolbar/manifest';

function serializeAsset(asset: ProcessedAsset): DevManifestAsset | undefined {
	if (!asset.srcUrl) {
		return undefined;
	}

	return {
		srcUrl: asset.srcUrl,
		kind: asset.kind,
		packageRole: asset.packageRole,
		inline: asset.inline,
	};
}

function collectUrlsFromAssets(assets: ProcessedAsset[], prefix: string): string[] {
	const urls = new Set<string>();
	for (const asset of assets) {
		if (asset.srcUrl?.startsWith(prefix)) {
			urls.add(asset.srcUrl);
		}
	}
	return [...urls];
}

/**
 * Builds the dev toolbar manifest payload for one rendered page.
 */
export function buildDevToolbarManifestPayload(input: {
	routeFile: string;
	integrationName?: string;
	pagePackage?: PagePackageResult;
}): EcoDevManifest {
	const assets = input.pagePackage?.assets ?? [];
	const graph = input.pagePackage?.pageBrowserGraph;

	return {
		route: input.routeFile,
		integration: input.integrationName,
		pageBrowserGraph: graph
			? {
					entryAssets: graph.entryAssets
						.map((asset) => serializeAsset(asset))
						.filter((asset): asset is DevManifestAsset => asset !== undefined),
					chunkAssets: graph.chunkAssets
						.map((asset) => serializeAsset(asset))
						.filter((asset): asset is DevManifestAsset => asset !== undefined),
				}
			: undefined,
		vendorUrls: collectUrlsFromAssets(assets, VENDOR_URL_PREFIX),
		devTransformUrls: collectUrlsFromAssets(assets, DEV_TRANSFORM_URL_PREFIX),
	};
}

/**
 * Serializes the dev toolbar manifest as an HTML contribution snippet.
 */
export function serializeDevToolbarManifestScript(payload: EcoDevManifest): string {
	return `<script type="application/json" id="${DEV_MANIFEST_ELEMENT_ID}">${JSON.stringify(payload)}</script>`;
}
