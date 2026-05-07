import type { PageModuleImportOptions } from './page-module-import.service.ts';

export type AppModuleLoaderOwner = 'bun' | 'host';

export interface AppModuleLoader {
	readonly owner: AppModuleLoaderOwner;
	importModule<T = unknown>(options: PageModuleImportOptions): Promise<T>;
	invalidateDevelopmentGraph(): void;
}
