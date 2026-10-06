import type { EcoBuildPlugin } from './build-types.ts';
import type { BuildEnvironment } from './build-contracts.ts';
import { createBrowserRuntimePlugin, DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME } from '../browser/browser-runtime-plugin.ts';
import { mergeBrowserRuntimeManifests, type BrowserRuntimeManifest } from '../browser/browser-runtime-manifest.ts';

/** App-owned build plugins, selected by environment, and separate browser runtime declarations. */
export interface AppBuildManifest {
	plugins: EcoBuildPlugin[];
	browserRuntimeManifest: BrowserRuntimeManifest;
}

export function appliesToBuildEnvironment(plugin: EcoBuildPlugin, environment: BuildEnvironment): boolean {
	return plugin.environments?.includes(environment) ?? true;
}

/**
 * @remarks
 * Names identify plugins within an environment. Reject overlapping registrations
 * instead of silently dropping a contributor's hooks.
 */
export function validateBuildPluginRegistrations(
	registrations: Array<{ plugin: EcoBuildPlugin; source: string }>,
): void {
	const sources = new Map<string, string>();
	for (const { plugin, source } of registrations) {
		for (const environment of ['server', 'browser'] as const) {
			if (!appliesToBuildEnvironment(plugin, environment)) continue;
			const key = `${plugin.name}:${environment}`;
			const previous = sources.get(key);
			if (previous) {
				throw new Error(
					`Build plugin "${plugin.name}" for ${environment} is registered by both ${previous} and ${source}.`,
				);
			}
			sources.set(key, source);
		}
	}
}

export function createAppBuildManifest(input?: Partial<AppBuildManifest>): AppBuildManifest {
	const plugins = [...(input?.plugins ?? [])];
	validateBuildPluginRegistrations(plugins.map((plugin) => ({ plugin, source: 'app build manifest' })));
	return {
		plugins,
		browserRuntimeManifest: mergeBrowserRuntimeManifests(input?.browserRuntimeManifest),
	};
}

export function getBrowserRuntimeManifest(manifest: AppBuildManifest): BrowserRuntimeManifest {
	return manifest.browserRuntimeManifest;
}

export function getServerBuildPlugins(manifest: AppBuildManifest): EcoBuildPlugin[] {
	return manifest.plugins.filter((plugin) => appliesToBuildEnvironment(plugin, 'server'));
}

export function getBrowserBuildPlugins(manifest: AppBuildManifest): EcoBuildPlugin[] {
	const runtimeRewritePlugin = createBrowserRuntimePlugin({
		name: DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME,
		manifest: manifest.browserRuntimeManifest,
	});
	const plugins = manifest.plugins.filter((plugin) => appliesToBuildEnvironment(plugin, 'browser'));
	return [
		...plugins.filter((plugin) => appliesToBuildEnvironment(plugin, 'server')),
		...(runtimeRewritePlugin ? [runtimeRewritePlugin] : []),
		...plugins.filter((plugin) => !appliesToBuildEnvironment(plugin, 'server')),
	];
}
