import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import {
	getAppBuildAdapter,
	getAppBuildExecutor,
	getAppServerBuildPlugins,
	setAppBuildExecutor,
	type BuildExecutor,
} from './build-adapter.ts';
import { createOrReuseAppBuildExecutor } from './dev-build-coordinator.ts';

/**
 * Installs the app-owned runtime build executor for one app instance.
 *
 * @remarks
 * This is the single coordinator boundary for runtime executor ownership across
 * adapters. It preserves an existing development coordinator when available and
 * always applies app server build plugins through one shared path.
 */
export function installAppRuntimeBuildExecutor(
	appConfig: EcoPagesAppConfig,
	options: {
		development: boolean;
	},
): BuildExecutor {
	const buildExecutor = createOrReuseAppBuildExecutor({
		development: options.development,
		adapter: getAppBuildAdapter(appConfig),
		currentExecutor: getAppBuildExecutor(appConfig),
		getPlugins: () => getAppServerBuildPlugins(appConfig),
	});

	setAppBuildExecutor(appConfig, buildExecutor);
	return buildExecutor;
}
