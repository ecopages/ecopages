import { getAppBuildExecutor } from '../../build/build-adapter.js';
import type { EcoPagesAppConfig } from '../../internal-types.js';
import { createAppNodeBootstrapPlugin } from '../../adapters/node/bootstrap-dependency-resolver.ts';
import { DevelopmentInvalidationService } from '../invalidation/development-invalidation.service.ts';
import { ServerModuleTranspiler } from './server-module-transpiler.service.ts';

/**
 * Creates the shared app-scoped server-module transpiler for one runtime
 * instance.
 */
export function createAppServerModuleTranspiler(appConfig: EcoPagesAppConfig): ServerModuleTranspiler {
	const invalidationService = new DevelopmentInvalidationService(appConfig);

	return new ServerModuleTranspiler({
		rootDir: appConfig.rootDir,
		getBuildExecutor: () => getAppBuildExecutor(appConfig),
		getInvalidationVersion: () => invalidationService.getServerModuleInvalidationVersion(),
		invalidateModules: (changedFiles) => invalidationService.invalidateServerModules(changedFiles),
		getDefaultPlugins:
			typeof Bun === 'undefined' && appConfig.rootDir
				? () => [createAppNodeBootstrapPlugin(appConfig)]
				: undefined,
	});
}

/**
 * Returns the app-owned server-module transpiler, creating it lazily when the
 * runtime first needs one.
 */
export function getAppServerModuleTranspiler(appConfig: EcoPagesAppConfig): ServerModuleTranspiler {
	const existingTranspiler = appConfig.runtime?.serverModuleTranspiler;
	if (existingTranspiler) {
		return existingTranspiler;
	}

	const serverModuleTranspiler = createAppServerModuleTranspiler(appConfig);
	setAppServerModuleTranspiler(appConfig, serverModuleTranspiler);
	return serverModuleTranspiler;
}

/**
 * Installs the server-module transpiler that should serve one app instance.
 */
export function setAppServerModuleTranspiler(
	appConfig: EcoPagesAppConfig,
	serverModuleTranspiler: ServerModuleTranspiler,
): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		serverModuleTranspiler,
	};
}
