import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { EcoBuildPlugin } from '../contracts/build-types.ts';
import type { BuildEnvironment, BuildOptions } from '../contracts/build-contracts.ts';
import { appliesToBuildEnvironment } from '../contracts/build-manifest.ts';
import { getAppBrowserBuildPlugins, getAppServerBuildPlugins, getAppTranspileOptions } from '../build-adapter.ts';
import { resolveBuildEnvironmentOptions } from './build-environment-options.ts';
import { resolveBuildProfileOptions } from './build-profile-options.ts';
import type { BuildProfile } from './build-runtime.ts';
import { getJsxOwnershipPlugins } from '../browser/jsx-ownership-plugins.ts';
import { getAppSourceTransforms, mergeSourceTransformPlugins } from '../../plugins/source-transform.ts';
import { createPreserveImportMetaTransform } from '../preserve-import-meta-transform.ts';

/**
 * Resolves app-owned server plugins plus JSX ownership for one config.
 *
 * @remarks
 * Always goes through {@link getAppServerBuildPlugins} so sealed-manifest and
 * source-transform apps share one plugin list with the alias resolver. Used by
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
	environment?: BuildEnvironment,
): EcoBuildPlugin[] {
	if (!callerPlugins || callerPlugins.length === 0) {
		return appPlugins;
	}

	const appByName = new Map(appPlugins.map((plugin) => [plugin.name, plugin]));
	const uniqueCallerPlugins = callerPlugins.filter(
		(plugin) => (!environment || appliesToBuildEnvironment(plugin, environment)) && !appByName.has(plugin.name),
	);
	return [...uniqueCallerPlugins, ...appPlugins];
}

export type ServerBuildRequestInput = Partial<BuildOptions> & {
	entrypoints: BuildOptions['entrypoints'];
	profile?: Extract<BuildProfile, 'server-entry' | 'route-module'>;
};

export type BrowserBuildRequestInput = Partial<BuildOptions> & {
	entrypoints: BuildOptions['entrypoints'];
	excludeAppBuildPlugins?: string[];
};

/**
 * Assembles a complete server-oriented {@link BuildOptions} before scheduling.
 *
 * @remarks
 * Defaults `profile` to `'route-module'`. Plugins are
 * {@link resolveServerAppBuildPlugins} plus unique caller contributions via
 * {@link mergeCallerBuildPlugins}. Source transforms become `transform` plugins
 * so server module loading shares browser attribution. Every server profile
 * also gets {@link createPreserveImportMetaTransform} for `runtimeOutdir` (or
 * `outdir`), so bundled modules, Core included, keep reading files relative to
 * their sources from `dist/.server/` and `.eco/.server-modules/`.
 */
export function createServerBuildRequest(appConfig: EcoPagesAppConfig, input: ServerBuildRequestInput): BuildOptions {
	const profile = input.profile ?? 'route-module';
	const importMetaDir = input.runtimeOutdir ?? input.outdir;
	const plugins = mergeSourceTransformPlugins(
		mergeCallerBuildPlugins(resolveServerAppBuildPlugins(appConfig), input.plugins, 'server'),
		[
			...getAppSourceTransforms(appConfig),
			...(importMetaDir ? [createPreserveImportMetaTransform(importMetaDir)] : []),
		],
	);
	const { plugins: _callerPlugins, profile: _profile, ...overrides } = input;

	return {
		...resolveBuildEnvironmentOptions('server', appConfig),
		...resolveBuildProfileOptions(profile, appConfig, overrides),
		...overrides,
		environment: 'server',
		entrypoints: input.entrypoints,
		...(plugins.length > 0 ? { plugins } : {}),
	};
}

/**
 * Assembles a complete browser-oriented {@link BuildOptions} before scheduling.
 *
 * @remarks
 * Applies browser environment defaults independently of the executor slot
 * chosen by {@link BrowserBundleService}.
 *
 * Always attaches app source transforms as `transform` plugins. App browser
 * plugins come from {@link getAppBrowserBuildPlugins} (includes JSX ownership);
 * use `excludeAppBuildPlugins` to omit app-owned names. Caller plugins cannot
 * replace app-manifest names ({@link mergeCallerBuildPlugins}).
 */
export function createBrowserBuildRequest(appConfig: EcoPagesAppConfig, input: BrowserBuildRequestInput): BuildOptions {
	const { excludeAppBuildPlugins, plugins: callerPlugins, ...overrides } = input;
	const appBrowserPlugins = getAppBrowserBuildPlugins(appConfig);
	const filteredAppBrowserPlugins =
		excludeAppBuildPlugins && excludeAppBuildPlugins.length > 0
			? appBrowserPlugins.filter((plugin) => !excludeAppBuildPlugins.includes(plugin.name))
			: appBrowserPlugins;
	const plugins = mergeSourceTransformPlugins(
		mergeCallerBuildPlugins(filteredAppBrowserPlugins, callerPlugins, 'browser'),
		getAppSourceTransforms(appConfig),
	);

	return {
		...resolveBuildEnvironmentOptions('browser', appConfig),
		...getAppTranspileOptions(appConfig, 'browser'),
		...overrides,
		environment: 'browser',
		entrypoints: input.entrypoints,
		plugins,
	};
}
