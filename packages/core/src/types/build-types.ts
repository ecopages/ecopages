/**
 * Arguments passed to a build plugin `onResolve` callback.
 */
export type EcoBuildOnResolveArgs = {
	path: string;
	importer?: string;
};

/**
 * Result returned by a build plugin `onResolve` callback.
 *
 * @remarks
 * A virtual module's `path` starts with `\0`, so no other plugin reads it as a file.
 */
export type EcoBuildOnResolveResult = {
	path?: string;
	external?: boolean;
};

/**
 * Arguments passed to a build plugin `onLoad` callback.
 */
export type EcoBuildOnLoadArgs = {
	path: string;
};

/**
 * Language the bundler compiles a loaded module's `contents` as.
 */
export type EcoBuildLoader = 'js' | 'jsx' | 'ts' | 'tsx';

/**
 * Result returned by a build plugin `onLoad` callback.
 */
export type EcoBuildOnLoadResult = {
	contents?: string | Uint8Array;
	loader?: EcoBuildLoader;
	/** Source map for the loaded contents, when the loader rewrites source. */
	map?: unknown;
};

/**
 * A module id the bundler resolved a specifier to.
 */
export type EcoBuildResolvedId = {
	id: string;
	/** Whether the build leaves the module out of its output. */
	external: boolean;
};

/**
 * Module ids a build plugin handler runs for.
 *
 * @remarks
 * The bundler tests both patterns itself, so an id they rule out never reaches the callback. Ids use `/`
 * separators on every platform, so `exclude: /\/node_modules\//` skips installed packages everywhere.
 */
export type EcoBuildFilter = {
	filter: RegExp;
	exclude?: RegExp;
};

/**
 * Result returned by a build plugin `transform` callback.
 */
export type EcoBuildOnTransformResult = {
	code: string;
	map?: unknown;
};

/**
 * Plugin builder contract consumed by build adapters.
 *
 * @remarks
 * Register every handler before `setup` returns or its promise resolves. A later
 * call throws, because the bundler reads hook filters before the build starts.
 */
export interface EcoBuildPluginBuilder {
	/** Entry names and source paths passed to this build request. */
	entrypoints?: Readonly<Record<string, string>>;
	onResolve(
		options: EcoBuildFilter,
		callback: (
			args: EcoBuildOnResolveArgs,
		) => EcoBuildOnResolveResult | undefined | Promise<EcoBuildOnResolveResult | undefined>,
	): void;
	onLoad(
		options: EcoBuildFilter,
		callback: (
			args: EcoBuildOnLoadArgs,
		) => EcoBuildOnLoadResult | undefined | Promise<EcoBuildOnLoadResult | undefined>,
	): void;
	/** Serves `specifier` as a virtual module whose source `callback` returns. */
	module(specifier: string, callback: () => EcoBuildOnLoadResult | Promise<EcoBuildOnLoadResult>): void;
	/**
	 * Registers a source rewrite that runs after `load`.
	 *
	 * @remarks
	 * Prefer this over `onLoad` when the plugin only rewrites module source, so
	 * it still runs on first-wins load results and can return a source map.
	 */
	transform(
		options: EcoBuildFilter,
		callback: (
			code: string,
			id: string,
		) => EcoBuildOnTransformResult | string | undefined | Promise<EcoBuildOnTransformResult | string | undefined>,
	): void;
	/**
	 * Registers a check that runs once every module of the build is transformed.
	 *
	 * @remarks
	 * It does not run when the build already failed. A thrown error fails the build.
	 */
	onEnd(callback: () => void | Promise<void>): void;
	/**
	 * Declares a file the running `onLoad` or `transform` callback read, so an edit to it rebuilds that module.
	 *
	 * @remarks
	 * The file joins the dependencies of every entry whose graph holds the module, which is what caches
	 * and the development watcher invalidate on. A call outside those callbacks throws.
	 */
	addWatchFile(filePath: string): void;
	/**
	 * Resolves `specifier` from `importer` the way the build does, through the other plugins and the bundler.
	 *
	 * @remarks
	 * Returns `undefined` when nothing resolves it. A call outside an `onLoad` or `transform` callback throws.
	 */
	resolve(specifier: string, importer: string): Promise<EcoBuildResolvedId | undefined>;
}

/**
 * Runtime-agnostic build plugin contract consumed by Ecopages processors/loaders.
 */
export type EcoBuildPlugin = {
	name: string;
	/** Omitted environments apply to both server and browser builds. */
	environments?: Array<'server' | 'browser'>;
	setup: (build: EcoBuildPluginBuilder) => void | Promise<void>;
	/**
	 * Distinguishes two plugins of one name that a factory built from different options.
	 *
	 * @remarks
	 * A build request is identified by its plugins' names in order, so builds that differ only in the options
	 * a factory captured would otherwise share an identity, and with it a deduplicated build or a reused
	 * artifact. A factory that captures an option which changes its output sets this to a string of that option.
	 * The dependency key of a script that declares the plugin in `bundleOptions` includes it too, so the
	 * processed-asset cache keeps such scripts apart.
	 */
	cacheKey?: string;
};
