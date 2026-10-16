/**
 * Build pipeline contracts and app-owned adapter wiring.
 *
 * @remarks
 * The build layer exposes two concentric shapes:
 *
 * - `BuildAdapter` — the low-level backend contract. The bundled adapter
 *   is the backend.
 * - `BuildExecutor` — the runtime-facing facade; the app's `BuildQueue`,
 *   stored on `AppRuntime.buildQueue`, implements it.
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
import { createRolldownBuildAdapter } from './rolldown/rolldown-build-adapter.ts';

/** Constructs the Rolldown build adapter. */
export function createBuildAdapter(): BuildAdapter {
	return createRolldownBuildAdapter();
}

/** The shared default-bundler backend instance. */
export const defaultRolldownBuildAdapter: BuildAdapter = createBuildAdapter();

/**
 * Global default build adapter.
 *
 * @remarks
 * Resolves to the bundled default-bundler adapter. App-aware code reads `requireAppRuntime(appConfig).buildAdapter`.
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

export {
	ensureIntegrationRuntimeReady,
	sealAppBuildManifest,
	setupAppRuntimeIntegrations,
	setupAppRuntimePlugins,
	teardownAppRuntimeIntegrations,
} from './app-build-manifest-runtime.ts';
