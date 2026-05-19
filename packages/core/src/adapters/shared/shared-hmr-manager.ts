import fs from 'node:fs';
import path from 'node:path';
import { RESOLVED_ASSETS_DIR } from '../../config/constants.ts';
import { getAppBuildExecutor } from '../../build/build-adapter.ts';
import type { DefaultHmrContext, EcoPagesAppConfig, IHmrManager, IClientBridge } from '../../types/internal-types.ts';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import { fileSystem } from '@ecopages/file-system';
import { HmrStrategyType, type HmrStrategy } from '../../hmr/hmr-strategy.ts';
import { DefaultHmrStrategy } from '../../hmr/strategies/default-hmr-strategy.ts';
import { JsHmrStrategy } from '../../hmr/strategies/js-hmr-strategy.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { ClientBridgeEvent } from '../../types/public-types.ts';
import { HmrEntrypointRegistrar } from './hmr-entrypoint-registrar.ts';
import { BrowserBundleService } from '../../services/assets/browser-bundle.service.ts';
import { getAppServerModuleTranspiler } from '../../services/module-loading/app-server-module-transpiler.service.ts';
import {
	getAppEntrypointDependencyGraph,
	setAppEntrypointDependencyGraph,
	type EntrypointDependencyGraph,
} from '../../services/runtime-state/entrypoint-dependency-graph.service.ts';
import type { ServerModuleTranspiler } from '../../services/module-loading/server-module-transpiler.service.ts';
import { resolveInternalExecutionDir, resolveInternalWorkDir } from '../../utils/resolve-work-dir.ts';

type HandleFileChangeOptions = {
	broadcast?: boolean;
};

type SharedHmrManagerParams = {
	appConfig: EcoPagesAppConfig;
	bridge: IClientBridge;
	registrationTimeoutMs?: number;
};

export abstract class SharedHmrManager implements IHmrManager {
	public readonly appConfig: EcoPagesAppConfig;
	protected readonly bridge: IClientBridge;
	protected watchers = new Map<string, fs.FSWatcher>();
	protected watchedFiles = new Map<string, string>();
	protected entrypointRegistrations = new Map<string, Promise<string>>();
	protected distDir: string;
	protected plugins: EcoBuildPlugin[] = [];
	protected enabled = true;
	protected strategies: HmrStrategy[] = [];
	protected readonly entrypointRegistrar: HmrEntrypointRegistrar;
	protected readonly browserBundleService: BrowserBundleService;
	protected readonly entrypointDependencyGraph: EntrypointDependencyGraph;
	protected readonly serverModuleTranspiler: ServerModuleTranspiler;

	constructor({ appConfig, bridge, registrationTimeoutMs = 4000 }: SharedHmrManagerParams) {
		this.appConfig = appConfig;
		this.bridge = bridge;
		this.distDir = path.join(resolveInternalWorkDir(this.appConfig), RESOLVED_ASSETS_DIR, '_hmr');
		this.entrypointRegistrar = new HmrEntrypointRegistrar({
			srcDir: this.appConfig.absolutePaths.srcDir,
			distDir: this.distDir,
			entrypointRegistrations: this.entrypointRegistrations,
			watchedFiles: this.watchedFiles,
			clearFailedRegistration: (entrypointPath) => this.clearFailedEntrypointRegistration(entrypointPath),
			registrationTimeoutMs,
		});
		this.browserBundleService = new BrowserBundleService(appConfig);
		this.entrypointDependencyGraph = this.createEntrypointDependencyGraph(
			getAppEntrypointDependencyGraph(appConfig),
		);
		setAppEntrypointDependencyGraph(this.appConfig, this.entrypointDependencyGraph);
		this.serverModuleTranspiler = getAppServerModuleTranspiler(this.appConfig);
		this.ensureDistDir();
		this.initializeStrategies();
	}

	protected abstract createEntrypointDependencyGraph(
		existingEntrypointDependencyGraph: EntrypointDependencyGraph,
	): EntrypointDependencyGraph;

	protected shouldSkipMissingFileChange(_filePath: string): boolean {
		return false;
	}

	protected onRuntimeBundleFailure(error: unknown): void {
		appLogger.error('[HMR] Failed to build runtime script:', error);
	}

	protected ensureDistDir(): void {
		fileSystem.ensureDir(this.distDir);
	}

	protected shouldJsStrategyProcessEntrypoint(entrypointPath: string): boolean {
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

	protected initializeStrategies(): void {
		const jsContext = {
			getWatchedFiles: () => this.watchedFiles,
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
				this.onRuntimeBundleFailure(result.logs);
			}
		} catch (error) {
			this.onRuntimeBundleFailure(error);
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
		if (this.shouldSkipMissingFileChange(filePath) && !fileSystem.exists(filePath)) {
			appLogger.debug(`[${this.constructor.name}] Skipping missing file change: ${filePath}`);
			this.clearFailedEntrypointRegistration(filePath);
			return;
		}

		const sorted = [...this.strategies].sort((a, b) => b.priority - a.priority);
		const strategy = sorted.find((candidate) => {
			try {
				return candidate.matches(filePath);
			} catch (error) {
				appLogger.error(error);
				return false;
			}
		});

		if (!strategy) {
			appLogger.warn(`[HMR] No strategy found for ${filePath}`);
			return;
		}

		appLogger.debug(`[${this.constructor.name}] Selected strategy: ${strategy.constructor.name}`);

		const action = await strategy.process(filePath);
		const shouldBroadcast = options.broadcast ?? true;

		if (shouldBroadcast && action.type === 'broadcast' && action.events) {
			for (const event of action.events) {
				this.broadcast(event);
			}
		}
	}

	public getOutputUrl(entrypointPath: string): string | undefined {
		return this.watchedFiles.get(entrypointPath);
	}

	public getWatchedFiles(): Map<string, string> {
		return this.watchedFiles;
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

	protected clearFailedEntrypointRegistration(entrypointPath: string): void {
		this.watchedFiles.delete(entrypointPath);
		this.entrypointDependencyGraph.clearEntrypointDependencies(entrypointPath);
	}

	public async registerEntrypoint(entrypointPath: string): Promise<string> {
		return await this.entrypointRegistrar.registerEntrypoint(entrypointPath, {
			emit: async (normalizedEntrypoint) => await this.emitStrictEntrypoint(normalizedEntrypoint),
			getMissingOutputError: (normalizedEntrypoint, outputPath) =>
				new Error(
					`[HMR] Integration failed to emit entrypoint ${normalizedEntrypoint} to ${outputPath}. Page entrypoints must be produced by their owning integration.`,
				),
		});
	}

	public async registerScriptEntrypoint(entrypointPath: string): Promise<string> {
		return await this.entrypointRegistrar.registerEntrypoint(entrypointPath, {
			emit: async (normalizedEntrypoint, outputPath) =>
				await this.emitScriptEntrypoint(normalizedEntrypoint, outputPath),
			getMissingOutputError: (normalizedEntrypoint) =>
				new Error(`[HMR] Failed to register script entrypoint: ${normalizedEntrypoint}`),
		});
	}

	protected async emitStrictEntrypoint(entrypointPath: string): Promise<void> {
		await this.handleFileChange(entrypointPath, { broadcast: false });
	}

	protected async emitScriptEntrypoint(entrypointPath: string, outputPath: string): Promise<void> {
		const naming = path.relative(this.distDir, outputPath).split(path.sep).join('/');
		const buildResult = await this.browserBundleService.bundle({
			profile: 'hmr-entrypoint',
			entrypoints: [entrypointPath],
			outdir: this.distDir,
			naming,
			minify: false,
			plugins: this.plugins,
		});

		if (!buildResult.success) {
			appLogger.error(`[HMR] Generic script entrypoint build failed for ${entrypointPath}:`, buildResult.logs);
			return;
		}

		const entrypointDependencies = buildResult.dependencyGraph?.entrypoints?.[entrypointPath];
		if (entrypointDependencies) {
			this.entrypointDependencyGraph.setEntrypointDependencies(entrypointPath, entrypointDependencies);
		}
	}

	public stop() {
		this.entrypointRegistrations.clear();
		for (const watcher of this.watchers.values()) {
			watcher.close();
		}
		this.watchers.clear();
		this.watchedFiles.clear();
		this.entrypointDependencyGraph.reset();
		this.plugins = [];
	}
}
