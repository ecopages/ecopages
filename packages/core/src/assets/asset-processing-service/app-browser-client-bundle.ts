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
	/**
	 * When true, the grouped entry re-exports the module so another script can
	 * `import * as ComponentModule from entryUrl`. Island hydration needs that.
	 * Lazy entries keep the default side-effect `import "path"`.
	 */
	reexport?: boolean;
};

/**
 * Declares one file as a grouped content-script entry in the app-wide browser build.
 *
 * @remarks
 * Content-script grouping is the existing multi-entry seam. A side-effect
 * `import "path"` is enough for lazy entries that only need to run. Island
 * entries set `reexport` so `export * from "path"` keeps named exports for the
 * hydration script. A synthetic `export default` is omitted: Rolldown warns
 * `IMPORT_IS_UNDEFINED` when the source has no default export.
 */
export function createAppBrowserClientEntry(options: AppBrowserClientEntryOptions): ContentScriptAsset {
	const specifier = JSON.stringify(options.importPath);
	const content = options.reexport ? `export * from ${specifier};` : `import ${specifier};`;

	return AssetFactory.createContentScript({
		position: 'head',
		name: options.entryName,
		content,
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
