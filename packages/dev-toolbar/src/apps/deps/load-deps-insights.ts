import type { DevManifestAsset, EcoDevManifest } from '../../api/manifest-contract.ts';
import { readDevManifestFromDocument } from '../../api/dev-manifest.ts';

const LARGE_VENDOR_BYTES = 100_000;

/** Most files followed from one vendor entry, so a package with a huge module tree does not flood the dev server. */
const MAX_VENDOR_GRAPH_FILES = 300;

export type AssetInsight = {
	label: string;
	srcUrl: string;
	bytes: number | null;
	category: 'entry' | 'chunk' | 'vendor' | 'dev-transform';
	warning?: string;
};

export type DepsInsightsSnapshot = {
	entryCount: number;
	chunkCount: number;
	vendorCount: number;
	insights: AssetInsight[];
};

async function fetchAssetBytes(url: string): Promise<number | null> {
	try {
		const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
		const length = response.headers.get('content-length');
		return length ? Number.parseInt(length, 10) : null;
	} catch {
		return null;
	}
}

function dedupeAssets(assets: DevManifestAsset[]): DevManifestAsset[] {
	const seen = new Set<string>();
	const result: DevManifestAsset[] = [];
	for (const asset of assets) {
		if (!asset.srcUrl || seen.has(asset.srcUrl)) {
			continue;
		}
		seen.add(asset.srcUrl);
		result.push(asset);
	}
	return result;
}

function manifestAssets(manifest: EcoDevManifest | undefined): AssetInsight[] {
	if (!manifest) {
		return [];
	}

	const insights: AssetInsight[] = [];
	for (const asset of manifest.pageBrowserGraph?.entryAssets ?? []) {
		if (asset.srcUrl) {
			insights.push({ label: asset.srcUrl, srcUrl: asset.srcUrl, bytes: null, category: 'entry' });
		}
	}
	for (const asset of manifest.pageBrowserGraph?.chunkAssets ?? []) {
		if (asset.srcUrl) {
			insights.push({
				label: asset.srcUrl,
				srcUrl: asset.srcUrl,
				bytes: null,
				category: 'chunk',
				warning: 'Lazy chunk referenced by this page',
			});
		}
	}
	for (const url of manifest.vendorUrls) {
		insights.push({ label: url, srcUrl: url, bytes: null, category: 'vendor' });
	}
	for (const url of manifest.devTransformUrls) {
		insights.push({ label: url, srcUrl: url, bytes: null, category: 'dev-transform' });
	}
	return insights;
}

/**
 * Loads dependency insights for the current route from the dev manifest.
 *
 * @remarks Fetches `Content-Length` via parallel `HEAD` requests. Large vendor bundles receive a warning heuristic.
 */
/**
 * The size of a vendor entry and the files it imports, in bytes.
 *
 * @remarks
 * The dev server serves each module of a package as its own file, so the entry is a small file that imports the
 * rest and its own size says nothing about the weight of the package. The files are read with `GET` to find their
 * relative imports, up to {@link MAX_VENDOR_GRAPH_FILES}; `null` when the entry cannot be read.
 */
async function fetchVendorGraphBytes(entryUrl: string): Promise<number | null> {
	const seen = new Set<string>();
	const pending = [new URL(entryUrl, document.baseURI).href];
	let bytes = 0;
	while (pending.length > 0 && seen.size < MAX_VENDOR_GRAPH_FILES) {
		const url = pending.pop()!;
		if (seen.has(url)) continue;
		seen.add(url);
		try {
			const response = await fetch(url, { cache: 'no-store' });
			if (!response.ok) return seen.size === 1 ? null : bytes;
			const code = await response.text();
			bytes += new TextEncoder().encode(code).length;
			for (const match of code.matchAll(/(?:from|import)\s*\(?\s*["'](\.\.?\/[^"']+)["']/gu)) {
				pending.push(new URL(match[1]!, url).href);
			}
		} catch {
			return seen.size === 1 ? null : bytes;
		}
	}
	return bytes;
}

export async function loadDepsInsights(doc: Document): Promise<DepsInsightsSnapshot> {
	const manifest = readDevManifestFromDocument(doc);
	const insights = manifestAssets(manifest);
	const uniqueInsights = insights.filter(
		(item, index, array) => array.findIndex((candidate) => candidate.srcUrl === item.srcUrl) === index,
	);

	await Promise.all(
		uniqueInsights.map(async (insight) => {
			insight.bytes =
				insight.category === 'vendor'
					? await fetchVendorGraphBytes(insight.srcUrl)
					: await fetchAssetBytes(insight.srcUrl);
			if (insight.category === 'vendor' && insight.bytes !== null && insight.bytes >= LARGE_VENDOR_BYTES) {
				insight.warning = 'Large vendor loaded eagerly — consider lazy loading';
			}
		}),
	);

	const graph = manifest?.pageBrowserGraph;
	return {
		entryCount: dedupeAssets(graph?.entryAssets ?? []).length,
		chunkCount: dedupeAssets(graph?.chunkAssets ?? []).length,
		vendorCount: manifest?.vendorUrls.length ?? 0,
		insights: uniqueInsights,
	};
}
