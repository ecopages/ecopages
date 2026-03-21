import type { BuildExecutor } from '../build/build-adapter.ts';
import { PageModuleImportService, type PageModuleImportOptions } from './page-module-import.service.ts';

export type ServerModuleTranspilerOptions = Omit<PageModuleImportOptions, 'rootDir' | 'buildExecutor'>;

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
	buildExecutor: BuildExecutor;
	getInvalidationVersion?: () => number;
	invalidateModules?: (changedFiles?: string[]) => void;
};

/**
 * App-owned boundary for server-side source module loading.
 *
 * @remarks
 * This service centralizes server-side module transpilation and import behind
 * an explicit caller-owned root and build executor.
 */
export class ServerModuleTranspiler {
	private readonly pageModuleImportService = new PageModuleImportService();
	private readonly getRootDir: () => string;
	private readonly getBuildExecutor: () => BuildExecutor | undefined;
	private readonly getInvalidationVersion: () => number | undefined;
	private readonly invalidateModules: (changedFiles?: string[]) => void;

	/**
	 * Creates one explicit server-transpiler boundary for a given execution
	 * context.
	 */
	constructor(args: ServerModuleTranspilerBootstrapArgs) {
		this.getRootDir = () => args.rootDir;
		this.getBuildExecutor = () => args.buildExecutor;
		this.getInvalidationVersion = () => args.getInvalidationVersion?.();
		this.invalidateModules = (changedFiles) => {
			if (args.invalidateModules) {
				args.invalidateModules(changedFiles);
				return;
			}

			PageModuleImportService.invalidateDevelopmentGraph();
		};
	}

	/**
	 * Loads a server-side source module through the caller-owned transpile
	 * context.
	 */
	async importModule<T = unknown>(options: ServerModuleTranspilerOptions): Promise<T> {
		return await this.pageModuleImportService.importModule<T>({
			...options,
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
