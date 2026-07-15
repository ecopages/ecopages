import { availableParallelism } from 'node:os';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { getAppBuildAdapter, type BuildExecutor } from './build-adapter.ts';
import { ParallelBuildExecutor } from './parallel-build-executor.ts';
import { DedupingBuildExecutor } from './deduping-build-executor.ts';
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
		const limit = resolveParallelismLimit();

		this.serverEntryExecutor = new SerializedBuildExecutor(adapter);
		this.routeModuleExecutor = new DedupingBuildExecutor(new ParallelBuildExecutor(adapter, limit));
		this.hmrExecutor = new DedupingBuildExecutor(new ParallelBuildExecutor(adapter, Math.min(3, limit)));
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

	/**
	 * No-op for profile teardown.
	 *
	 * @remarks
	 * Rolldown-owned profiles use one-shot builds, and Vite-host profiles only
	 * wrap a boundary marker. Neither owns a long-lived engine to close.
	 */
	async dispose(): Promise<void> {}
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
 * For Rolldown ownership, server-entry stays serialized single-flight while
 * route-module and browser-HMR run in parallel one-shot builds. Vite-host
 * profiles wrap a boundary marker and reject framework-owned build attempts.
 * Profiles do not inject app plugins — assemble complete
 * {@link BuildOptions} with {@link createServerBuildRequest} /
 * {@link createBrowserBuildRequest} (or {@link BrowserBundleService}) first.
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
