import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';

export type DevTransformBundleResult = {
	code: string;
	dependencies?: string[];
};

export type DevTransformBundleContributor = {
	/** Returns whether this contributor owns the source module path. */
	ownsModule(sourcePath: string): boolean;
	/** Integration-owned plugins for one dev-transform module (boundary, MDX, etc.). */
	getModulePlugins(sourcePath: string): Promise<readonly EcoBuildPlugin[]>;
	/** Runtime manifest specifiers already served from `/assets/vendors/*`. */
	getRuntimeSpecifierMap?(): ReadonlyMap<string, string>;
	/** Plugins applied to lazy vendor prebundles (client-graph boundary, runtime rewrites). */
	getVendorBundlePlugins?(): Promise<readonly EcoBuildPlugin[]>;
};
