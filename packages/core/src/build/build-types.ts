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
 * Loader kinds supported across Bun/esbuild bridge points.
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
 * Shared plugin builder contract used by Ecopages across Bun and esbuild.
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
 * Runtime-agnostic build plugin contract consumed by Ecopages processors/loaders.
 */
export type EcoBuildPlugin = {
	name: string;
	setup: (build: EcoBuildPluginBuilder) => void | Promise<void>;
};
