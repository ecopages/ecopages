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
}

/**
 * Result of an {@link EcoBuildTransform} handler.
 *
 * @remarks
 * Return `map` whenever the edit moves code. Without it, the bundler keeps
 * the incoming source map, so positions after the edit are off by its size.
 */
export type EcoBuildTransformResult = {
	code: string;
	map?: unknown;
};

/**
 * Rewrites module source after it is loaded.
 *
 * @remarks
 * The bundler tests `filter` against the module id without its query and
 * hash, and calls `handler` only for matching modules. Every matching
 * transform runs: `pre` transforms first, then those without `order`, then
 * `post`, each group in plugin array order. Source maps chain across them.
 */
export type EcoBuildTransform = {
	filter: RegExp;
	order?: 'pre' | 'post';
	/** Receives the module id without its query and hash. Returns `undefined` to leave the code unchanged. */
	handler: (code: string, id: string) => EcoBuildTransformResult | string | undefined;
};

/**
 * Runtime-agnostic build plugin contract consumed by Ecopages processors/loaders.
 */
export type EcoBuildPlugin = {
	name: string;
	/** Omitted environments apply to both server and browser builds. */
	environments?: Array<'server' | 'browser'>;
	setup: (build: EcoBuildPluginBuilder) => void | Promise<void>;
	transform?: EcoBuildTransform;
};
