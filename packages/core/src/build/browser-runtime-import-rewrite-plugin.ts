/**
 * Backward-compatible re-export of the unified browser-runtime plugin.
 *
 * @remarks
 * Per ADR-002, the unified factory lives in
 * `packages/core/src/build/browser-runtime-plugin.ts`. This module
 * preserves the historical `createBrowserRuntimeImportRewritePlugin`
 * factory name for existing call sites.
 *
 * The legacy factory is a thin wrapper: it forwards the
 * `{ manifest, name }` options to the unified factory, leaving
 * `rewriteImports` and `matchPublicPaths` at their default of `true`
 * to preserve the original behavior.
 */

export {
	BROWSER_RUNTIME_IMPORT_REWRITE_MAP,
	createBrowserRuntimePlugin,
	collectBrowserRuntimeImportRewriteMap,
	getBrowserRuntimeImportRewriteMap,
	rewriteBrowserRuntimeImports,
	DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME,
} from './browser-runtime-plugin.ts';

import type { BrowserRuntimeManifest } from './browser-runtime-manifest.ts';
import { createBrowserRuntimePlugin } from './browser-runtime-plugin.ts';
import type { EcoBuildPlugin } from './build-types.ts';

export type CreateBrowserRuntimeImportRewritePluginOptions = {
	name?: string;
	manifest: BrowserRuntimeManifest;
};

/**
 * Legacy name kept for backward compatibility. New code should call
 * {@link createBrowserRuntimePlugin} directly.
 */
export const DEFAULT_BROWSER_RUNTIME_IMPORT_REWRITE_PLUGIN_NAME = 'browser-runtime-import-rewrite';

/**
 * Legacy factory kept for backward compatibility. New code should call
 * {@link createBrowserRuntimePlugin} directly.
 */
export function createBrowserRuntimeImportRewritePlugin(
	options: CreateBrowserRuntimeImportRewritePluginOptions,
): EcoBuildPlugin | null {
	return createBrowserRuntimePlugin({
		manifest: options.manifest,
		name: options.name ?? DEFAULT_BROWSER_RUNTIME_IMPORT_REWRITE_PLUGIN_NAME,
	});
}
