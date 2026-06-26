import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import {
	getAppBuildAdapter,
	getAppBuildExecutor,
	getAppServerBuildPlugins,
	setAppBuildExecutor,
	withBuildExecutorPlugins,
	type BuildExecutor,
} from './build-adapter.ts';
import { SerializedBuildExecutor } from './serialized-build-executor.ts';

/**
 * Installs the app-owned runtime build executor for one app instance.
 *
 * @remarks
 * Wraps the app-owned adapter in a {@link SerializedBuildExecutor} so
 * every dev-watch caller issues builds against a single FIFO queue.
 * Plugin injection is applied here via {@link withBuildExecutorPlugins}
 * so app-owned plugins are merged into every rebuild without callers
 * having to know about the manifest.
 *
 * Idempotent across calls: re-invoking replaces the existing executor
 * on `appConfig.runtime` with a fresh wrapper.
 *
 * @param appConfig - The app config whose runtime state is updated.
 *   The function reads the existing executor (falling back to the
 *   app-owned adapter) and writes the wrapped executor back.
 * @returns The installed {@link BuildExecutor}.
 */
export function installAppRuntimeBuildExecutor(appConfig: EcoPagesAppConfig): BuildExecutor {
	const baseExecutor = getAppBuildExecutor(appConfig) ?? getAppBuildAdapter(appConfig);
	const buildExecutor = new SerializedBuildExecutor(
		withBuildExecutorPlugins(baseExecutor, () => getAppServerBuildPlugins(appConfig)),
	);
	setAppBuildExecutor(appConfig, buildExecutor);
	return buildExecutor;
}
