/** DOM id core uses when injecting `#__ECO_DEV_MANIFEST__` during watch mode. */
export const DEV_MANIFEST_ELEMENT_ID = '__ECO_DEV_MANIFEST__';

export type DevManifestAsset = {
	srcUrl?: string;
	kind: 'script' | 'stylesheet';
	packageRole?: string;
	inline?: boolean;
};

export type DevManifestPageBrowserGraph = {
	entryAssets: DevManifestAsset[];
	chunkAssets: DevManifestAsset[];
};

/**
 * Server-serialized development metadata injected into HTML responses.
 */
export type EcoDevManifest = {
	route: string;
	integration?: string;
	pageBrowserGraph?: DevManifestPageBrowserGraph;
	vendorUrls: string[];
	devTransformUrls: string[];
};
