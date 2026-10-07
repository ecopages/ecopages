import { AssetFactory } from './asset.factory.ts';
import type { ContentScriptAsset, ScriptAsset } from './assets.types.ts';

/**
 * Grouped Rolldown id for app-wide island, lazy-entry, and page client scripts.
 *
 * @remarks
 * One multi-entry browser build uses this id so a module imported by two
 * entries is one chunk under one URL. Native ESM then gives one instance.
 */
export const APP_BROWSER_CLIENT_BUNDLE_ID = 'ecopages-app-browser-client';

type AppBrowserClientEntryOptions = {
	entryName: string;
	importPath: string;
	attributes?: Record<string, string>;
	packageRole?: ScriptAsset['packageRole'];
	excludeFromHtml?: boolean;
	bundleOptions?: ScriptAsset['bundleOptions'];
};

/**
 * Declares one file as a grouped content-script entry that imports the source module.
 *
 * @remarks
 * Content-script grouping is the existing multi-entry seam. Wrapping a file in
 * `import "path"` puts islands and lazy entries into that same Rolldown build
 * instead of a per-file `createFileScript` bundle.
 */
export function createAppBrowserClientEntry(options: AppBrowserClientEntryOptions): ContentScriptAsset {
	return AssetFactory.createContentScript({
		position: 'head',
		name: options.entryName,
		content: `import ${JSON.stringify(options.importPath)};`,
		excludeFromHtml: options.excludeFromHtml ?? true,
		packageRole: options.packageRole,
		bundle: true,
		groupedBundle: {
			id: APP_BROWSER_CLIENT_BUNDLE_ID,
			entryName: options.entryName,
		},
		bundleOptions: options.bundleOptions,
		attributes: {
			type: 'module',
			defer: '',
			...options.attributes,
		},
	});
}
