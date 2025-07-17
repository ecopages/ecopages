import { RESOLVED_ASSETS_DIR, RESOLVED_ASSETS_VENDORS_DIR } from '../../constants';
import { deepMerge } from '../../utils/deep-merge';
import type {
	ContentScriptAsset,
	ContentStylesheetAsset,
	FileScriptAsset,
	FileStylesheetAsset,
	InlineContentScriptAsset,
	InlineContentStylesheetAsset,
	JsonScriptAsset,
	NodeModuleScriptAsset,
} from './assets.types';

type CreateAssetOptions<T> = Omit<T, 'kind' | 'source' | 'inline'>;

export class AssetFactory {
	static readonly RESOLVED_ASSETS_DIR = RESOLVED_ASSETS_DIR;
	static readonly RESOLVED_ASSETS_VENDORS_DIR = RESOLVED_ASSETS_VENDORS_DIR;

	static createContentScript(options: CreateAssetOptions<ContentScriptAsset>): ContentScriptAsset {
		return {
			kind: 'script',
			source: 'content',
			position: options.position || 'body',
			...options,
		};
	}

	static createInlineContentScript(options: CreateAssetOptions<InlineContentScriptAsset>): InlineContentScriptAsset {
		return {
			...AssetFactory.createContentScript(options),
			inline: true,
		};
	}

	static createFileScript(options: CreateAssetOptions<FileScriptAsset>): FileScriptAsset {
		return {
			kind: 'script',
			source: 'file',
			position: options.position || 'body',
			...options,
		};
	}

	static createNodeModuleScript(options: CreateAssetOptions<NodeModuleScriptAsset>): NodeModuleScriptAsset {
		return {
			kind: 'script',
			source: 'node-module',
			position: options.position || 'body',
			...options,
		};
	}

	static createInlineNodeModuleScript(options: CreateAssetOptions<NodeModuleScriptAsset>): NodeModuleScriptAsset {
		return {
			...AssetFactory.createNodeModuleScript(options),
			inline: true,
		};
	}

	static createJsonScript(options: CreateAssetOptions<JsonScriptAsset>): JsonScriptAsset {
		return {
			kind: 'script',
			source: 'content',
			attributes: deepMerge(options.attributes, { type: 'application/json' }),
			position: options.position || 'body',
			...options,
		};
	}

	static createContentStylesheet(options: CreateAssetOptions<ContentStylesheetAsset>): ContentStylesheetAsset {
		return {
			kind: 'stylesheet',
			source: 'content',
			position: 'head',
			...options,
		};
	}

	static createInlineContentStylesheet(
		options: CreateAssetOptions<InlineContentStylesheetAsset>,
	): InlineContentStylesheetAsset {
		return {
			...AssetFactory.createContentStylesheet(options),
			inline: true,
		};
	}

	static createFileStylesheet(options: CreateAssetOptions<FileStylesheetAsset>): FileStylesheetAsset {
		return {
			kind: 'stylesheet',
			source: 'file',
			position: options.position || 'head',
			...options,
		};
	}
}
