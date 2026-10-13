import type { EcoBuildPlugin } from './build-types.ts';
import type { BuildEnvironment } from './build-contracts.ts';
import { createBrowserRuntimePlugin, DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME } from '../browser/browser-runtime-plugin.ts';
import { mergeBrowserRuntimeManifests, type BrowserRuntimeManifest } from '../browser/browser-runtime-manifest.ts';

/**
 * App-owned build plugins, already selected per environment, and the separate browser runtime declarations.
 *
 * @remarks
 * Sealed once by {@link createAppBuildManifest}. Readers take `server` or `browser` as it is and do not filter.
 */
export interface AppBuildManifest {
	server: EcoBuildPlugin[];
	browser: EcoBuildPlugin[];
	browserRuntimeManifest: BrowserRuntimeManifest;
}

/** One plugin an app contributes to its build manifest, and who contributed it. */
export interface BuildPluginRegistration {
	plugin: EcoBuildPlugin;
	source: string;
}

export function appliesToBuildEnvironment(plugin: EcoBuildPlugin, environment: BuildEnvironment): boolean {
	return plugin.environments?.includes(environment) ?? true;
}

/**
 * @remarks
 * Names identify plugins within an environment. Reject overlapping registrations
 * instead of silently dropping a contributor's hooks.
 */
function validateBuildPluginRegistrations(registrations: readonly BuildPluginRegistration[]): void {
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

/**
 * Seals the app's build manifest: validates every registration once and stores the plugins per environment.
 *
 * @remarks
 * Registration order is kept. The browser list puts the plugins that also apply to the server first, then the
 * browser runtime plugin that maps manifest specifiers to public URLs, then the browser-only plugins, because
 * the first plugin to return a result for a resolve or load wins.
 */
export function createAppBuildManifest(
	registrations: readonly BuildPluginRegistration[],
	browserRuntimeManifest?: BrowserRuntimeManifest,
): AppBuildManifest {
	validateBuildPluginRegistrations(registrations);
	const plugins = registrations.map(({ plugin }) => plugin);
	const runtimeManifest = mergeBrowserRuntimeManifests(browserRuntimeManifest);
	const runtimePlugin = createBrowserRuntimePlugin({
		name: DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME,
		manifest: runtimeManifest,
	});
	const browserPlugins = plugins.filter((plugin) => appliesToBuildEnvironment(plugin, 'browser'));
	return {
		server: plugins.filter((plugin) => appliesToBuildEnvironment(plugin, 'server')),
		browser: [
			...browserPlugins.filter((plugin) => appliesToBuildEnvironment(plugin, 'server')),
			...(runtimePlugin ? [runtimePlugin] : []),
			...browserPlugins.filter((plugin) => !appliesToBuildEnvironment(plugin, 'server')),
		],
		browserRuntimeManifest: runtimeManifest,
	};
}
