import type { PageModuleBuildImportOptions } from './page-module-import.service.ts';
import { requireBuildQueue } from '../../build/runtime/build-queue.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { PageModuleImportService } from './page-module-import.service.ts';

export type AppModuleImportOptions = Omit<PageModuleBuildImportOptions, 'buildExecutor' | 'rootDir'>;

export interface AppModuleLoaderContract {
	importModule<T = unknown>(options: AppModuleImportOptions): Promise<T>;
	invalidateDevelopmentGraph(): void;
	getDevelopmentGeneration(): number;
}

interface ModuleImportDependency {
	importModule<T = unknown>(options: PageModuleBuildImportOptions): Promise<T>;
	invalidateDevelopmentGraph(): void;
	getDevelopmentGeneration(): number;
}

/**
 * Owns app-scoped server source imports and development invalidation.
 *
 * @remarks
 * The loader always uses the finalized app's root and build queue. Tests may inject the import dependency to
 * verify the app boundary without replacing the runtime state.
 */
export class AppModuleLoader implements AppModuleLoaderContract {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly pageModuleImportService: ModuleImportDependency;

	constructor(
		appConfig: EcoPagesAppConfig,
		pageModuleImportService: ModuleImportDependency = new PageModuleImportService(appConfig),
	) {
		this.appConfig = appConfig;
		this.pageModuleImportService = pageModuleImportService;
	}

	async importModule<T = unknown>(options: AppModuleImportOptions): Promise<T> {
		return await this.pageModuleImportService.importModule<T>({
			...options,
			rootDir: this.appConfig.rootDir,
			buildExecutor: requireBuildQueue(this.appConfig),
		});
	}

	invalidateDevelopmentGraph(): void {
		this.pageModuleImportService.invalidateDevelopmentGraph();
	}

	/**
	 * Returns the app's current server-module generation.
	 *
	 * @remarks
	 * Dev caches that outlive one import use this to detect when the watcher marked their source modules stale.
	 */
	getDevelopmentGeneration(): number {
		return this.pageModuleImportService.getDevelopmentGeneration();
	}
}
