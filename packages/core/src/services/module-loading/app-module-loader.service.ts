import {
	PageModuleImportService,
	type PageModuleImportDependencies,
	type PageModuleImportOptions,
} from './page-module-import.service.ts';
import type { BuildExecutor } from '../../build/build-adapter.ts';

export type AppModuleLoaderOwner = 'bun' | 'host';

export interface AppModuleLoader {
	readonly owner: AppModuleLoaderOwner;
	importModule<T = unknown>(options: PageModuleImportOptions): Promise<T>;
	invalidateDevelopmentGraph(): void;
}

export type AppModuleLoaderOptions = {
	dependencies?: Partial<PageModuleImportDependencies>;
	getBuildExecutor?: () => BuildExecutor | undefined;
	getOwner?: () => AppModuleLoaderOwner;
	getInvalidationVersion?: () => number | undefined;
	pageModuleImportService?: PageModuleImportService;
};

export class RuntimeAppModuleLoader implements AppModuleLoader {
	private readonly pageModuleImportService: PageModuleImportService;
	private readonly getBuildExecutorValue: () => BuildExecutor | undefined;
	private readonly getOwnerValue: () => AppModuleLoaderOwner;
	private readonly getInvalidationVersionValue: () => number | undefined;

	constructor(options: AppModuleLoaderOptions = {}) {
		this.pageModuleImportService =
			options.pageModuleImportService ?? new PageModuleImportService(options.dependencies);
		this.getBuildExecutorValue = options.getBuildExecutor ?? (() => undefined);
		this.getOwnerValue = options.getOwner ?? (() => 'bun');
		this.getInvalidationVersionValue = options.getInvalidationVersion ?? (() => undefined);
	}

	get owner(): AppModuleLoaderOwner {
		return this.getOwnerValue();
	}

	async importModule<T = unknown>(options: PageModuleImportOptions): Promise<T> {
		return await this.pageModuleImportService.importModule<T>({
			...options,
			buildExecutor: options.buildExecutor ?? this.getBuildExecutorValue(),
			invalidationVersion: options.invalidationVersion ?? this.getInvalidationVersionValue(),
		});
	}

	invalidateDevelopmentGraph(): void {
		this.pageModuleImportService.invalidateDevelopmentGraph();
	}
}
