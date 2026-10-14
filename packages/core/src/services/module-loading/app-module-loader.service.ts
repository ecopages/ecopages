import type { PageModuleBuildImportOptions } from './page-module-import.service.ts';

export interface AppModuleLoader {
	importModule<T = unknown>(options: PageModuleBuildImportOptions): Promise<T>;
	invalidateDevelopmentGraph(): void;
	/**
	 * The development generation of the app: it grows by one each time server modules are marked stale.
	 *
	 * @remarks
	 * Anything that outlives one import, such as a compiled output name or a render worker, compares this
	 * number to know whether the server code it holds is stale. On an assembled app the counter is the
	 * runtime's server invalidation state; this method reports that counter.
	 */
	getDevelopmentGeneration(): number;
}
