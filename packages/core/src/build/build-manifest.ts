import type { EcoBuildPlugin } from './build-types.ts';
import { createBrowserRuntimePlugin, DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME } from './browser-runtime-plugin.ts';
import {
	createBrowserRuntimeManifest,
	mergeBrowserRuntimeManifests,
	type BrowserRuntimeManifest,
} from './browser-runtime-manifest.ts';

export interface AppBuildManifest {
	loaderPlugins: EcoBuildPlugin[];
	runtimePlugins: EcoBuildPlugin[];
	browserBundlePlugins: EcoBuildPlugin[];
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
 */
export function getServerBuildPlugins(manifest: AppBuildManifest): EcoBuildPlugin[] {
	return mergeEcoBuildPlugins(manifest.loaderPlugins, manifest.runtimePlugins);
}

/**
 * Returns the plugin list used for browser-oriented builds.
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
