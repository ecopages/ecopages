import type { EcoBuildPlugin } from './build-types.ts';
import { createBrowserRuntimePlugin, DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME } from './browser-runtime-plugin.ts';
import {
	createBrowserRuntimeManifest,
	mergeBrowserRuntimeManifests,
	type BrowserRuntimeManifest,
} from './browser-runtime-manifest.ts';

/**
 * Sealed, app-owned registry of build plugins and browser runtime assets.
 *
 * @remarks
 * Core assembles one manifest during {@link ConfigBuilder.build} and stores it on
 * `appConfig.runtime.buildManifest`. Request policy reads from this manifest when
 * constructing server and browser {@link BuildOptions}; profiles do not inject
 * plugins themselves.
 *
 * Contributor naming differs by layer but maps to the same buckets:
 *
 * | Integration getter | Processor getter | Manifest bucket |
 * | --- | --- | --- |
 * | `plugins` | `plugins` | `runtimePlugins` |
 * | `browserBuildPlugins` | `buildPlugins` | `browserBundlePlugins` |
 * | `browserRuntimeManifest` | — | `browserRuntimeManifest` |
 * | — (file loaders on config) | — | `loaderPlugins` |
 *
 * Use {@link getServerBuildPlugins} and {@link getBrowserBuildPlugins} to turn
 * buckets into the plugin lists passed to Rolldown. App-aware call sites should
 * prefer {@link getAppServerBuildPlugins} and {@link getAppBrowserBuildPlugins},
 * which add alias resolution, JSX ownership, and browser source-transform
 * deduplication on top of the manifest lists.
 */
export interface AppBuildManifest {
	/** File-extension loaders registered on the app config (for example `.mdx`). */
	loaderPlugins: EcoBuildPlugin[];
	/**
	 * Shared plugins for server-oriented and browser-oriented builds.
	 *
	 * @remarks
	 * Sourced from integration `plugins` and processor `plugins`. Virtual-module
	 * loaders and transforms that must run during route-module transpile belong
	 * here.
	 */
	runtimePlugins: EcoBuildPlugin[];
	/**
	 * Browser-bundle-only plugins.
	 *
	 * @remarks
	 * Sourced from integration `browserBuildPlugins` and processor `buildPlugins`.
	 * Do not register server route or static-page transforms here.
	 */
	browserBundlePlugins: EcoBuildPlugin[];
	/**
	 * Specifier → public URL map for client bundles.
	 *
	 * @remarks
	 * Not a plugin list. {@link getBrowserBuildPlugins} synthesizes
	 * `browser-runtime-plugin` from this map to rewrite manifest-owned imports.
	 */
	browserRuntimeManifest: BrowserRuntimeManifest;
}

/**
 * Merges plugin lists while preserving first-registration precedence by name.
 *
 * @remarks
 * Build manifests treat plugin names as stable identities. The first plugin
 * with a given name wins so config-time assembly stays deterministic across
 * loader, runtime, and browser buckets.
 */
export function mergeEcoBuildPlugins(...pluginLists: Array<EcoBuildPlugin[] | undefined>): EcoBuildPlugin[] {
	const byName = new Map<string, EcoBuildPlugin>();

	for (const plugins of pluginLists) {
		for (const plugin of plugins ?? []) {
			if (!byName.has(plugin.name)) {
				byName.set(plugin.name, plugin);
			}
		}
	}

	return Array.from(byName.values());
}

/**
 * Creates one app-owned build manifest from the supplied plugin buckets.
 */
export function createAppBuildManifest(input?: Partial<AppBuildManifest>): AppBuildManifest {
	return {
		loaderPlugins: mergeEcoBuildPlugins(input?.loaderPlugins),
		runtimePlugins: mergeEcoBuildPlugins(input?.runtimePlugins),
		browserBundlePlugins: mergeEcoBuildPlugins(input?.browserBundlePlugins),
		browserRuntimeManifest: mergeBrowserRuntimeManifests(input?.browserRuntimeManifest),
	};
}

/**
 * Returns the shared browser runtime asset manifest sealed into the app build manifest.
 */
export function getBrowserRuntimeManifest(manifest: AppBuildManifest): BrowserRuntimeManifest {
	return manifest.browserRuntimeManifest ?? createBrowserRuntimeManifest();
}

/**
 * Returns the plugin list used for server-oriented builds.
 *
 * @remarks
 * Merges `loaderPlugins` then `runtimePlugins`. Browser-only buckets and the
 * synthesized browser-runtime rewrite plugin are excluded.
 */
export function getServerBuildPlugins(manifest: AppBuildManifest): EcoBuildPlugin[] {
	return mergeEcoBuildPlugins(manifest.loaderPlugins, manifest.runtimePlugins);
}

/**
 * Returns the plugin list used for browser-oriented builds.
 *
 * @remarks
 * Merges, in order: `loaderPlugins`, `runtimePlugins`, a synthesized
 * `browser-runtime-plugin` when `browserRuntimeManifest` has entries, then
 * `browserBundlePlugins`. Plugin names dedupe with first-registration wins via
 * {@link mergeEcoBuildPlugins}.
 */
export function getBrowserBuildPlugins(manifest: AppBuildManifest): EcoBuildPlugin[] {
	const runtimeRewritePlugin = createBrowserRuntimePlugin({
		name: DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME,
		manifest: getBrowserRuntimeManifest(manifest),
	});

	return mergeEcoBuildPlugins(
		manifest.loaderPlugins,
		manifest.runtimePlugins,
		runtimeRewritePlugin ? [runtimeRewritePlugin] : [],
		manifest.browserBundlePlugins,
	);
}
