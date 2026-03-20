import type { EcoBuildPlugin } from './build-types.ts';

export interface AppBuildManifest {
	loaderPlugins: EcoBuildPlugin[];
	runtimePlugins: EcoBuildPlugin[];
	browserBundlePlugins: EcoBuildPlugin[];
}

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

export function createAppBuildManifest(input?: Partial<AppBuildManifest>): AppBuildManifest {
	return {
		loaderPlugins: mergeEcoBuildPlugins(input?.loaderPlugins),
		runtimePlugins: mergeEcoBuildPlugins(input?.runtimePlugins),
		browserBundlePlugins: mergeEcoBuildPlugins(input?.browserBundlePlugins),
	};
}

export function getServerBuildPlugins(manifest: AppBuildManifest): EcoBuildPlugin[] {
	return mergeEcoBuildPlugins(manifest.loaderPlugins, manifest.runtimePlugins);
}

export function getBrowserBuildPlugins(manifest: AppBuildManifest): EcoBuildPlugin[] {
	return mergeEcoBuildPlugins(manifest.loaderPlugins, manifest.runtimePlugins, manifest.browserBundlePlugins);
}