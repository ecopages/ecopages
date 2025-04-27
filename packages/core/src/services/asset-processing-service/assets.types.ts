export type AssetSource = 'content' | 'file' | 'node-module';
export type AssetKind = 'script' | 'stylesheet';
export type AssetPosition = 'head' | 'body';

export interface BaseAsset {
  kind: AssetKind;
  source: AssetSource;
  attributes?: Record<string, string>;
  position?: AssetPosition;
}

export interface ScriptAsset extends BaseAsset {
  kind: 'script';
  inline?: boolean;
  bundle?: boolean;
  bundleOptions?: {
    minify?: boolean;
    external?: string[];
    naming?: string;
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

export interface JsonScriptAsset extends BaseAsset {
  kind: 'script';
  source: 'content';
  content: string;
}

export interface PreBundledScriptAsset extends BaseAsset {
  kind: 'script';
  source: 'file';
  filepath: string;
  preBundled: true;
}

export interface PreBundledStylesheetAsset extends BaseAsset {
  kind: 'stylesheet';
  source: 'file';
  filepath: string;
  preBundled: true;
}

export type ProcessedAsset = {
  filepath?: string;
  srcUrl?: string;
  content?: string;
  kind: AssetKind;
  position?: AssetPosition;
  attributes?: Record<string, string>;
  inline?: boolean;
  excludeFromHtml?: boolean;
};

export type AssetDefinition =
  | ContentScriptAsset
  | FileScriptAsset
  | NodeModuleScriptAsset
  | JsonScriptAsset
  | PreBundledScriptAsset
  | ContentStylesheetAsset
  | FileStylesheetAsset
  | PreBundledStylesheetAsset;
