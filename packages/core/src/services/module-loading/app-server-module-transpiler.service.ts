import { getAppBuildExecutor } from '../../build/build-adapter.ts';
import path from 'node:path';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { DevelopmentInvalidationService } from '../invalidation/development-invalidation.service.ts';
import {
	RuntimeAppModuleLoader,
	type AppModuleLoader,
	type AppModuleLoaderOwner,
} from './app-module-loader.service.ts';
import { createAppNodeBootstrapPlugin } from './node-bootstrap-plugin.ts';
import type { SourceModuleLoader } from './module-loading-types.ts';
import { ServerModuleTranspiler } from './server-module-transpiler.service.ts';

function supportsHostSourceModuleLoading(filePath: string): boolean {
	const extension = path.extname(filePath);
	return (
		extension === '.js' ||
		extension === '.jsx' ||
		extension === '.ts' ||
		extension === '.tsx' ||
		extension === '.mjs' ||
		extension === '.mts' ||
		extension === '.cjs' ||
		extension === '.cts'
	);
}

export function shouldAppUseHostModuleLoader(appConfig: EcoPagesAppConfig, filePath: string): boolean {
	if (appConfig.runtime?.hostModuleLoader) {
		return supportsHostSourceModuleLoading(filePath);
	}

	const normalizedFilePath = path.normalize(filePath);
	const frameworkOwnedDirectories = [
		appConfig.absolutePaths.pagesDir,
		appConfig.absolutePaths.includesDir,
		appConfig.absolutePaths.layoutsDir,
		appConfig.absolutePaths.componentsDir,
	].map((directoryPath) => path.normalize(directoryPath));
	const isFrameworkOwnedModule = frameworkOwnedDirectories.some((directoryPath) => {
		return normalizedFilePath === directoryPath || normalizedFilePath.startsWith(`${directoryPath}${path.sep}`);
	});
	const isConfiguredTemplateModule = appConfig.templatesExt.some((extension) =>
		normalizedFilePath.endsWith(extension),
	);

	return !(isFrameworkOwnedModule && isConfiguredTemplateModule);
}

export function getAppHostModuleLoader(appConfig: EcoPagesAppConfig): SourceModuleLoader | undefined {
	return appConfig.runtime?.hostModuleLoader;
}

function getAppModuleLoaderOwner(appConfig: EcoPagesAppConfig): AppModuleLoaderOwner {
	return getAppHostModuleLoader(appConfig) ? 'host' : 'bun';
}

export function setAppHostModuleLoader(appConfig: EcoPagesAppConfig, hostModuleLoader?: SourceModuleLoader): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		hostModuleLoader,
	};
}

export function createAppModuleLoader(appConfig: EcoPagesAppConfig): AppModuleLoader {
	const invalidationService = new DevelopmentInvalidationService(appConfig);

	return new RuntimeAppModuleLoader({
		dependencies: {
			canLoadSourceModuleFromHost: (filePath) => shouldAppUseHostModuleLoader(appConfig, filePath),
			getHostModuleLoader: () => getAppHostModuleLoader(appConfig),
		},
		getBuildExecutor: () => getAppBuildExecutor(appConfig),
		getOwner: () => getAppModuleLoaderOwner(appConfig),
		getInvalidationVersion: () => invalidationService.getServerModuleInvalidationVersion(),
	});
}

export function getAppModuleLoader(appConfig: EcoPagesAppConfig): AppModuleLoader {
	const existingModuleLoader = appConfig.runtime?.appModuleLoader;
	if (existingModuleLoader) {
		return existingModuleLoader;
	}

	const appModuleLoader = createAppModuleLoader(appConfig);
	setAppModuleLoader(appConfig, appModuleLoader);
	return appModuleLoader;
}

export function setAppModuleLoader(appConfig: EcoPagesAppConfig, appModuleLoader: AppModuleLoader): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		appModuleLoader,
	};
}

/**
 * Creates the shared app-scoped server-module transpiler for one runtime
 * instance.
 */
export function createAppServerModuleTranspiler(appConfig: EcoPagesAppConfig): ServerModuleTranspiler {
	const invalidationService = new DevelopmentInvalidationService(appConfig);

	return new ServerModuleTranspiler({
		rootDir: appConfig.rootDir,
		getBuildExecutor: () => getAppBuildExecutor(appConfig),
		getHostModuleLoader: () => getAppHostModuleLoader(appConfig),
		canLoadSourceModuleFromHost: (filePath) => shouldAppUseHostModuleLoader(appConfig, filePath),
		getInvalidationVersion: () => invalidationService.getServerModuleInvalidationVersion(),
		invalidateModules: (changedFiles) => invalidationService.invalidateServerModules(changedFiles),
		pageModuleImportService: getAppModuleLoader(appConfig),
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
