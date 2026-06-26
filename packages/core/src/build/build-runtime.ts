import { availableParallelism } from 'node:os';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import {
	getAppBrowserBuildPlugins,
	getAppBuildAdapter,
	getAppServerBuildPlugins,
	withBuildExecutorPlugins,
	type BuildExecutor,
} from './build-adapter.ts';
import { ParallelBuildExecutor } from './parallel-build-executor.ts';
import { SerializedBuildExecutor } from './serialized-build-executor.ts';

export type BuildProfile = 'server-entry' | 'route-module' | 'browser-hmr';

function resolveParallelismLimit(): number {
	return Math.max(1, availableParallelism() - 1);
}

function patchAppRuntime(
	appConfig: EcoPagesAppConfig,
	patch: Partial<NonNullable<EcoPagesAppConfig['runtime']>>,
): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		...patch,
	};
}

export interface BuildRuntime {
	getProfile(profile: BuildProfile): BuildExecutor;
	dispose(): Promise<void>;
}

class AppBuildRuntime implements BuildRuntime {
	private readonly serverEntryExecutor: BuildExecutor;
	private readonly routeModuleExecutor: BuildExecutor;
	private readonly hmrExecutor: BuildExecutor;

	constructor(appConfig: EcoPagesAppConfig) {
		const adapter = getAppBuildAdapter(appConfig);
		const serverPlugins = withBuildExecutorPlugins(adapter, () => getAppServerBuildPlugins(appConfig));
		const browserPlugins = withBuildExecutorPlugins(adapter, () => getAppBrowserBuildPlugins(appConfig));
		const limit = resolveParallelismLimit();

		this.serverEntryExecutor = new SerializedBuildExecutor(serverPlugins);
		this.routeModuleExecutor = new ParallelBuildExecutor(serverPlugins, limit);
		this.hmrExecutor = new ParallelBuildExecutor(browserPlugins, Math.min(3, limit));
	}

	getProfile(profile: BuildProfile): BuildExecutor {
		switch (profile) {
			case 'server-entry':
				return this.serverEntryExecutor;
			case 'route-module':
				return this.routeModuleExecutor;
			case 'browser-hmr':
				return this.hmrExecutor;
		}
	}

	async dispose(): Promise<void> {
		// No long-lived engines to close; one-shot Rolldown builds per call.
	}
}

export function getBuildRuntime(appConfig: EcoPagesAppConfig): BuildRuntime | undefined {
	return appConfig.runtime?.buildRuntime;
}

/**
 * Returns the installed build runtime, installing it when missing.
 */
export function requireBuildRuntime(appConfig: EcoPagesAppConfig): BuildRuntime {
	return getBuildRuntime(appConfig) ?? installBuildRuntime(appConfig);
}

/**
 * Installs profile-based build executors for one app instance.
 *
 * @remarks
 * All profiles use one-shot Rolldown. Server-entry stays serialized
 * single-flight; route-module and browser-HMR run in parallel.
 */
export function installBuildRuntime(appConfig: EcoPagesAppConfig): BuildRuntime {
	const buildRuntime = new AppBuildRuntime(appConfig);
	patchAppRuntime(appConfig, { buildRuntime });
	return buildRuntime;
}

/**
 * No-op retained for server teardown call sites.
 */
export async function disposeAppBuildRuntime(appConfig: EcoPagesAppConfig): Promise<void> {
	await getBuildRuntime(appConfig)?.dispose();
}
