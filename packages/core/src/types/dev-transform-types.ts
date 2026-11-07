import type { EcoBuildPlugin } from './build-types.ts';

export type DevTransformBundleResult = {
	code: string;
	/** Files whose edit invalidates the module: its imports and the files its plugins inlined. */
	dependencies?: string[];
};

/** Bare specifiers a contributor's generated browser modules import, and where they resolve from. */
export type DevTransformVendorEntries = {
	/**
	 * A directory inside the contributing package, such as the folder of the contributor's own module.
	 *
	 * @remarks
	 * The specifiers resolve from it, as an import in the package would, so a dependency only that package declares
	 * resolves under a strict install.
	 */
	resolveFrom: string;
	specifiers: readonly string[];
};

export type DevTransformBundleContributor = {
	/** Returns whether this contributor owns the source module path. */
	ownsModule(sourcePath: string): boolean;
	/** Integration-owned plugins for one dev-transform module (boundary, MDX, etc.). */
	getModulePlugins(sourcePath: string): Promise<readonly EcoBuildPlugin[]>;
	/**
	 * Bare specifiers the contributor's generated browser modules import, such as a hydration bootstrap's
	 * framework packages.
	 *
	 * @remarks
	 * They join the vendor graph before its first build, so the build that serves the first page already holds
	 * them and later builds do not move a module the page loaded into a new chunk.
	 */
	getVendorEntries?(): DevTransformVendorEntries;
	/** Plugins applied to lazy vendor prebundles, such as the client-graph boundary. */
	getVendorBundlePlugins?(): Promise<readonly EcoBuildPlugin[]>;
};
