/**
 * Unified browser-runtime plugin factory.
 *
 * @remarks
 * Single factory that exposes the browser-runtime manifest behaviors:
 *
 * - `onResolve` for manifest specifiers → mapped public URL, marked external.
 *   It sees every form a bundler resolves: static imports, re-exports, side-effect
 *   imports and `import()`.
 * - `onResolve` for paths starting with `/` whose target is in the manifest's
 *   public path set → marked external
 *
 * The plugin object carries the manifest under `BROWSER_RUNTIME_MANIFEST`.
 */

import type { EcoBuildPlugin } from '../contracts/build-types.ts';
import {
	getBrowserRuntimeSpecifierMap,
	resolveBrowserRuntimePublicPath,
	type BrowserRuntimeManifest,
} from './browser-runtime-manifest.ts';
import { buildSpecifierFilter } from './browser-runtime-plugin-helpers.ts';

/**
 * Symbol used to attach the browser-runtime manifest to a plugin instance.
 */
export const BROWSER_RUNTIME_MANIFEST = Symbol.for('ecopages.browserRuntimeManifest');

/**
 * Default name used by `createBrowserRuntimePlugin` when the caller
 * does not provide one.
 */
export const DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME = 'browser-runtime-plugin';

export type CreateBrowserRuntimePluginOptions = {
	/** Manifest whose specifier → publicPath entries drive the plugin. */
	manifest: BrowserRuntimeManifest;
	/** Stable build plugin name used for deduplication and selective exclusion. */
	name?: string;
	/**
	 * Whether alias `onResolve` results should be marked `external`.
	 * Default `true`. Pass `false` to let the bundler try to bundle the
	 * mapped URL.
	 */
	external?: boolean;
	/**
	 * Register an `onResolve` for paths starting with `/` whose target
	 * is in the manifest's public path set. Marks them external so the
	 * bundler does not try to resolve them as source modules. Default
	 * `true`.
	 */
	matchPublicPaths?: boolean;
};

type BrowserRuntimePlugin = EcoBuildPlugin & {
	[BROWSER_RUNTIME_MANIFEST]?: BrowserRuntimeManifest;
};

export function getBrowserRuntimeManifestFromPlugin(plugin: EcoBuildPlugin): BrowserRuntimeManifest | undefined {
	return (plugin as BrowserRuntimePlugin)[BROWSER_RUNTIME_MANIFEST];
}

/**
 * Creates a build plugin that exposes the browser-runtime manifest
 * behaviors (alias resolution and public-path matching). See
 * {@link CreateBrowserRuntimePluginOptions} for per-behavior toggles.
 *
 * Returns `null` for an empty manifest so callers can short-circuit
 * registration without sprinkling `if (plugin)` everywhere.
 */
export function createBrowserRuntimePlugin(options: CreateBrowserRuntimePluginOptions): EcoBuildPlugin | null {
	const { manifest } = options;
	const specifierMap = getBrowserRuntimeSpecifierMap(manifest);
	const specifierFilter = buildSpecifierFilter(specifierMap);

	if (!specifierFilter) {
		return null;
	}

	const external = options.external ?? true;
	const matchPublicPaths = options.matchPublicPaths ?? true;
	const publicPathSet = new Set(specifierMap.values());

	const plugin: BrowserRuntimePlugin = {
		name: options.name ?? DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME,
		setup(build) {
			build.onResolve({ filter: specifierFilter }, (args) => {
				const mappedPath = resolveBrowserRuntimePublicPath(args.path, manifest);
				if (!mappedPath) {
					return undefined;
				}

				return {
					path: mappedPath,
					external,
				};
			});

			if (matchPublicPaths) {
				build.onResolve({ filter: /^\// }, (args) => {
					if (!publicPathSet.has(args.path)) {
						return undefined;
					}

					return {
						path: args.path,
						external: true,
					};
				});
			}
		},
	};

	plugin[BROWSER_RUNTIME_MANIFEST] = manifest;
	return plugin;
}
