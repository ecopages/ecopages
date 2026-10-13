/**
 * Build pipeline contracts and app-owned adapter wiring.
 *
 * @remarks
 * The build layer exposes three concentric shapes:
 *
 * - `BuildAdapter` — the low-level backend contract. The bundled adapter
 *   is the backend.
 * - `BuildExecutor` — the runtime-facing facade stored on
 *   `appConfig.runtime.buildRuntime` via profile-based accessors.
 * - App-owned helpers (`getAppBuildAdapter` and the `set*` counterparts) —
 *   the supported way for runtime code to read and mutate the active adapter
 *   per `EcoPagesAppConfig`. Profile executors live on
 *   `appConfig.runtime.buildRuntime`.
 */

import type { EcoBuildPlugin } from './contracts/build-types.ts';
import {
	type BuildAdapter,
	type BuildExecutor,
	type BuildOptions,
	type BuildOwnership,
	type BuildResult,
	type BuildTranspileOptions,
	type BuildEnvironment,
} from './contracts/build-contracts.ts';
export type {
	BuildAdapter,
	BuildFormat,
	BuildChunk,
	BuildDependencyGraph,
	BuildExecutor,
	BuildOptions,
	BuildOutput,
	BuildOwnership,
	BuildResult,
	BuildSourcemap,
	BuildTarget,
	BuildTranspileOptions,
	BuildEnvironment,
} from './contracts/build-contracts.ts';
import {
	createAppBuildManifest,
	getBrowserBuildPlugins,
	getServerBuildPlugins,
	type AppBuildManifest,
} from './contracts/build-manifest.ts';
import { createAliasResolverPlugin } from '../plugins/alias-resolver-plugin.ts';
import { getJsxOwnershipPlugins } from './browser/jsx-ownership-plugins.ts';
import { createRolldownBuildAdapter } from './rolldown/rolldown-build-adapter.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';

/**
 * @remarks
 * All runtime-bag setters funnel through here so `appConfig.runtime` is patched
 * in one place instead of repeating the spread-merge at every call site.
 */
function patchAppRuntime(
	appConfig: EcoPagesAppConfig,
	patch: Partial<NonNullable<EcoPagesAppConfig['runtime']>>,
): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		...patch,
	};
}

/** Constructs the Rolldown build adapter. */
export function createBuildAdapter(): BuildAdapter {
	return createRolldownBuildAdapter();
}

/** The shared default-bundler backend instance. Use {@link getAppBuildAdapter} in app-aware code. */
export const defaultRolldownBuildAdapter: BuildAdapter = createBuildAdapter();

/**
 * Global default build adapter.
 *
 * @remarks
 * Resolves to the bundled default-bundler adapter. New app-aware
 * code should prefer {@link getAppBuildAdapter}.
 */
export const defaultBuildAdapter: BuildAdapter = defaultRolldownBuildAdapter;

/** Resolves the default build adapter. */
export function getDefaultBuildAdapter(): BuildAdapter {
	return defaultRolldownBuildAdapter;
}

/**
 * Reads the {@link BuildOwnership} declared on a {@link BuildAdapter}.
 *
 * @param buildAdapter - When `undefined`, defaults to `'rolldown'`.
 */
export function getBuildAdapterOwnership(buildAdapter: BuildAdapter | undefined): BuildOwnership {
	return buildAdapter?.ownership ?? 'rolldown';
}

/**
 * Returns the ownership declared by the app's build adapter, or `'rolldown'` when none is installed.
 */
export function getAppBuildOwnership(appConfig: EcoPagesAppConfig): BuildOwnership {
	return getBuildAdapterOwnership(appConfig.runtime?.buildAdapter);
}

/**
 * Returns the adapter owned by an app/runtime instance.
 *
 * @remarks
 * Falls back through `appConfig.runtime.buildAdapter` to the Rolldown default.
 */
export function getAppBuildAdapter(appConfig: EcoPagesAppConfig): BuildAdapter {
	return appConfig.runtime?.buildAdapter ?? getDefaultBuildAdapter();
}

/**
 * Installs the adapter that should serve future builds for one app instance.
 */
export function setAppBuildAdapter(appConfig: EcoPagesAppConfig, buildAdapter: BuildAdapter): void {
	patchAppRuntime(appConfig, { buildAdapter });
}

/**
 * Returns the build manifest owned by an app/runtime instance.
 *
 * @remarks
 * Falls back to a fresh manifest seeded from the config's loaders when
 * the app config has no manifest yet. This is the supported way to
 * read the manifest across the source-loading and asset-processing
 * services.
 */
export function getAppBuildManifest(appConfig: EcoPagesAppConfig): AppBuildManifest {
	return (
		appConfig.runtime?.buildManifest ??
		createAppBuildManifest({
			plugins: Array.from(appConfig.loaders?.values() ?? []),
		})
	);
}

/** Installs the build manifest that should be visible to one app instance.
 *
 * @remarks
 * Production apps are sealed via {@link updateAppBuildManifest} during
 * config finalization. Call `setAppBuildManifest` directly only in tests or
 * when replacing the entire manifest object; partial updates should use
 * {@link updateAppBuildManifest}.
 */
export function setAppBuildManifest(appConfig: EcoPagesAppConfig, buildManifest: AppBuildManifest): void {
	patchAppRuntime(appConfig, { buildManifest });
}

/**
 * Builds a fresh app manifest from the config's loaders plus optional
 * caller-supplied runtime/browser contributions.
 *
 * @remarks
 * Loader plugins are always taken from the config; runtime and
 * browser-bundle plugins are passed through from the caller when
 * supplied, otherwise left empty for later population by
 * {@link collectConfiguredAppBuildManifestContributions}.
 */
export function createConfiguredAppBuildManifest(
	appConfig: EcoPagesAppConfig,
	input?: Partial<AppBuildManifest>,
): AppBuildManifest {
	return createAppBuildManifest({
		plugins: [...appConfig.loaders.values(), ...(input?.plugins ?? [])],
		browserRuntimeManifest: input?.browserRuntimeManifest,
	});
}

/**
 * Replaces the app-owned manifest using config-owned loaders and the
 * caller-supplied contribution input.
 *
 * @remarks
 * Primary production entry: config finalization passes the return value of
 * {@link collectConfiguredAppBuildManifestContributions} here to seal
 * `appConfig.runtime.buildManifest` before startup.
 */
export function updateAppBuildManifest(appConfig: EcoPagesAppConfig, input?: Partial<AppBuildManifest>): void {
	setAppBuildManifest(appConfig, createConfiguredAppBuildManifest(appConfig, input));
}

export {
	collectConfiguredAppBuildManifestContributions,
	ensureIntegrationRuntimeReady,
	setupAppRuntimePlugins,
} from './app-build-manifest-runtime.ts';

/**
 * Returns the server-bundle plugin list for one app/runtime instance.
 *
 * @remarks
 * Reads from the app's sealed build manifest; the manifest itself is
 * the source of truth for which plugins participate in the server
 * bundle.
 */
export function getAppServerBuildPlugins(appConfig: EcoPagesAppConfig): EcoBuildPlugin[] {
	const projectDir = appConfig.absolutePaths?.projectDir;
	const aliasPlugin = projectDir ? [createAliasResolverPlugin(projectDir)] : [];
	return [...aliasPlugin, ...getServerBuildPlugins(getAppBuildManifest(appConfig))];
}

/**
 * Returns the browser-bundle plugin list for one app/runtime instance.
 *
 * @remarks
 * Reads from the app's sealed build manifest. The browser-bundle
 * manifest is the source of truth for which plugins participate in the
 * browser bundle. Source transforms register as `transform` plugins and
 * stay in this list so they run after first-wins `onLoad`.
 */
export function getAppBrowserBuildPlugins(appConfig: EcoPagesAppConfig): EcoBuildPlugin[] {
	const manifest = getAppBuildManifest(appConfig);
	const browserPlugins = getBrowserBuildPlugins(manifest);
	const projectDir = appConfig.absolutePaths?.projectDir;
	const aliasPlugin = projectDir ? [createAliasResolverPlugin(projectDir)] : [];
	return [...aliasPlugin, ...browserPlugins, ...getJsxOwnershipPlugins(appConfig)];
}

/**
 * Runs a build through the active pipeline.
 *
 * @remarks
 * `executor` defaults to the default-bundler adapter for non-app-aware
 * callsites. App-aware code should pass a profile executor from
 * {@link requireBuildRuntime} to honor the per-app pipeline.
 */
export function build(
	options: BuildOptions,
	executor: BuildExecutor = defaultRolldownBuildAdapter,
): Promise<BuildResult> {
	return executor.build(options);
}

/**
 * Default transpile-options helper for callsites without app runtime
 * context.
 *
 * @remarks
 * New app-aware code should prefer {@link getAppTranspileOptions}.
 */
export function getTranspileOptions(environment: BuildEnvironment): BuildTranspileOptions {
	return defaultRolldownBuildAdapter.getTranspileOptions(environment);
}

/**
 * Resolves transpile options for one app/runtime instance by asking
 * the app's adapter.
 */
export function getAppTranspileOptions(
	appConfig: EcoPagesAppConfig,
	environment: BuildEnvironment,
): BuildTranspileOptions {
	return getAppBuildAdapter(appConfig).getTranspileOptions(environment);
}
