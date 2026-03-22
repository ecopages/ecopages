import path from 'node:path';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import {
	createBuildAdapter,
	getAppBuildExecutor,
	getAppBuildAdapter,
	getAppServerBuildPlugins,
	setAppBuildExecutor,
	type BuildAdapter,
	type BuildExecutor,
} from '../../build/build-adapter.ts';
import { createAppBuildExecutor, createOrReuseAppBuildExecutor } from '../../build/dev-build-coordinator.ts';
import { createNodeBootstrapPlugin, getNodeRuntimeNodeModulesDir } from './bootstrap-dependency-resolver.ts';
import {
	setAppNodeRuntimeManifest,
	type NodeRuntimeManifest,
} from '../../services/runtime-manifest/node-runtime-manifest.service.ts';
import { DevelopmentInvalidationService } from '../../services/invalidation/development-invalidation.service.ts';
import { getAppEntrypointDependencyGraph } from '../../services/runtime-state/entrypoint-dependency-graph.service.ts';
import { createAliasResolverPlugin } from '../../plugins/alias-resolver-plugin.ts';
import {
	TranspilerServerLoader,
	type ServerLoaderAppContext,
} from '../../services/module-loading/server-loader.service.ts';
import { resolveInternalExecutionDir } from '../../utils/resolve-work-dir.ts';

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

const NODE_RUNTIME_CONFIG_OUTDIR = '.node-runtime-config';
const NODE_RUNTIME_ENTRY_OUTDIR = '.node-runtime-entry';
const NODE_RUNTIME_BOOTSTRAP_SPLITTING = false;
const NODE_RUNTIME_CONFIG_NAMESPACE = 'ecopages-runtime-config';
const NODE_RUNTIME_CONFIG_GLOBAL_KEY = '__ecopagesNodeRuntimeConfig';

/**
 * Resolves a relative import path to an absolute path given its importer.
 * Returns undefined for bare specifiers or when resolution is not possible.
 */
function resolveConfigImportPath(importPath: string, importer?: string): string | undefined {
	if (!importPath) {
		return undefined;
	}

	if (path.isAbsolute(importPath)) {
		return importPath;
	}

	if (!importPath.startsWith('.')) {
		return undefined;
	}

	if (!importer) {
		return undefined;
	}

	return path.resolve(path.dirname(importer), importPath);
}

/**
 * Returns true if the given esbuild resolve args refer to the app's eco.config
 * module, by matching against the absolute config path (with or without
 * extension) or the well-known relative form `./eco.config`.
 */
function doesImportReferenceConfig(args: { path: string; importer?: string }, configModulePath: string): boolean {
	if (args.path === configModulePath) {
		return true;
	}

	if (args.path === './eco.config' || args.path === './eco.config.ts') {
		return true;
	}

	const resolvedImportPath = resolveConfigImportPath(args.path, args.importer);
	if (!resolvedImportPath) {
		return false;
	}

	if (resolvedImportPath === configModulePath) {
		return true;
	}

	const configPathWithoutExtension = configModulePath.replace(/\.[cm]?[jt]sx?$/i, '');
	const resolvedPathWithoutExtension = resolvedImportPath.replace(/\.[cm]?[jt]sx?$/i, '');
	return resolvedPathWithoutExtension === configPathWithoutExtension;
}

/**
 * Creates an esbuild plugin that intercepts any import of the app's eco.config
 * module during app-entry transpilation and redirects it to a synthetic module
 * that reads the pre-loaded config from `globalThis`. This prevents eco.config
 * from being re-executed as a side effect of bundling the app-entry module.
 */
function createRuntimeConfigBridgePlugin(configModulePath: string): EcoBuildPlugin {
	return {
		name: 'node-runtime-config-bridge',
		setup(build) {
			build.onResolve({ filter: /.*/ }, (args) => {
				if (!doesImportReferenceConfig(args, configModulePath)) {
					return undefined;
				}

				return {
					path: NODE_RUNTIME_CONFIG_GLOBAL_KEY,
					namespace: NODE_RUNTIME_CONFIG_NAMESPACE,
				};
			});

			build.onLoad({ filter: /.*/, namespace: NODE_RUNTIME_CONFIG_NAMESPACE }, () => {
				return {
					loader: 'js',
					contents: [
						`const key = ${JSON.stringify(NODE_RUNTIME_CONFIG_GLOBAL_KEY)};`,
						'const appConfig = globalThis[key];',
						'if (!appConfig) {',
						"throw new Error('Node runtime config bridge expected a loaded app config before app-entry evaluation.');",
						'}',
						'export default appConfig;',
					].join('\n'),
				};
			});
		},
	};
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
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
	const buildPlugins = candidate.buildPlugins as Record<string, unknown> | undefined;
	const browserBundles = candidate.browserBundles as Record<string, unknown> | undefined;
	const bootstrap = candidate.bootstrap as Record<string, unknown> | undefined;

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

	if (
		!buildPlugins ||
		!isStringArray(buildPlugins.loaderPluginNames) ||
		!isStringArray(buildPlugins.runtimePluginNames) ||
		!isStringArray(buildPlugins.browserBundlePluginNames)
	) {
		throw new Error('Invalid Node runtime manifest: build plugin name lists must be arrays of strings.');
	}

	if (
		!browserBundles ||
		typeof browserBundles.outputDir !== 'string' ||
		typeof browserBundles.publicBaseUrl !== 'string' ||
		typeof browserBundles.vendorBaseUrl !== 'string'
	) {
		throw new Error('Invalid Node runtime manifest: browser bundle metadata is incomplete.');
	}

	if (
		!bootstrap ||
		(bootstrap.devGraphStrategy !== 'noop' && bootstrap.devGraphStrategy !== 'selective') ||
		(bootstrap.runtimeSpecifierRegistry !== 'in-memory' && bootstrap.runtimeSpecifierRegistry !== 'custom')
	) {
		throw new Error('Invalid Node runtime manifest: bootstrap metadata is incomplete.');
	}

	return candidate as unknown as NodeRuntimeManifest;
}

/**
 * Resolves the runtime-specific output directory used for bootstrap module
 * transpilation.
 */
function getRuntimeOutdir(
	manifest: NodeRuntimeManifest,
	kind: typeof NODE_RUNTIME_CONFIG_OUTDIR | typeof NODE_RUNTIME_ENTRY_OUTDIR,
): string {
	return path.join(
		resolveInternalExecutionDir({
			rootDir: manifest.appRootDir,
			workDir: manifest.workDir,
			absolutePaths: {
				workDir: manifest.workDir,
				distDir: manifest.distDir,
			},
		}),
		kind,
	);
}

class NodeRuntimeAdapterSession implements NodeRuntimeSession {
	private readonly options: NodeRuntimeStartOptions;
	private readonly serverLoader: TranspilerServerLoader;
	private readonly bootstrapBundlePlugin: EcoBuildPlugin;
	private readonly bootstrapBuildAdapter: BuildAdapter;
	private readonly bootstrapBuildExecutor: BuildExecutor;
	private appConfig: EcoPagesAppConfig | null = null;
	private loadedAppRuntime: LoadedAppRuntime | null = null;

	constructor(options: NodeRuntimeStartOptions) {
		this.options = options;
		this.bootstrapBundlePlugin = createNodeBootstrapPlugin({
			projectDir: options.manifest.appRootDir,
			runtimeNodeModulesDir: getNodeRuntimeNodeModulesDir(options.manifest),
			preserveImportMetaPaths: [
				options.manifest.modulePaths.config,
				...(options.manifest.modulePaths.entry ? [options.manifest.modulePaths.entry] : []),
			],
		});
		this.bootstrapBuildAdapter = createBuildAdapter();
		this.bootstrapBuildExecutor = createAppBuildExecutor({
			development: false,
			adapter: this.bootstrapBuildAdapter,
		});
		this.serverLoader = new TranspilerServerLoader({
			rootDir: options.manifest.appRootDir,
			getBuildExecutor: () => this.bootstrapBuildExecutor,
		});
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

	private getAppInvalidationService(appConfig: EcoPagesAppConfig): DevelopmentInvalidationService {
		return new DevelopmentInvalidationService(appConfig);
	}

	private createAppLoaderContext(appConfig: EcoPagesAppConfig, buildExecutor: BuildExecutor): ServerLoaderAppContext {
		const invalidationService = this.getAppInvalidationService(appConfig);

		return {
			rootDir: appConfig.rootDir,
			getBuildExecutor: () => buildExecutor,
			getInvalidationVersion: () => invalidationService.getServerModuleInvalidationVersion(),
			invalidateModules: (changedFiles?: string[]) => invalidationService.invalidateServerModules(changedFiles),
		};
	}

	/**
	 * Installs the app-owned executor once per loaded app config and preserves an
	 * existing development coordinator when one is already present.
	 */
	private installAppBuildExecutor(appConfig: EcoPagesAppConfig): BuildExecutor {
		const appBuildExecutor = createOrReuseAppBuildExecutor({
			development: this.isDevelopmentMode(),
			adapter: getAppBuildAdapter(appConfig),
			currentExecutor: getAppBuildExecutor(appConfig),
			getPlugins: () => getAppServerBuildPlugins(appConfig),
		});

		setAppBuildExecutor(appConfig, appBuildExecutor);
		return appBuildExecutor;
	}

	/**
	 * Rebinds app-phase server loading to the installed app-owned executor.
	 */
	private bindAppServerLoader(appConfig: EcoPagesAppConfig, buildExecutor: BuildExecutor): void {
		this.serverLoader.rebindAppContext(this.createAppLoaderContext(appConfig, buildExecutor));
	}

	private initializeAppRuntime(appConfig: EcoPagesAppConfig): EcoPagesAppConfig {
		setAppNodeRuntimeManifest(appConfig, this.manifest);
		const appBuildExecutor = this.installAppBuildExecutor(appConfig);
		this.bindAppServerLoader(appConfig, appBuildExecutor);
		this.appConfig = appConfig;
		return appConfig;
	}

	/**
	 * Loads and validates the built app config through the framework-owned server
	 * loader.
	 */
	private async loadAppConfig(): Promise<EcoPagesAppConfig> {
		if (this.appConfig) {
			return this.appConfig;
		}

		let importedConfigModule;

		try {
			importedConfigModule = await this.serverLoader.loadConfig<
				| {
						default: EcoPagesAppConfig;
				  }
				| EcoPagesAppConfig
			>({
				filePath: this.manifest.modulePaths.config,
				outdir: getRuntimeOutdir(this.manifest, NODE_RUNTIME_CONFIG_OUTDIR),
				splitting: NODE_RUNTIME_BOOTSTRAP_SPLITTING,
				externalPackages: false,
				plugins: [createAliasResolverPlugin(this.manifest.sourceRootDir), this.bootstrapBundlePlugin],
				transpileErrorMessage: (details) => `Failed to transpile Ecopages config module: ${details}`,
				noOutputMessage: (filePath) => `No transpiled output generated for Ecopages config module: ${filePath}`,
			});
		} catch (error) {
			throw new Error(
				`Node thin-host runtime config bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		const exportedConfig = 'default' in importedConfigModule ? importedConfigModule.default : importedConfigModule;
		return this.initializeAppRuntime(exportedConfig);
	}

	/**
	 * Loads the application entry through the framework-owned server loader after
	 * config bootstrap has established app-owned runtime/build services.
	 */
	async loadApp(): Promise<LoadedAppRuntime> {
		if (this.loadedAppRuntime) {
			return this.loadedAppRuntime;
		}

		const appConfig = await this.loadAppConfig();
		const entryModulePath = this.getEntryModulePath();
		let loadedEntryModule;
		const runtimeGlobal = globalThis as typeof globalThis & {
			[NODE_RUNTIME_CONFIG_GLOBAL_KEY]?: EcoPagesAppConfig;
		};

		runtimeGlobal[NODE_RUNTIME_CONFIG_GLOBAL_KEY] = appConfig;

		try {
			loadedEntryModule = await this.serverLoader.loadApp({
				filePath: entryModulePath,
				outdir: getRuntimeOutdir(this.manifest, NODE_RUNTIME_ENTRY_OUTDIR),
				splitting: NODE_RUNTIME_BOOTSTRAP_SPLITTING,
				externalPackages: false,
				plugins: [
					createRuntimeConfigBridgePlugin(this.manifest.modulePaths.config),
					createAliasResolverPlugin(appConfig.absolutePaths.srcDir),
					this.bootstrapBundlePlugin,
				],
				transpileErrorMessage: (details) => `Failed to transpile Ecopages app entry module: ${details}`,
				noOutputMessage: (filePath) =>
					`No transpiled output generated for Ecopages app entry module: ${filePath}`,
			});
		} catch (error) {
			throw new Error(
				`Node thin-host runtime app-entry bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			delete runtimeGlobal[NODE_RUNTIME_CONFIG_GLOBAL_KEY];
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

	/**
	 * Invalidates server-loader and app dev-graph state before the next bootstrap
	 * cycle.
	 */
	async invalidate(_changedFiles: string[]): Promise<void> {
		this.serverLoader.invalidate(_changedFiles);
		if (this.appConfig) {
			this.getAppInvalidationService(this.appConfig).resetRuntimeState(_changedFiles);
		}
		this.loadedAppRuntime = null;
		if (this.appConfig) {
			this.bindAppServerLoader(this.appConfig, getAppBuildExecutor(this.appConfig));
			return;
		}
	}

	/**
	 * Disposes loader-owned resources for the current runtime session.
	 */
	async dispose(): Promise<void> {
		await this.serverLoader.dispose();
		if (this.appConfig) {
			getAppEntrypointDependencyGraph(this.appConfig).reset();
		}
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
