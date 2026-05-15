import type { BuildExecutor } from '../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import type { AppModuleLoader } from './app-module-loader.service.ts';
import { PageModuleImportService, type PageModuleBuildImportOptions } from './page-module-import.service.ts';
import type { SourceModuleLoaderFactory } from './module-loading-types.ts';

export type ServerModuleTranspilerOptions = Omit<PageModuleBuildImportOptions, 'rootDir' | 'buildExecutor'>;

export type ServerModuleImportDependency = Pick<AppModuleLoader, 'importModule' | 'invalidateDevelopmentGraph'>;

/**
 * Immutable execution context for one server-transpiler instance.
 *
 * @remarks
 * Callers own when and why a new transpiler is created. This service only owns
 * applying the supplied root/build-executor pair consistently to every module
 * load that passes through it.
 */
export type ServerModuleTranspilerBootstrapArgs = {
	rootDir: string;
	getBuildExecutor?: () => BuildExecutor | undefined;
	canLoadSourceModuleFromHost?: (filePath: string) => boolean;
	getHostModuleLoader?: SourceModuleLoaderFactory;
	getInvalidationVersion?: () => number;
	invalidateModules?: (changedFiles?: string[]) => void;
	pageModuleImportService?: ServerModuleImportDependency;
	/** Factory evaluated on each importModule call to produce plugins applied to every load. */
	getDefaultPlugins?: () => EcoBuildPlugin[];
};

/**
 * App-owned boundary for server-side source module loading.
 *
 * @remarks
 * This service centralizes server-side module transpilation and import behind
 * an explicit caller-owned root and build executor.
 */
export class ServerModuleTranspiler {
	private readonly pageModuleImportService: ServerModuleImportDependency;
	private readonly getRootDir: () => string;
	private readonly getBuildExecutor: () => BuildExecutor | undefined;
	private readonly getInvalidationVersion: () => number | undefined;
	private readonly invalidateModules: (changedFiles?: string[]) => void;
	private readonly getDefaultPlugins: () => EcoBuildPlugin[];

	/**
	 * Creates one explicit server-transpiler boundary for a given execution
	 * context.
	 */
	constructor(args: ServerModuleTranspilerBootstrapArgs) {
		this.pageModuleImportService =
			args.pageModuleImportService ??
			new PageModuleImportService({
				canLoadSourceModuleFromHost: args.canLoadSourceModuleFromHost,
				getHostModuleLoader: args.getHostModuleLoader,
			});
		this.getRootDir = () => args.rootDir;
		this.getBuildExecutor = args.getBuildExecutor ?? (() => undefined);
		this.getInvalidationVersion = () => args.getInvalidationVersion?.();
		this.getDefaultPlugins = args.getDefaultPlugins ?? (() => []);
		this.invalidateModules = (changedFiles) => {
			if (args.invalidateModules) {
				args.invalidateModules(changedFiles);
				return;
			}

			this.pageModuleImportService.invalidateDevelopmentGraph();
		};
	}

	/**
	 * Loads a server-side source module through the caller-owned transpile
	 * context.
	 */
	async importModule<T = unknown>(options: ServerModuleTranspilerOptions): Promise<T> {
		const mergedPlugins = [...this.getDefaultPlugins(), ...(options.plugins ?? [])];
		const { plugins: _plugins, ...baseOptions } = options;
		return await this.pageModuleImportService.importModule<T>({
			...baseOptions,
			...(mergedPlugins.length > 0 ? { plugins: mergedPlugins } : {}),
			rootDir: this.getRootDir(),
			buildExecutor: this.getBuildExecutor(),
			invalidationVersion: this.getInvalidationVersion(),
		});
	}

	/**
	 * Invalidates cached module state for development reloads.
	 */
	invalidate(changedFiles?: string[]): void {
		this.invalidateModules(changedFiles);
	}

	/**
	 * Releases transpiler-owned resources.
	 *
	 * @remarks
	 * The current implementation delegates cache ownership to lower-level module
	 * loading services, so disposal is intentionally a no-op for now.
	 */
	async dispose(): Promise<void> {
		return;
	}
}
