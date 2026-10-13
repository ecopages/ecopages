/**
 * Build pipeline contracts and app-owned adapter wiring.
 *
 * @remarks
 * The build layer exposes three concentric shapes:
 *
 * - `BuildAdapter` — the low-level backend contract. The bundled adapter
 *   is the backend.
 * - `BuildExecutor` — the runtime-facing facade; the app's `BuildQueue`,
 *   stored on `appConfig.runtime.buildQueue`, implements it.
 * - App-owned helpers (`getAppBuildAdapter` and the `set*` counterparts) —
 *   the supported way for runtime code to read and mutate the active adapter
 *   per `EcoPagesAppConfig`.
 */

import { type BuildAdapter, type BuildOwnership } from './contracts/build-contracts.ts';
export type {
	BuildAdapter,
	BuildFormat,
	BuildChunk,
	BuildDependencyGraph,
	BuildExecutor,
	BuildFailure,
	BuildLog,
	BuildOptions,
	BuildOutput,
	BuildOwnership,
	BuildResult,
	BuildSourcemap,
	BuildSuccess,
	BuildTarget,
	BuildTranspileOptions,
	BuildEnvironment,
} from './contracts/build-contracts.ts';
import { createAppBuildManifest, type AppBuildManifest } from './contracts/build-manifest.ts';
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
 * Falls back to a manifest sealed from the config's loaders alone when the app
 * has not sealed one yet.
 */
export function getAppBuildManifest(appConfig: EcoPagesAppConfig): AppBuildManifest {
	return (
		appConfig.runtime?.buildManifest ??
		createAppBuildManifest(
			Array.from(appConfig.loaders?.values() ?? [], (plugin) => ({ plugin, source: `Loader "${plugin.name}"` })),
		)
	);
}

/**
 * Installs a sealed build manifest on one app instance.
 *
 * @remarks
 * Config finalization seals the manifest with {@link sealAppBuildManifest}. Call this directly only in tests.
 */
export function setAppBuildManifest(appConfig: EcoPagesAppConfig, buildManifest: AppBuildManifest): void {
	patchAppRuntime(appConfig, { buildManifest });
}

export {
	ensureIntegrationRuntimeReady,
	sealAppBuildManifest,
	setupAppRuntimePlugins,
} from './app-build-manifest-runtime.ts';
