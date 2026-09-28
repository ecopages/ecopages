/**
 * Browser-local mirror of `@ecopages/core/dev-toolbar/dev-toolbar-manifest-contract`.
 *
 * @remarks Dev-toolbar is browser-bundled separately; Rolldown cannot resolve core
 * package export subpaths from the client entry. Keep in sync with core via
 * `manifest-contract.test.ts`.
 */
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

export type EcoDevManifest = {
	route: string;
	integration?: string;
	pageBrowserGraph?: DevManifestPageBrowserGraph;
	vendorUrls: string[];
	devTransformUrls: string[];
};
