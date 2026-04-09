import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import {
	getAppBuildAdapter,
	getAppBuildExecutor,
	getAppBuildOwnership,
	getAppServerBuildPlugins,
	setAppBuildExecutor,
	type BuildExecutor,
} from './build-adapter.ts';
import { createOrReuseAppBuildExecutor, withBuildExecutorPlugins } from './dev-build-coordinator.ts';

/**
 * Installs the app-owned runtime build executor for one app instance.
 *
 * @remarks
 * This is the single runtime executor boundary for adapter-owned startup.
 * Bun-native ownership may reuse `DevBuildCoordinator` in development, while
 * Vite-host ownership stays on a plain host-owned executor boundary with no
 * Bun-specific coordination policy.
 */
export function installAppRuntimeBuildExecutor(
	appConfig: EcoPagesAppConfig,
	options: {
		development: boolean;
	},
): BuildExecutor {
	const buildOwnership = getAppBuildOwnership(appConfig);
	const buildExecutor =
		buildOwnership === 'bun-native'
			? createOrReuseAppBuildExecutor({
					development: options.development,
					adapter: getAppBuildAdapter(appConfig),
					currentExecutor: getAppBuildExecutor(appConfig),
					getPlugins: () => getAppServerBuildPlugins(appConfig),
				})
			: withBuildExecutorPlugins(getAppBuildAdapter(appConfig), () => getAppServerBuildPlugins(appConfig));

	setAppBuildExecutor(appConfig, buildExecutor);
	return buildExecutor;
}
