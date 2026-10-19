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

import { type BuildAdapter } from './contracts/build-contracts.ts';
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

export {
	ensureIntegrationRuntimeReady,
	sealAppBuildManifest,
	setupAppRuntimeIntegrations,
	setupAppRuntimePlugins,
	teardownAppRuntimeIntegrations,
} from './app-build-manifest-runtime.ts';
