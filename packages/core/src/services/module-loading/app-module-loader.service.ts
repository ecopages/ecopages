import type { PageModuleBuildImportOptions } from './page-module-import.service.ts';

export interface AppModuleLoader {
	importModule<T = unknown>(options: PageModuleBuildImportOptions): Promise<T>;
	invalidateDevelopmentGraph(): void;
}
