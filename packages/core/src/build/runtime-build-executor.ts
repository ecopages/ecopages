import { availableParallelism } from 'node:os';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import {
	getAppBuildAdapter,
	getAppServerBuildPlugins,
	setAppBuildExecutor,
	setAppHmrBuildExecutor,
	setAppRouteModuleBuildExecutor,
	withBuildExecutorPlugins,
	type BuildExecutor,
} from './build-adapter.ts';
import { ParallelBuildExecutor } from './parallel-build-executor.ts';
import { SerializedBuildExecutor } from './serialized-build-executor.ts';

function createPluginWrappedExecutor(appConfig: EcoPagesAppConfig): BuildExecutor {
	return withBuildExecutorPlugins(getAppBuildAdapter(appConfig), () => getAppServerBuildPlugins(appConfig));
}

function resolveParallelismLimit(): number {
	return Math.max(1, availableParallelism() - 1);
}

/**
 * Installs the app-owned runtime build executors for one app instance.
 *
 * @remarks
 * Route-module and HMR browser builds run through a {@link ParallelBuildExecutor}
 * so independent compiles can overlap. Server-entry bundling continues to call
 * the raw adapter directly and stays single-flight by design.
 *
 * Idempotent across calls: re-invoking replaces the existing executors on
 * `appConfig.runtime` with fresh wrappers.
 */
export function installAppRuntimeBuildExecutor(appConfig: EcoPagesAppConfig): BuildExecutor {
	const pluginWrappedExecutor = createPluginWrappedExecutor(appConfig);
	const parallelismLimit = resolveParallelismLimit();
	const routeModuleBuildExecutor = new ParallelBuildExecutor(pluginWrappedExecutor, parallelismLimit);
	const hmrBuildExecutor = new ParallelBuildExecutor(pluginWrappedExecutor, Math.min(3, parallelismLimit));

	setAppRouteModuleBuildExecutor(appConfig, routeModuleBuildExecutor);
	setAppHmrBuildExecutor(appConfig, hmrBuildExecutor);
	setAppBuildExecutor(appConfig, routeModuleBuildExecutor);

	return routeModuleBuildExecutor;
}

export function getInstalledServerEntryBuildExecutor(appConfig: EcoPagesAppConfig): BuildExecutor {
	const existing = appConfig.runtime?.serverEntryBuildExecutor;
	if (existing) {
		return existing;
	}

	const serverEntryBuildExecutor = new SerializedBuildExecutor(createPluginWrappedExecutor(appConfig));
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		serverEntryBuildExecutor,
	};
	return serverEntryBuildExecutor;
}
