import {
	PageModuleImportService,
	type PageModuleImportDependencies,
	type PageModuleImportOptions,
} from './page-module-import.service.ts';
import type { BuildExecutor } from '../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../build/build-types.ts';

export type AppModuleLoaderOwner = 'bun' | 'host';

export interface AppModuleLoader {
	readonly owner: AppModuleLoaderOwner;
	importModule<T = unknown>(options: PageModuleImportOptions): Promise<T>;
	invalidateDevelopmentGraph(): void;
}

export type AppModuleLoaderOptions = {
	dependencies?: Partial<PageModuleImportDependencies>;
	getBuildExecutor?: () => BuildExecutor | undefined;
	getDefaultPlugins?: () => EcoBuildPlugin[];
	getOwner?: () => AppModuleLoaderOwner;
	getInvalidationVersion?: () => number | undefined;
	pageModuleImportService?: PageModuleImportService;
};

export class RuntimeAppModuleLoader implements AppModuleLoader {
	private readonly pageModuleImportService: PageModuleImportService;
	private readonly getBuildExecutorValue: () => BuildExecutor | undefined;
	private readonly getDefaultPluginsValue: () => EcoBuildPlugin[];
	private readonly getOwnerValue: () => AppModuleLoaderOwner;
	private readonly getInvalidationVersionValue: () => number | undefined;

	constructor(options: AppModuleLoaderOptions = {}) {
		this.pageModuleImportService =
			options.pageModuleImportService ?? new PageModuleImportService(options.dependencies);
		this.getBuildExecutorValue = options.getBuildExecutor ?? (() => undefined);
		this.getDefaultPluginsValue = options.getDefaultPlugins ?? (() => []);
		this.getOwnerValue = options.getOwner ?? (() => 'bun');
		this.getInvalidationVersionValue = options.getInvalidationVersion ?? (() => undefined);
	}

	get owner(): AppModuleLoaderOwner {
		return this.getOwnerValue();
	}

	async importModule<T = unknown>(options: PageModuleImportOptions): Promise<T> {
		const mergedPlugins = [...this.getDefaultPluginsValue(), ...(options.plugins ?? [])];

		return await this.pageModuleImportService.importModule<T>({
			...options,
			...(mergedPlugins.length > 0 ? { plugins: mergedPlugins } : {}),
			buildExecutor: options.buildExecutor ?? this.getBuildExecutorValue(),
			invalidationVersion: options.invalidationVersion ?? this.getInvalidationVersionValue(),
		});
	}

	invalidateDevelopmentGraph(): void {
		this.pageModuleImportService.invalidateDevelopmentGraph();
	}
}
