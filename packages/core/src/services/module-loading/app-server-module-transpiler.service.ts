import { requireBuildQueue } from '../../build/runtime/build-queue.ts';
import { requireAppRuntime } from '../../config/app-runtime.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { AppModuleLoader } from './app-module-loader.service.ts';
import { PageModuleImportService, type PageModuleBuildImportOptions } from './page-module-import.service.ts';
import { ServerModuleTranspiler } from './server-module-transpiler.service.ts';

/**
 * Creates the app module loader that imports route modules through the build pipeline.
 *
 * @remarks
 * Caller `plugins` are treated as contributions only.
 * {@link PageModuleImportService} assembles the complete server request via
 * {@link createServerBuildRequest}; this loader does not merge app plugins.
 */
export function createAppModuleLoader(appConfig: EcoPagesAppConfig): AppModuleLoader {
	const pageModuleImportService = new PageModuleImportService(appConfig);
	const appModuleLoader: AppModuleLoader & {
		pageModuleImportService: PageModuleImportService;
	} = {
		pageModuleImportService,
		async importModule<T = unknown>(options: PageModuleBuildImportOptions) {
			return await pageModuleImportService.importModule<T>({
				...options,
				buildExecutor: options.buildExecutor ?? requireBuildQueue(appConfig),
			});
		},
		invalidateDevelopmentGraph() {
			pageModuleImportService.invalidateDevelopmentGraph();
		},
		getDevelopmentGeneration() {
			return pageModuleImportService.getDevelopmentGeneration();
		},
	};

	return appModuleLoader;
}

/**
 * Creates the shared app-scoped server-module transpiler for one runtime
 * instance.
 */
export function createAppServerModuleTranspiler(appConfig: EcoPagesAppConfig): ServerModuleTranspiler {
	return new ServerModuleTranspiler({
		rootDir: appConfig.rootDir,
		pageModuleImportService: requireAppRuntime(appConfig).moduleLoader,
	});
}
