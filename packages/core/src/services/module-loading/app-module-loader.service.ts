import type { PageModuleBuildImportOptions } from './page-module-import.service.ts';

export type AppModuleLoaderOwner = 'bun' | 'host';

export interface AppModuleLoader {
	readonly owner: AppModuleLoaderOwner;
	importModule<T = unknown>(options: PageModuleBuildImportOptions): Promise<T>;
	invalidateDevelopmentGraph(): void;
}
