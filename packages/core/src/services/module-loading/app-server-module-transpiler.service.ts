import { requireBuildRuntime } from '../../build/runtime/build-runtime.ts';
import path from 'node:path';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { DevelopmentInvalidationService } from '../invalidation/development-invalidation.service.ts';
import { type AppModuleLoader, type AppModuleLoaderOwner } from './app-module-loader.service.ts';
import { PageModuleImportService, type PageModuleBuildImportOptions } from './page-module-import.service.ts';
import type { SourceModuleLoader } from './module-loading-types.ts';
import { supportsSourceModuleLoading } from './source-module-support.ts';
import { ServerModuleTranspiler } from './server-module-transpiler.service.ts';

export function shouldAppUseHostModuleLoader(appConfig: EcoPagesAppConfig, filePath: string): boolean {
	if (appConfig.runtime?.hostModuleLoader) {
		return supportsSourceModuleLoading(filePath);
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
	return getAppHostModuleLoader(appConfig) ? 'host' : 'app';
}

export function setAppHostModuleLoader(appConfig: EcoPagesAppConfig, hostModuleLoader?: SourceModuleLoader): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		hostModuleLoader,
	};
}

/**
 * Creates the app module loader that imports route modules through the build pipeline.
 *
 * @remarks
 * Caller `plugins` are treated as contributions only.
 * {@link PageModuleImportService} assembles the complete server request via
 * {@link createServerBuildRequest}; this loader does not merge app plugins.
 */
export function createAppModuleLoader(appConfig: EcoPagesAppConfig): AppModuleLoader {
	const pageModuleImportService = new PageModuleImportService(appConfig, {
		canLoadSourceModuleFromHost: (filePath) => shouldAppUseHostModuleLoader(appConfig, filePath),
		getHostModuleLoader: () => getAppHostModuleLoader(appConfig),
	});
	const appModuleLoader: AppModuleLoader & {
		pageModuleImportService: PageModuleImportService;
	} = {
		get owner(): AppModuleLoaderOwner {
			return getAppModuleLoaderOwner(appConfig);
		},
		pageModuleImportService,
		async importModule<T = unknown>(options: PageModuleBuildImportOptions) {
			return await pageModuleImportService.importModule<T>({
				...options,
				buildExecutor: options.buildExecutor ?? requireBuildRuntime(appConfig).getProfile('route-module'),
			});
		},
		invalidateDevelopmentGraph() {
			pageModuleImportService.invalidateDevelopmentGraph();
		},
	};

	return appModuleLoader;
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
		invalidateModules: (changedFiles) => invalidationService.invalidateServerModules(changedFiles),
		pageModuleImportService: getAppModuleLoader(appConfig),
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
