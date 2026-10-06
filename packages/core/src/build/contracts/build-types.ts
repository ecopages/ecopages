/**
 * Arguments passed to a build plugin `onResolve` callback.
 */
export type EcoBuildOnResolveArgs = {
	path: string;
	importer?: string;
	namespace?: string;
};

/**
 * Result returned by a build plugin `onResolve` callback.
 */
export type EcoBuildOnResolveResult = {
	path?: string;
	namespace?: string;
	external?: boolean;
};

/**
 * Arguments passed to a build plugin `onLoad` callback.
 */
export type EcoBuildOnLoadArgs = {
	path: string;
	namespace?: string;
};

/**
 * Loader kinds supported by the build plugin contract.
 */
export type EcoBuildLoader =
	| 'base64'
	| 'binary'
	| 'copy'
	| 'css'
	| 'dataurl'
	| 'empty'
	| 'file'
	| 'global-css'
	| 'js'
	| 'json'
	| 'jsx'
	| 'local-css'
	| 'object'
	| 'text'
	| 'ts'
	| 'tsx';

/**
 * Result returned by a build plugin `onLoad` callback.
 */
export type EcoBuildOnLoadResult = {
	contents?: string | Uint8Array;
	loader?: EcoBuildLoader;
	exports?: Record<string, unknown>;
	resolveDir?: string;
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
	onResolve(
		options: { filter: RegExp; namespace?: string },
		callback: (
			args: EcoBuildOnResolveArgs,
		) => EcoBuildOnResolveResult | undefined | Promise<EcoBuildOnResolveResult | undefined>,
	): void;
	onLoad(
		options: { filter: RegExp; namespace?: string },
		callback: (
			args: EcoBuildOnLoadArgs,
		) => EcoBuildOnLoadResult | undefined | Promise<EcoBuildOnLoadResult | undefined>,
	): void;
	module(specifier: string, callback: () => EcoBuildOnLoadResult | Promise<EcoBuildOnLoadResult>): void;
	/**
	 * Registers a source rewrite that runs after `load`.
	 *
	 * @remarks
	 * Prefer this over `onLoad` when the plugin only rewrites module source, so
	 * it still runs on first-wins load results and can return a source map.
	 */
	transform(
		options: { filter: RegExp },
		callback: (
			code: string,
			id: string,
		) => EcoBuildOnTransformResult | string | undefined | Promise<EcoBuildOnTransformResult | string | undefined>,
	): void;
}

/**
 * Runtime-agnostic build plugin contract consumed by Ecopages processors/loaders.
 */
export type EcoBuildPlugin = {
	name: string;
	/** Omitted environments apply to both server and browser builds. */
	environments?: Array<'server' | 'browser'>;
	setup: (build: EcoBuildPluginBuilder) => void | Promise<void>;
};
