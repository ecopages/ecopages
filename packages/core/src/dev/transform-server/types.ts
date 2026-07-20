import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';

export type DevTransformBundleResult = {
	code: string;
	dependencies?: string[];
};

export type DevTransformBundleContributor = {
	/** Returns whether this contributor owns the entrypoint source path. */
	ownsEntrypoint(entrypointPath: string): boolean;
	/** Integration-owned plugins for one page entrypoint (boundary, MDX, etc.). */
	getPageBuildPlugins(entrypointPath: string): Promise<readonly EcoBuildPlugin[]>;
};
