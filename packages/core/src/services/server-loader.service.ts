import type { EcoBuildPlugin } from '../build/build-types.ts';
import {
	ServerModuleTranspiler,
	type ServerModuleTranspilerBootstrapArgs,
	type ServerModuleTranspilerOptions,
} from './server-module-transpiler.service.ts';

/**
 * High-level module-loading options owned by the framework loader boundary.
 *
 * @remarks
 * These are the same shape the lower-level transpiler needs, minus the
 * root/build-executor ownership that the loader keeps internally.
 */
export interface ServerLoaderModuleOptions extends ServerModuleTranspilerOptions {
	plugins?: EcoBuildPlugin[];
}

/**
 * Mutable app-phase server-loading context.
 *
 * @remarks
 * The loader starts with bootstrap config-loading context. Once a real built
 * app config is available, the runtime adapter rebinds the loader so app-entry
 * and downstream server modules load through the app-owned executor.
 */
export interface ServerLoaderAppContext extends ServerModuleTranspilerBootstrapArgs {}

/**
 * Framework-owned server loading boundary.
 *
 * @remarks
 * This abstraction owns config loading, app-entry loading, and cache lifecycle
 * for the Node thin-host runtime path. Hosts and runtime adapters should depend
 * on this boundary rather than coordinating raw transpiler instances directly.
 */
export interface ServerLoader {
	/**
	 * Loads the bootstrap config module through the bootstrap server-loading
	 * context.
	 */
	loadConfig<T = unknown>(options: ServerLoaderModuleOptions): Promise<T>;

	/**
	 * Loads the app entry module through the currently active app context.
	 *
	 * @remarks
	 * Until app context is rebound, this falls back to the bootstrap context so a
	 * caller can still load through one boundary during early bootstrap.
	 */
	loadApp<T = unknown>(options: ServerLoaderModuleOptions): Promise<T>;

	/**
	 * Rebinds the app-phase loading context after a real app config has been
	 * loaded and app-owned build services are available.
	 */
	rebindAppContext(context: ServerLoaderAppContext): void;

	/**
	 * Invalidates cached server module state for development reloads.
	 */
	invalidate(changedFiles?: string[]): void;

	/**
	 * Releases loader-owned resources.
	 */
	dispose(): Promise<void>;
}

/**
 * `ServerLoader` implementation backed by `ServerModuleTranspiler` instances.
 *
 * @remarks
 * This is the first named loader abstraction for Workstream 3. It keeps the
 * lower-level transpiler as the implementation detail while moving ownership of
 * config/app entry orchestration into one service boundary.
 */
export class TranspilerServerLoader implements ServerLoader {
	private readonly configTranspiler: ServerModuleTranspiler;
	private appTranspiler: ServerModuleTranspiler | null = null;

	constructor(configContext: ServerModuleTranspilerBootstrapArgs) {
		this.configTranspiler = new ServerModuleTranspiler(configContext);
	}

	async loadConfig<T = unknown>(options: ServerLoaderModuleOptions): Promise<T> {
		return await this.configTranspiler.importModule<T>(options);
	}

	async loadApp<T = unknown>(options: ServerLoaderModuleOptions): Promise<T> {
		return await (this.appTranspiler ?? this.configTranspiler).importModule<T>(options);
	}

	rebindAppContext(context: ServerLoaderAppContext): void {
		this.appTranspiler = new ServerModuleTranspiler(context);
	}

	invalidate(changedFiles?: string[]): void {
		this.configTranspiler.invalidate(changedFiles);
		this.appTranspiler?.invalidate(changedFiles);
	}

	async dispose(): Promise<void> {
		await this.appTranspiler?.dispose();
		await this.configTranspiler.dispose();
	}
}