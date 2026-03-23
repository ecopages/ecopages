import fs from 'node:fs';
import path from 'node:path';
import { RESOLVED_ASSETS_DIR } from '../../constants.ts';
import { getAppBuildExecutor } from '../../build/build-adapter.ts';
import type { DefaultHmrContext, EcoPagesAppConfig, IHmrManager, IClientBridge } from '../../internal-types.ts';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import { fileSystem } from '@ecopages/file-system';
import { HmrStrategyType, type HmrStrategy } from '../../hmr/hmr-strategy.ts';
import { DefaultHmrStrategy } from '../../hmr/strategies/default-hmr-strategy.ts';
import { JsHmrStrategy } from '../../hmr/strategies/js-hmr-strategy.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { ClientBridgeEvent } from '../../public-types.ts';
import { HmrEntrypointRegistrar } from '../shared/hmr-entrypoint-registrar.ts';
import { BrowserBundleService } from '../../services/assets/browser-bundle.service.ts';
import { getAppServerModuleTranspiler } from '../../services/module-loading/app-server-module-transpiler.service.ts';
import {
	getAppEntrypointDependencyGraph,
	InMemoryEntrypointDependencyGraph,
	setAppEntrypointDependencyGraph,
	type EntrypointDependencyGraph,
} from '../../services/runtime-state/entrypoint-dependency-graph.service.ts';
import { getAppRuntimeSpecifierRegistry } from '../../services/runtime-state/runtime-specifier-registry.service.ts';
import type { ServerModuleTranspiler } from '../../services/module-loading/server-module-transpiler.service.ts';
import { resolveInternalExecutionDir, resolveInternalWorkDir } from '../../utils/resolve-work-dir.ts';

export interface NodeHmrManagerParams {
	appConfig: EcoPagesAppConfig;
	bridge: IClientBridge;
}

type HandleFileChangeOptions = {
	broadcast?: boolean;
};

/**
 * Node development HMR manager.
 *
 * @remarks
 * This manager owns three separate concerns:
 * - runtime websocket event fanout
 * - entrypoint registration and dedupe
 * - strategy coordination for rebuilds and invalidation
 *
 * The strict page-entrypoint contract lives here: `registerEntrypoint()` is
 * reserved for integration-owned page bundles, while generic script assets must
 * go through `registerScriptEntrypoint()`.
 */
export class NodeHmrManager implements IHmrManager {
	private static readonly entrypointRegistrationTimeoutMs = 4000;
	public readonly appConfig: EcoPagesAppConfig;
	private readonly bridge: IClientBridge;
	private watchers = new Map<string, fs.FSWatcher>();
	private watchedFiles = new Map<string, string>();
	private entrypointRegistrations = new Map<string, Promise<string>>();
	private distDir: string;
	private plugins: EcoBuildPlugin[] = [];
	private enabled = true;
	private strategies: HmrStrategy[] = [];
	private readonly entrypointRegistrar: HmrEntrypointRegistrar;
	private readonly browserBundleService: BrowserBundleService;
	private readonly entrypointDependencyGraph: EntrypointDependencyGraph;
	private readonly runtimeSpecifierRegistry: ReturnType<typeof getAppRuntimeSpecifierRegistry>;
	private readonly serverModuleTranspiler: ServerModuleTranspiler;

	constructor({ appConfig, bridge }: NodeHmrManagerParams) {
		this.appConfig = appConfig;
		this.bridge = bridge;
		this.distDir = path.join(resolveInternalWorkDir(this.appConfig), RESOLVED_ASSETS_DIR, '_hmr');
		this.entrypointRegistrar = new HmrEntrypointRegistrar({
			srcDir: this.appConfig.absolutePaths.srcDir,
			distDir: this.distDir,
			entrypointRegistrations: this.entrypointRegistrations,
			watchedFiles: this.watchedFiles,
			clearFailedRegistration: (entrypointPath) => this.clearFailedEntrypointRegistration(entrypointPath),
			registrationTimeoutMs: NodeHmrManager.entrypointRegistrationTimeoutMs,
		});
		this.browserBundleService = new BrowserBundleService(appConfig);
		const existingEntrypointDependencyGraph = getAppEntrypointDependencyGraph(appConfig);
		this.entrypointDependencyGraph =
			existingEntrypointDependencyGraph instanceof InMemoryEntrypointDependencyGraph
				? existingEntrypointDependencyGraph
				: new InMemoryEntrypointDependencyGraph();
		setAppEntrypointDependencyGraph(this.appConfig, this.entrypointDependencyGraph);
		this.runtimeSpecifierRegistry = getAppRuntimeSpecifierRegistry(this.appConfig);
		this.serverModuleTranspiler = getAppServerModuleTranspiler(this.appConfig);
		this.cleanDistDir();
		this.initializeStrategies();
	}

	/**
	 * Ensures the HMR output directory exists.
	 *
	 * This must not remove the directory because multiple app processes
	 * can share the same dist path during e2e runs.
	 */
	private cleanDistDir(): void {
		fileSystem.ensureDir(this.distDir);
	}

	/**
	 * Returns whether the generic JS strategy is allowed to rebuild an entrypoint.
	 *
	 * @remarks
	 * Higher-priority integration strategies own framework page entrypoints. When
	 * one of them matches, the generic JS strategy must stay out of the way so a
	 * shared dependency invalidation does not overwrite framework-specific output.
	 */
	private shouldJsStrategyProcessEntrypoint(entrypointPath: string): boolean {
		return !this.strategies.some((strategy) => {
			if (strategy.type !== HmrStrategyType.INTEGRATION || strategy.priority <= HmrStrategyType.SCRIPT) {
				return false;
			}

			try {
				return strategy.matches(entrypointPath);
			} catch (error) {
				appLogger.error(error);
				return false;
			}
		});
	}

	private initializeStrategies(): void {
		const jsContext = {
			getWatchedFiles: () => this.watchedFiles,
			getSpecifierMap: () => this.runtimeSpecifierRegistry.getAll(),
			getDistDir: () => this.distDir,
			getPlugins: () => this.plugins,
			getSrcDir: () => this.appConfig.absolutePaths.srcDir,
			getPagesDir: () => this.appConfig.absolutePaths.pagesDir,
			getLayoutsDir: () => this.appConfig.absolutePaths.layoutsDir,
			getTemplateExtensions: () => this.appConfig.templatesExt,
			getBrowserBundleService: () => this.browserBundleService,
			getEntrypointDependencyGraph: () => this.entrypointDependencyGraph,
			shouldProcessEntrypoint: (entrypointPath: string) => this.shouldJsStrategyProcessEntrypoint(entrypointPath),
		};

		this.strategies = [new JsHmrStrategy(jsContext), new DefaultHmrStrategy()];
	}

	public registerStrategy(strategy: HmrStrategy): void {
		this.strategies.push(strategy);
	}

	public setPlugins(plugins: EcoBuildPlugin[]): void {
		this.plugins = [...plugins];
	}

	public setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	public isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Registers runtime bare-specifier mappings exposed by integrations.
	 *
	 * @remarks
	 * These mappings are consumed by framework-owned HMR strategies such as the
	 * React integration strategy when they rewrite browser bundles. The registry
	 * stays generic so the same mappings can support broader import-map-style
	 * runtime features later without moving integration semantics into core.
	 */
	public registerSpecifierMap(map: Record<string, string>): void {
		this.runtimeSpecifierRegistry.register(map);
	}

	public async buildRuntime(): Promise<void> {
		const runtimeSource = path.resolve(import.meta.dirname, '../../hmr/client/hmr-runtime.ts');

		try {
			const result = await this.browserBundleService.bundle({
				profile: 'hmr-runtime',
				entrypoints: [runtimeSource],
				outdir: this.distDir,
				naming: '_hmr_runtime.js',
				minify: false,
				plugins: this.plugins,
			});

			if (!result.success) {
				this.enabled = false;
				appLogger.error('[HMR] Failed to build runtime script; continuing with HMR disabled.', result.logs);
			}
		} catch (error) {
			this.enabled = false;
			appLogger.error('[HMR] Failed to build runtime script; continuing with HMR disabled.', error);
		}
	}

	public getRuntimePath(): string {
		return path.join(this.distDir, '_hmr_runtime.js');
	}

	public broadcast(event: ClientBridgeEvent) {
		appLogger.debug(
			`[HMR] Broadcasting ${event.type} event, path=${event.path || 'all'}, subscribers=${this.bridge.subscriberCount}`,
		);
		this.bridge.broadcast(event);
	}

	public async handleFileChange(filePath: string, options: HandleFileChangeOptions = {}): Promise<void> {
		const sorted = [...this.strategies].sort((a, b) => b.priority - a.priority);
		const strategy = sorted.find((s) => {
			try {
				return s.matches(filePath);
			} catch (err) {
				appLogger.error(err);
				return false;
			}
		});

		if (!strategy) {
			appLogger.warn(`[HMR] No strategy found for ${filePath}`);
			return;
		}

		appLogger.debug(`[NodeHmrManager] Selected strategy: ${strategy.constructor.name}`);

		const action = await strategy.process(filePath);
		const shouldBroadcast = options.broadcast ?? true;

		if (shouldBroadcast && action.type === 'broadcast') {
			if (action.events) {
				for (const event of action.events) {
					this.broadcast(event);
				}
			}
		}
	}

	public getOutputUrl(entrypointPath: string): string | undefined {
		return this.watchedFiles.get(entrypointPath);
	}

	public getWatchedFiles(): Map<string, string> {
		return this.watchedFiles;
	}

	public getSpecifierMap(): Map<string, string> {
		return this.runtimeSpecifierRegistry.getAll();
	}

	public getDistDir(): string {
		return this.distDir;
	}

	public getPlugins(): EcoBuildPlugin[] {
		return this.plugins;
	}

	public getDefaultContext(): DefaultHmrContext {
		return {
			getWatchedFiles: () => this.watchedFiles,
			getSpecifierMap: () => this.runtimeSpecifierRegistry.getAll(),
			getDistDir: () => this.distDir,
			getPlugins: () => this.plugins,
			getSrcDir: () => this.appConfig.absolutePaths.srcDir,
			getLayoutsDir: () => this.appConfig.absolutePaths.layoutsDir,
			getPagesDir: () => this.appConfig.absolutePaths.pagesDir,
			getBuildExecutor: () => getAppBuildExecutor(this.appConfig),
			getBrowserBundleService: () => this.browserBundleService,
			importServerModule: async <T>(filePath: string) =>
				await this.serverModuleTranspiler.importModule<T>({
					filePath,
					outdir: path.join(resolveInternalExecutionDir(this.appConfig), '.server-modules'),
					externalPackages: true,
				}),
		};
	}

	private clearFailedEntrypointRegistration(entrypointPath: string): void {
		this.watchedFiles.delete(entrypointPath);
		this.entrypointDependencyGraph.clearEntrypointDependencies(entrypointPath);
	}

	/**
	 * Registers one integration-owned page entrypoint.
	 *
	 * @remarks
	 * Concurrent callers share one in-flight registration. The registration is
	 * removed from the dedupe map once it resolves or fails so later requests do
	 * not inherit stale state.
	 */
	public async registerEntrypoint(entrypointPath: string): Promise<string> {
		return await this.entrypointRegistrar.registerEntrypoint(entrypointPath, {
			emit: async (normalizedEntrypoint, outputPath) =>
				await this.emitStrictEntrypoint(normalizedEntrypoint, outputPath),
			getMissingOutputError: (normalizedEntrypoint, outputPath) =>
				new Error(
					`[HMR] Integration failed to emit entrypoint ${normalizedEntrypoint} to ${outputPath}. Page entrypoints must be produced by their owning integration.`,
				),
		});
	}

	/**
	 * Registers one generic script entrypoint.
	 *
	 * @remarks
	 * This path is intentionally separate from page entrypoints so non-framework
	 * scripts can still use the generic build fallback without weakening the page
	 * ownership contract.
	 */
	public async registerScriptEntrypoint(entrypointPath: string): Promise<string> {
		return await this.entrypointRegistrar.registerEntrypoint(entrypointPath, {
			emit: async (normalizedEntrypoint, outputPath) =>
				await this.emitScriptEntrypoint(normalizedEntrypoint, outputPath),
			getMissingOutputError: (normalizedEntrypoint) =>
				new Error(`[HMR] Failed to register script entrypoint: ${normalizedEntrypoint}`),
		});
	}

	/**
	 * Performs strict integration-owned entrypoint registration for one normalized source path.
	 *
	 * @remarks
	 * The flow is:
	 * 1. Reserve the output URL in the watched map.
	 * 2. Remove any stale emitted file from an earlier process or failed build.
	 * 3. Let the strategy chain try to emit the entrypoint without broadcasting.
	 * 4. Fail if the owning integration did not emit the expected output.
	 */
	private async emitStrictEntrypoint(entrypointPath: string, _outputPath: string): Promise<void> {
		await this.handleFileChange(entrypointPath, { broadcast: false });
	}

	/**
	 * Performs registration for a generic script asset.
	 *
	 * @remarks
	 * The manager first gives registered strategies a chance to emit the file so
	 * processor-owned or integration-owned behavior can still participate. Only
	 * when no output exists does it issue the generic build.
	 */
	private async emitScriptEntrypoint(entrypointPath: string, outputPath: string): Promise<void> {
		const naming = path.relative(this.distDir, outputPath).split(path.sep).join('/');

		await this.handleFileChange(entrypointPath, { broadcast: false });

		if (!fileSystem.exists(outputPath)) {
			const buildResult = await this.browserBundleService.bundle({
				profile: 'hmr-entrypoint',
				entrypoints: [entrypointPath],
				outdir: this.distDir,
				naming,
				minify: false,
				plugins: this.plugins,
			});

			if (!buildResult.success) {
				appLogger.error(
					`[HMR] Generic script entrypoint build failed for ${entrypointPath}:`,
					buildResult.logs,
				);
			}
		}
	}

	/**
	 * Stops active watchers and releases retained registration state.
	 *
	 * @remarks
	 * The manager intentionally does not remove emitted `_hmr` files from disk
	 * because multiple app processes may share the same dist directory during test
	 * runs. It does clear in-memory indexes so old entrypoints, dependencies, and
	 * specifier maps cannot leak across a reused manager instance.
	 */
	public stop() {
		this.entrypointRegistrations.clear();
		for (const watcher of this.watchers.values()) {
			watcher.close();
		}
		this.watchers.clear();
		this.watchedFiles.clear();
		this.runtimeSpecifierRegistry.clear();
		this.entrypointDependencyGraph.reset();
		this.plugins = [];
	}
}
