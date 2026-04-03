import { pathToFileURL } from 'node:url';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import {
	setAppNodeRuntimeManifest,
	type NodeRuntimeManifest,
} from '../../services/runtime-manifest/node-runtime-manifest.service.ts';
import { DevelopmentInvalidationService } from '../../services/invalidation/development-invalidation.service.ts';
import { getAppEntrypointDependencyGraph } from '../../services/runtime-state/entrypoint-dependency-graph.service.ts';
import { installAppRuntimeBuildExecutor } from '../../build/runtime-build-executor.ts';

/**
 * Host-to-adapter handoff contract for the Node thin-host runtime.
 *
 * @remarks
 * The thin host is responsible only for validating the persisted manifest,
 * capturing process-level launch context, and passing those values into the
 * adapter. All framework bootstrap work begins after this handoff.
 */
export interface NodeRuntimeStartOptions {
	manifest: NodeRuntimeManifest;
	workingDirectory: string;
	cliArgs: string[];
}

/**
 * Runtime session state produced after the adapter has loaded the app through
 * the framework-owned loader path.
 */
export interface LoadedAppRuntime {
	manifest: NodeRuntimeManifest;
	workingDirectory: string;
	entryModulePath: string;
	appConfig: EcoPagesAppConfig;
	entryModule: unknown;
}

/**
 * Live Node thin-host runtime session.
 */
export interface NodeRuntimeSession {
	loadApp(): Promise<LoadedAppRuntime>;
	invalidate(changedFiles: string[]): Promise<void>;
	dispose(): Promise<void>;
}

/**
 * Adapter boundary created by the thin host after manifest validation.
 */
export interface NodeRuntimeAdapter {
	start(options: NodeRuntimeStartOptions): Promise<NodeRuntimeSession>;
}

/**
 * Validates and narrows the persisted Node runtime manifest used by the thin
 * host handoff.
 */
export function assertNodeRuntimeManifest(manifest: unknown): NodeRuntimeManifest {
	if (!manifest || typeof manifest !== 'object') {
		throw new Error('Invalid Node runtime manifest: expected an object.');
	}

	const candidate = manifest as Record<string, unknown>;
	const modulePaths = candidate.modulePaths as Record<string, unknown> | undefined;

	if (candidate.runtime !== 'node') {
		throw new Error('Invalid Node runtime manifest: runtime must be "node".');
	}

	if (
		typeof candidate.appRootDir !== 'string' ||
		typeof candidate.sourceRootDir !== 'string' ||
		typeof candidate.distDir !== 'string'
	) {
		throw new Error('Invalid Node runtime manifest: root, source, and dist paths must be strings.');
	}

	if (!modulePaths || typeof modulePaths.config !== 'string') {
		throw new Error('Invalid Node runtime manifest: modulePaths.config must be present.');
	}

	return candidate as unknown as NodeRuntimeManifest;
}

class NodeRuntimeAdapterSession implements NodeRuntimeSession {
	private readonly options: NodeRuntimeStartOptions;
	private invalidationService: DevelopmentInvalidationService | null = null;
	private appConfig: EcoPagesAppConfig | null = null;
	private loadedAppRuntime: LoadedAppRuntime | null = null;
	private importGeneration = 0;

	constructor(options: NodeRuntimeStartOptions) {
		this.options = options;
	}

	private isDevelopmentMode(): boolean {
		return this.options.cliArgs.includes('--dev') || process.env.NODE_ENV === 'development';
	}

	private get manifest(): NodeRuntimeManifest {
		return this.options.manifest;
	}

	private getEntryModulePath(): string {
		const entryModulePath = this.manifest.modulePaths.entry;

		if (!entryModulePath) {
			throw new Error(
				'Invalid Node runtime manifest: modulePaths.entry must be present before the Node thin-host adapter can load the app.',
			);
		}

		return entryModulePath;
	}

	/**
	 * Imports a module by file path, using a generation-based query parameter
	 * for cache busting after invalidation.
	 */
	private async importModule(modulePath: string): Promise<unknown> {
		const moduleUrl = pathToFileURL(modulePath);
		if (this.importGeneration > 0) {
			moduleUrl.searchParams.set('v', String(this.importGeneration));
		}
		return await import(moduleUrl.href);
	}

	private initializeAppRuntime(appConfig: EcoPagesAppConfig): EcoPagesAppConfig {
		setAppNodeRuntimeManifest(appConfig, this.manifest);
		this.invalidationService = new DevelopmentInvalidationService(appConfig);
		installAppRuntimeBuildExecutor(appConfig, {
			development: this.isDevelopmentMode(),
		});
		this.appConfig = appConfig;
		return appConfig;
	}

	private async loadAppConfig(): Promise<EcoPagesAppConfig> {
		if (this.appConfig) {
			return this.appConfig;
		}

		let importedConfigModule;

		try {
			importedConfigModule = (await this.importModule(this.manifest.modulePaths.config)) as
				| { default: EcoPagesAppConfig }
				| EcoPagesAppConfig;
		} catch (error) {
			throw new Error(
				`Node thin-host runtime config bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		const exportedConfig = 'default' in importedConfigModule ? importedConfigModule.default : importedConfigModule;
		return this.initializeAppRuntime(exportedConfig);
	}

	async loadApp(): Promise<LoadedAppRuntime> {
		if (this.loadedAppRuntime) {
			return this.loadedAppRuntime;
		}

		const appConfig = await this.loadAppConfig();
		const entryModulePath = this.getEntryModulePath();
		let loadedEntryModule;

		try {
			loadedEntryModule = await this.importModule(entryModulePath);
		} catch (error) {
			throw new Error(
				`Node thin-host runtime app-entry bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		this.loadedAppRuntime = {
			manifest: this.manifest,
			workingDirectory: this.options.workingDirectory,
			appConfig,
			entryModulePath,
			entryModule: loadedEntryModule,
		};

		return this.loadedAppRuntime;
	}

	async invalidate(_changedFiles: string[]): Promise<void> {
		if (this.invalidationService) {
			this.invalidationService.resetRuntimeState(_changedFiles);
		}
		this.loadedAppRuntime = null;
		this.appConfig = null;
		this.importGeneration++;
	}

	async dispose(): Promise<void> {
		if (this.appConfig) {
			getAppEntrypointDependencyGraph(this.appConfig).reset();
		}
		this.invalidationService = null;
	}
}

class DefaultNodeRuntimeAdapter implements NodeRuntimeAdapter {
	async start(options: NodeRuntimeStartOptions): Promise<NodeRuntimeSession> {
		return new NodeRuntimeAdapterSession(options);
	}
}

export function createNodeRuntimeAdapter(): NodeRuntimeAdapter {
	return new DefaultNodeRuntimeAdapter();
}
