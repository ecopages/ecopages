import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { EcoBuildPlugin } from './build-types.ts';
import type { BuildOptions, BuildTranspileProfile } from './build-contracts.ts';
import { getAppBrowserBuildPlugins, getAppServerBuildPlugins, getAppTranspileOptions } from './build-adapter.ts';
import { resolveBuildProfileOptions } from './build-profile-options.ts';
import type { BuildProfile } from './build-runtime.ts';
import { getJsxOwnershipPlugins } from './jsx-ownership-plugins.ts';
import { getAppSourceTransforms } from '../plugins/source-transform.ts';

/**
 * Resolves app-owned server plugins plus JSX ownership for one config.
 *
 * @remarks
 * Always goes through {@link getAppServerBuildPlugins} so sealed-manifest and
 * loader-fallback apps share one plugin list with the alias resolver. Used by
 * both request assembly and unified-graph cache keys.
 */
export function resolveServerAppBuildPlugins(appConfig: EcoPagesAppConfig): EcoBuildPlugin[] {
	return [...getAppServerBuildPlugins(appConfig), ...getJsxOwnershipPlugins(appConfig)];
}

/**
 * Merges caller plugins with app-owned manifest plugins.
 *
 * @remarks
 * App-manifest plugins cannot be silently replaced by same-name caller plugins.
 * Unique caller plugins are prepended so first-wins Rolldown hooks (for example
 * React vendor/alias rewrites) still run before general app loaders. Use
 * `excludeAppBuildPlugins` on browser requests to omit app-owned plugins.
 */
export function mergeCallerBuildPlugins(
	appPlugins: EcoBuildPlugin[],
	callerPlugins?: EcoBuildPlugin[],
): EcoBuildPlugin[] {
	if (!callerPlugins || callerPlugins.length === 0) {
		return appPlugins;
	}

	const appByName = new Map(appPlugins.map((plugin) => [plugin.name, plugin]));
	const uniqueCallerPlugins = callerPlugins.filter((plugin) => !appByName.has(plugin.name));
	return [...uniqueCallerPlugins, ...appPlugins];
}

export type ServerBuildRequestInput = Partial<BuildOptions> & {
	entrypoints: BuildOptions['entrypoints'];
	profile?: Extract<BuildProfile, 'server-entry' | 'route-module'>;
};

export type BrowserBuildRequestInput = Partial<BuildOptions> & {
	entrypoints: BuildOptions['entrypoints'];
	profile: BuildTranspileProfile;
	excludeAppBuildPlugins?: string[];
};

/**
 * Assembles a complete server-oriented {@link BuildOptions} before scheduling.
 *
 * @remarks
 * Defaults `profile` to `'route-module'`. Plugins are
 * {@link resolveServerAppBuildPlugins} plus unique caller contributions via
 * {@link mergeCallerBuildPlugins}. Does not attach `sourceTransforms` — unlike
 * {@link createBrowserBuildRequest}. Pass the returned options into
 * {@link BuildRuntime.getProfile}; the runtime no longer injects plugins.
 */
export function createServerBuildRequest(appConfig: EcoPagesAppConfig, input: ServerBuildRequestInput): BuildOptions {
	const profile = input.profile ?? 'route-module';
	const plugins = mergeCallerBuildPlugins(resolveServerAppBuildPlugins(appConfig), input.plugins);
	const { plugins: _callerPlugins, profile: _profile, ...overrides } = input;

	return {
		...resolveBuildProfileOptions(profile, appConfig, overrides),
		...overrides,
		entrypoints: input.entrypoints,
		...(plugins.length > 0 ? { plugins } : {}),
	};
}

/**
 * Assembles a complete browser-oriented {@link BuildOptions} before scheduling.
 *
 * @remarks
 * Applies {@link resolveBuildProfileOptions} for `'browser-hmr'` (browser target
 * defaults), then overlays {@link getAppTranspileOptions} for the given
 * {@link BuildTranspileProfile}. That profile selects transpile settings only;
 * the {@link BuildRuntime} executor slot is chosen later by the caller
 * (typically {@link BrowserBundleService}).
 *
 * Always attaches {@link getAppSourceTransforms}. App browser plugins come from
 * {@link getAppBrowserBuildPlugins} (includes JSX ownership); use
 * `excludeAppBuildPlugins` to omit app-owned names. Caller plugins cannot
 * replace app-manifest names ({@link mergeCallerBuildPlugins}).
 */
export function createBrowserBuildRequest(appConfig: EcoPagesAppConfig, input: BrowserBuildRequestInput): BuildOptions {
	const { profile, excludeAppBuildPlugins, plugins: callerPlugins, ...overrides } = input;
	const appBrowserPlugins = getAppBrowserBuildPlugins(appConfig);
	const filteredAppBrowserPlugins =
		excludeAppBuildPlugins && excludeAppBuildPlugins.length > 0
			? appBrowserPlugins.filter((plugin) => !excludeAppBuildPlugins.includes(plugin.name))
			: appBrowserPlugins;
	const plugins = mergeCallerBuildPlugins(filteredAppBrowserPlugins, callerPlugins);

	return {
		...resolveBuildProfileOptions('browser-hmr', appConfig, overrides),
		...getAppTranspileOptions(appConfig, profile),
		...overrides,
		entrypoints: input.entrypoints,
		plugins,
		sourceTransforms: getAppSourceTransforms(appConfig),
	};
}
