/**
 * Backward-compatible alias-only factory built on top of the unified
 * browser-runtime plugin.
 *
 * @remarks
 * Per ADR-002, the unified factory lives in
 * `packages/core/src/build/browser-runtime-plugin.ts`. This module
 * preserves the historical `createRuntimeSpecifierAliasPlugin` factory
 * name for existing call sites.
 *
 * The legacy factory builds a synthetic manifest from the caller's
 * `Map | Record` and forwards it to the unified factory with
 * `rewriteImports: false` and `matchPublicPaths: false` so the original
 * alias-only behavior is preserved exactly.
 */

import { createBrowserRuntimePlugin, BROWSER_RUNTIME_IMPORT_REWRITE_MAP } from './browser-runtime-plugin.ts';
import { createBrowserRuntimeManifest, type BrowserRuntimeManifest } from './browser-runtime-manifest.ts';
import { toRuntimeSpecifierMap } from './browser-runtime-plugin-helpers.ts';
import type { EcoBuildPlugin } from './build-types.ts';

export type RuntimeSpecifierMap = ReadonlyMap<string, string> | Record<string, string>;

/**
 * Builds a synthetic manifest from a `Map | Record` of
 * `specifier → publicPath`. The manifest is consumed by the unified
 * factory's alias-only path; we set `owner` to the empty string and
 * `importPath` equal to the specifier, which is fine because the
 * alias-only path never reads those fields.
 */
function manifestFromSpecifierMap(specifierMap: RuntimeSpecifierMap): BrowserRuntimeManifest {
	const normalized = toRuntimeSpecifierMap(specifierMap);
	return createBrowserRuntimeManifest(
		Array.from(normalized.entries()).map(([specifier, publicPath]) => ({
			specifier,
			owner: '',
			importPath: specifier,
			publicPath,
		})),
	);
}

/**
 * Legacy factory kept for backward compatibility. New code should call
 * {@link createBrowserRuntimePlugin} directly.
 */
export function createRuntimeSpecifierAliasPlugin(
	specifierMapInput: RuntimeSpecifierMap,
	options?: {
		name?: string;
		external?: boolean;
	},
): EcoBuildPlugin | null {
	return createBrowserRuntimePlugin({
		manifest: manifestFromSpecifierMap(specifierMapInput),
		name: options?.name,
		external: options?.external ?? true,
		rewriteImports: false,
		matchPublicPaths: false,
	});
}

export { BROWSER_RUNTIME_IMPORT_REWRITE_MAP };
