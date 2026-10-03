import type { EcoBuildPlugin } from '../../../build/contracts/build-types.ts';

export type AssetSource = 'content' | 'file' | 'node-module';
export type AssetKind = 'script' | 'stylesheet';
export type AssetPosition = 'head' | 'body';
export type AssetPackageRole = 'page-script' | 'page-style' | 'runtime' | 'keep-separate' | 'dynamic-chunk';

export type GroupedScriptBundle = {
	id: string;
	entryName: string;
};

export interface BaseAsset {
	kind: AssetKind;
	source: AssetSource;
	attributes?: Record<string, string>;
	position?: AssetPosition;
	packageRole?: AssetPackageRole;
	bundledSourceFilepaths?: string[];
}

export interface ScriptAsset extends BaseAsset {
	kind: 'script';
	inline?: boolean;
	bundle?: boolean;
	/**
	 * Bundles the script in the asset pipeline even while HMR is active, instead of handing it to
	 * the HMR manager, which rebuilds entries as ES modules.
	 *
	 * @remarks
	 * For scripts that must not become modules, such as HTML Page classic scripts compiled from
	 * TypeScript. The script is rebuilt when its page renders again, not hot-replaced.
	 */
	skipHmr?: boolean;
	groupedBundle?: GroupedScriptBundle;
	bundleOptions?: {
		/** Drops unused code. `true` by default; turn it off for a script whose globals other scripts use. */
		treeshaking?: boolean;
		define?: Record<string, string>;
		minify?: boolean;
		external?: string[];
		splitting?: boolean;
		excludeAppBuildPlugins?: string[];
		naming?: string;
		plugins?: EcoBuildPlugin[];
	};
	/**
	 * Whether to exclude this asset from the HTML output.
	 * @default false
	 */
	excludeFromHtml?: boolean;
}

export interface StylesheetAsset extends BaseAsset {
	kind: 'stylesheet';
	inline?: boolean;
}

export interface ContentScriptAsset extends ScriptAsset {
	source: 'content';
	content: string;
	name?: string;
}

export interface InlineContentScriptAsset extends ContentScriptAsset {
	inline: true;
}

export interface ContentStylesheetAsset extends StylesheetAsset {
	source: 'content';
	content: string;
	/**
	 * Path processors receive as the stylesheet's location, for example to resolve relative imports.
	 *
	 * @remarks
	 * Use a `.css` path: processors select stylesheets by extension. It also joins the cache
	 * identity, so identical CSS from two origins is processed separately. Defaults to a shared
	 * virtual `styles/page-bundle.css` in the dist directory.
	 */
	processingOrigin?: string;
}

export interface InlineContentStylesheetAsset extends ContentStylesheetAsset {
	inline: true;
}

export interface FileScriptAsset extends ScriptAsset {
	source: 'file';
	filepath: string;
	name?: string;
}

export interface InlineFileScriptAsset extends FileScriptAsset {
	inline: true;
}

export interface FileStylesheetAsset extends StylesheetAsset {
	source: 'file';
	filepath: string;
	name?: string;
}

export interface InlineFileStylesheetAsset extends FileStylesheetAsset {
	inline: true;
}

export interface NodeModuleScriptAsset extends ScriptAsset {
	kind: 'script';
	source: 'node-module';
	importPath: string;
	name?: string;
}

export interface InlineNodeModuleScriptAsset extends NodeModuleScriptAsset {
	inline: true;
}

export interface InlineNodeModuleScriptAsset extends NodeModuleScriptAsset {
	inline: true;
}

export interface JsonScriptAsset extends ScriptAsset {
	source: 'content';
	content: string;
}

export type ProcessedAsset = {
	filepath?: string;
	sourceFilepath?: string;
	srcUrl?: string;
	content?: string;
	kind: AssetKind;
	position?: AssetPosition;
	attributes?: Record<string, string>;
	inline?: boolean;
	excludeFromHtml?: boolean;
	packageRole?: AssetPackageRole;
	groupedBundle?: GroupedScriptBundle;
	bundledSourceFilepaths?: string[];
};

export type AssetDefinition =
	| ContentScriptAsset
	| FileScriptAsset
	| NodeModuleScriptAsset
	| JsonScriptAsset
	| ContentStylesheetAsset
	| FileStylesheetAsset;
