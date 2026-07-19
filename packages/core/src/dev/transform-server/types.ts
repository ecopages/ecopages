import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';

export type DevTransformBundleResult = {
	code: string;
	dependencies?: string[];
};

export type DevTransformBundleContributor = {
	/** Returns whether this contributor owns the entrypoint source path. */
	ownsEntrypoint(entrypointPath: string): boolean;
	/** Bundles one browser entrypoint to ESM source served on demand. */
	bundleEntrypoint(entrypointPath: string): Promise<DevTransformBundleResult>;
};

export type DevTransformBundleContext = {
	srcDir: string;
	rootDir: string;
	plugins: EcoBuildPlugin[];
};
