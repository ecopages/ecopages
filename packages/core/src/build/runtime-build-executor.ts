import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { BuildExecutor } from './build-adapter.ts';
import {
	disposeAppBuildRuntime,
	installBuildRuntime,
	requireBuildRuntime,
	type BuildRuntime,
} from './build-runtime.ts';

export type { BuildProfile, BuildRuntime } from './build-runtime.ts';
export {
	disposeAppBuildRuntime,
	getBuildRuntime,
	installBuildRuntime,
	requireBuildRuntime,
} from './build-runtime.ts';

/**
 * Installs the app-owned runtime build executors for one app instance.
 *
 * @remarks
 * Delegates to {@link installBuildRuntime}. Route-module and HMR browser builds
 * use parallel one-shot Rolldown. Server-entry bundling stays serialized
 * single-flight.
 */
export function installAppRuntimeBuildExecutor(appConfig: EcoPagesAppConfig): BuildExecutor {
	return installBuildRuntime(appConfig).getProfile('route-module');
}

export function getInstalledServerEntryBuildExecutor(appConfig: EcoPagesAppConfig): BuildExecutor {
	return requireBuildRuntime(appConfig).getProfile('server-entry');
}
