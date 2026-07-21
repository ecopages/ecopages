import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HMR_RUNTIME_SCRIPT_URL, resolveHmrRuntimeWorkDir } from '../../../hmr/hmr-runtime-paths.ts';
import { isDevTransformModuleUrl } from '../../../hmr/hmr-asset-paths.ts';
import {
	removeStaleHmrEntrypointOutput,
	isRegisteredDevTransformEntrypoint,
	isRegisteredScriptEntrypoint,
	type ResolvedHmrEntrypoint,
} from '../../../hmr/hmr-entrypoint-output.ts';
import type {
	DefaultHmrContext,
	EcoPagesAppConfig,
	IHmrManager,
	IClientBridge,
} from '../../../types/internal-types.ts';
import { fileSystem } from '@ecopages/file-system';
import { HmrStrategyType, type HmrAction, type HmrStrategy } from '../../../hmr/hmr-strategy.ts';
import { DefaultHmrStrategy } from '../../../hmr/strategies/default-hmr-strategy.ts';
import { JsHmrStrategy } from '../../../hmr/strategies/js-hmr-strategy.ts';
import { ServerRenderedTemplateHmrStrategy } from '../../../hmr/strategies/server-rendered-template-hmr-strategy.ts';
import { DevelopmentInvalidationService } from '../../../services/invalidation/development-invalidation.service.ts';
import { appLogger } from '../../../global/app-logger.ts';
import type { ClientBridgeEvent, HmrFileChangeOptions } from '../../../types/public-types.ts';
import { DevTransformEntrypointRegistry } from './dev-transform-entrypoint-registry.ts';
import { BrowserBundleService } from '../../../services/assets/browser-bundle.service.ts';
import { getAppServerModuleTranspiler } from '../../../services/module-loading/app-server-module-transpiler.service.ts';
import {
	getAppEntrypointDependencyGraph,
	setAppEntrypointDependencyGraph,
	type EntrypointDependencyGraph,
} from '../../../services/runtime-state/entrypoint-dependency-graph.service.ts';
import type { ServerModuleTranspiler } from '../../../services/module-loading/server-module-transpiler.service.ts';
import { resolveInternalExecutionDir, resolveInternalWorkDir } from '../../../utils/resolve-work-dir.ts';
import { DevTransformServer } from '../../../dev/transform-server/dev-transform-server.ts';
import type { DevTransformBundleContributor } from '../../../dev/transform-server/types.ts';

type HandleFileChangeOptions = HmrFileChangeOptions;

type SharedHmrManagerParams = {
	appConfig: EcoPagesAppConfig;
	bridge: IClientBridge;
};

export abstract class SharedHmrManager implements IHmrManager {
	public readonly appConfig: EcoPagesAppConfig;
	protected readonly bridge: IClientBridge;
	protected watchers = new Map<string, fs.FSWatcher>();
	protected runtimeWorkDir: string;
	protected enabled = false;
	protected strategies: HmrStrategy[] = [];
	private readonly registeredScriptReloadRequired = new Set<string>();
	protected readonly entrypointRegistry: DevTransformEntrypointRegistry;
	protected readonly browserBundleService: BrowserBundleService;
	protected readonly invalidationService: DevelopmentInvalidationService;
	protected readonly entrypointDependencyGraph: EntrypointDependencyGraph;
	protected readonly serverModuleTranspiler: ServerModuleTranspiler;
	private runtimeBuildPromise: Promise<boolean> | null = null;
	private runtimeReady = false;
	protected readonly devTransformServer: DevTransformServer;

	constructor({ appConfig, bridge }: SharedHmrManagerParams) {
		this.appConfig = appConfig;
		this.bridge = bridge;
		this.runtimeWorkDir = resolveHmrRuntimeWorkDir(resolveInternalWorkDir(this.appConfig));
		this.entrypointRegistry = new DevTransformEntrypointRegistry();
		this.browserBundleService = new BrowserBundleService(appConfig);
		this.invalidationService = new DevelopmentInvalidationService(appConfig);
		this.entrypointDependencyGraph = this.createEntrypointDependencyGraph(
			getAppEntrypointDependencyGraph(appConfig),
		);
		setAppEntrypointDependencyGraph(this.appConfig, this.entrypointDependencyGraph);
		this.serverModuleTranspiler = getAppServerModuleTranspiler(this.appConfig);
		this.devTransformServer = new DevTransformServer({
			appConfig: this.appConfig,
			onModuleDependencies: (modulePath, dependencies) => {
				this.entrypointDependencyGraph.setEntrypointDependencies(modulePath, dependencies);
			},
		});
		this.ensureRuntimeWorkDir();
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

	protected ensureRuntimeWorkDir(): void {
		fileSystem.ensureDir(this.runtimeWorkDir);
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

	registerDevTransformContributor(contributor: DevTransformBundleContributor): void {
		this.devTransformServer.addContributor(contributor);
	}

	protected initializeStrategies(): void {
		const jsContext = {
			getWatchedFiles: () => this.entrypointRegistry.getWatchedOutputUrls(),
			getRegisteredEntrypoints: () => this.entrypointRegistry.getRegisteredEntrypoints(),
			getSrcDir: () => this.appConfig.absolutePaths.srcDir,
			getPagesDir: () => this.appConfig.absolutePaths.pagesDir,
			getLayoutsDir: () => this.appConfig.absolutePaths.layoutsDir,
			getTemplateExtensions: () => this.appConfig.templatesExt,
			getEntrypointDependencyGraph: () => this.entrypointDependencyGraph,
			shouldProcessEntrypoint: (entrypointPath: string) => this.shouldJsStrategyProcessEntrypoint(entrypointPath),
			invalidateDevTransformSource: (sourcePath: string) => this.devTransformServer.invalidateSource(sourcePath),
			consumeRegisteredScriptReloadRequired: (sourcePath: string) =>
				this.consumeRegisteredScriptReloadRequired(sourcePath),
		};

		this.strategies = [
			new JsHmrStrategy(jsContext),
			new ServerRenderedTemplateHmrStrategy(this.invalidationService),
			new DefaultHmrStrategy(),
		];
	}

	public registerStrategy(strategy: HmrStrategy): void {
		this.strategies.push(strategy);
	}

	public setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	public isEnabled(): boolean {
		return this.enabled;
	}

	public isRuntimeReady(): boolean {
		return this.runtimeReady && fileSystem.exists(this.getRuntimePath());
	}

	/**
	 * Builds the browser HMR runtime once per manager session and reuses the in-flight build for concurrent callers.
	 */
	public async ensureRuntimeReady(): Promise<boolean> {
		if (this.runtimeReady) {
			return true;
		}

		if (this.runtimeBuildPromise) {
			return this.runtimeBuildPromise;
		}

		this.runtimeBuildPromise = this.buildRuntimeInternal();
		try {
			const ready = await this.runtimeBuildPromise;
			this.runtimeReady = ready;
			return ready;
		} finally {
			this.runtimeBuildPromise = null;
		}
	}

	public async buildRuntime(): Promise<void> {
		await this.ensureRuntimeReady();
	}

	public getRuntimePath(): string {
		return path.join(this.runtimeWorkDir, path.basename(HMR_RUNTIME_SCRIPT_URL));
	}

	private async buildRuntimeInternal(): Promise<boolean> {
		const runtimeSource = fileURLToPath(import.meta.resolve('@ecopages/core/hmr/client/hmr-runtime'));
		const runtimePath = this.getRuntimePath();

		removeStaleHmrEntrypointOutput(runtimePath, 'HMR');

		try {
			const result = await this.browserBundleService.bundle({
				profile: 'hmr-runtime',
				entrypoints: [runtimeSource],
				outdir: this.runtimeWorkDir,
				naming: path.basename(HMR_RUNTIME_SCRIPT_URL),
				minify: false,
			});

			if (!result.success) {
				this.onRuntimeBundleFailure(result.logs);
				return false;
			}

			const emittedRuntime = result.outputs.find(
				(output) => path.resolve(output.path) === path.resolve(runtimePath),
			);

			if (!emittedRuntime || !fileSystem.exists(runtimePath)) {
				this.onRuntimeBundleFailure(
					new Error(`[HMR] Runtime bundle missing expected output at ${runtimePath}`),
				);
				return false;
			}

			return true;
		} catch (error) {
			this.onRuntimeBundleFailure(error);
			return false;
		}
	}

	public broadcast(event: ClientBridgeEvent) {
		appLogger.debug(
			`[HMR] Broadcasting ${event.type} event, path=${event.path || 'all'}, subscribers=${this.bridge.subscriberCount}`,
		);
		this.bridge.broadcast(event);
	}

	public async handleFileChange(filePath: string, options: HandleFileChangeOptions = {}): Promise<void> {
		const resolvedFilePath = path.resolve(filePath);
		const isRegisteredDevTransformEdit = isRegisteredDevTransformEntrypoint(
			this.entrypointRegistry.getRegisteredEntrypoints(),
			resolvedFilePath,
		);

		if (!isRegisteredDevTransformEdit) {
			this.invalidateDevTransformDependents(resolvedFilePath);
		}

		if (this.shouldSkipMissingFileChange(filePath) && !fileSystem.exists(filePath)) {
			appLogger.debug(`[${this.constructor.name}] Skipping missing file change: ${filePath}`);
			this.clearFailedEntrypointRegistration(filePath);
			return;
		}

		if (isRegisteredDevTransformEdit) {
			await this.prepareRegisteredEntrypointChange(resolvedFilePath);

			const registered = this.entrypointRegistry.getRegisteredEntrypoints().get(resolvedFilePath);
			if (registered && isDevTransformModuleUrl(registered.outputUrl)) {
				this.devTransformServer.invalidateSource(resolvedFilePath);
			}
		}

		const strategy = this.selectChangeStrategy(filePath);
		if (!strategy) {
			appLogger.warn(`[HMR] No strategy found for ${filePath}`);
			this.broadcastStrategyAction(filePath, { type: 'none' }, options, !isRegisteredDevTransformEdit);
			return;
		}

		appLogger.debug(`[${this.constructor.name}] Selected strategy: ${strategy.constructor.name}`);
		this.broadcastStrategyAction(
			filePath,
			await strategy.process(filePath),
			options,
			!isRegisteredDevTransformEdit,
		);
	}

	private broadcastStrategyAction(
		filePath: string,
		action: HmrAction,
		options: HandleFileChangeOptions,
		fallbackReload: boolean,
	): void {
		const shouldBroadcast = options.broadcast ?? true;
		if (!shouldBroadcast) {
			return;
		}

		if (action.type === 'broadcast' && action.events) {
			if (this.bridge.subscriberCount === 0) {
				appLogger.debug(
					`[${this.constructor.name}] Deferring HMR client broadcast for ${filePath} until a subscriber connects`,
				);
				return;
			}

			for (const event of action.events) {
				const graphIdentities = event.graphIdentities ?? options.graphIdentities;
				this.broadcast(graphIdentities === undefined ? event : { ...event, graphIdentities });
			}
			return;
		}

		if (fallbackReload && this.bridge.subscriberCount > 0) {
			this.broadcast({ type: 'reload' });
		}
	}

	private invalidateDevTransformDependents(changedFilePath: string): void {
		const affectedEntrypoints = this.entrypointDependencyGraph.getDependencyEntrypoints(changedFilePath);
		if (affectedEntrypoints.size > 0) {
			for (const entrypointPath of affectedEntrypoints) {
				this.devTransformServer.invalidateSource(entrypointPath);
			}
			this.devTransformServer.invalidateSource(changedFilePath);
			return;
		}

		if (!this.entrypointDependencyGraph.supportsSelectiveInvalidation()) {
			for (const sourcePath of this.entrypointRegistry.getRegisteredEntrypoints().keys()) {
				this.devTransformServer.invalidateSource(sourcePath);
			}
			return;
		}

		this.devTransformServer.invalidateSource(changedFilePath);
	}

	public consumeRegisteredScriptReloadRequired(filePath: string): boolean {
		const resolved = path.resolve(filePath);
		const required = this.registeredScriptReloadRequired.has(resolved);
		this.registeredScriptReloadRequired.delete(resolved);
		return required;
	}

	private getStrategiesByPriority(): HmrStrategy[] {
		return [...this.strategies].sort((left, right) => right.priority - left.priority);
	}

	private selectChangeStrategy(filePath: string): HmrStrategy | undefined {
		return this.getStrategiesByPriority().find((candidate) => {
			try {
				return candidate.matches(filePath);
			} catch (error) {
				appLogger.error(error);
				return false;
			}
		});
	}

	private async prepareRegisteredEntrypointChange(filePath: string): Promise<void> {
		const isRegisteredScript = isRegisteredScriptEntrypoint(
			this.entrypointRegistry.getRegisteredEntrypoints(),
			filePath,
		);

		if (!isRegisteredScript) {
			this.invalidationService.invalidateServerModules([filePath]);
		}

		const handlers = this.appConfig.runtime?.registeredScriptEntrypointChangeHandlers ?? [];
		for (const handler of handlers) {
			try {
				const result = await handler(filePath);
				if (result === true) {
					this.registeredScriptReloadRequired.add(path.resolve(filePath));
				}
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: `Failed to handle registered script entrypoint change for ${filePath}: ${String(error)}`;
				this.broadcast({ type: 'error', message });
				throw error;
			}
		}

		if (isRegisteredScript) {
			return;
		}

		const appModuleLoader = this.appConfig.runtime?.appModuleLoader;
		if (!appModuleLoader) {
			return;
		}

		await appModuleLoader.importModule({
			filePath,
			rootDir: this.appConfig.rootDir,
			outdir: path.join(resolveInternalExecutionDir(this.appConfig), '.server-modules'),
			externalPackages: true,
			bypassCache: true,
		});
	}

	public getOutputUrl(entrypointPath: string): string | undefined {
		return this.entrypointRegistry.getRegisteredEntrypoints().get(path.resolve(entrypointPath))?.outputUrl;
	}

	/**
	 * Returns the registered script output when the entrypoint is already tracked for HMR.
	 *
	 * @remarks
	 * Dev-transform scripts use the source path as `outputPath`. A fresh dev session must
	 * still register the entrypoint so file watchers can invalidate it on change.
	 */
	public getResolvedScriptOutput(entrypointPath: string): ResolvedHmrEntrypoint | undefined {
		const normalizedEntrypoint = path.resolve(entrypointPath);
		const registered = this.entrypointRegistry.getRegisteredEntrypoints().get(normalizedEntrypoint);

		if (!registered || !fileSystem.exists(registered.outputPath)) {
			return undefined;
		}

		return registered;
	}

	public getWatchedFiles(): Map<string, string> {
		return this.entrypointRegistry.getWatchedOutputUrls();
	}

	public getRegisteredEntrypoints(): ReadonlyMap<string, ResolvedHmrEntrypoint> {
		return this.entrypointRegistry.getRegisteredEntrypoints();
	}

	public async tryHandleDevClientRequest(request: Request): Promise<Response | null> {
		return this.devTransformServer.tryHandleRequest(request);
	}

	public tryHandleAssetRequest(request: Request): Response | null {
		const url = new URL(request.url);

		if (url.pathname === HMR_RUNTIME_SCRIPT_URL) {
			const runtimePath = this.getRuntimePath();
			if (fileSystem.exists(runtimePath)) {
				return new Response(fileSystem.readFileAsBuffer(runtimePath) as BodyInit, {
					headers: {
						'Content-Type': 'application/javascript',
						'Cache-Control': 'no-store, must-revalidate',
					},
				});
			}
		}

		return null;
	}

	public getRuntimeWorkDir(): string {
		return this.runtimeWorkDir;
	}

	public getDefaultContext(): DefaultHmrContext {
		return {
			getWatchedFiles: () => this.entrypointRegistry.getWatchedOutputUrls(),
			getRegisteredEntrypoints: () => this.entrypointRegistry.getRegisteredEntrypoints(),
			getSrcDir: () => this.appConfig.absolutePaths.srcDir,
			getLayoutsDir: () => this.appConfig.absolutePaths.layoutsDir,
			getPagesDir: () => this.appConfig.absolutePaths.pagesDir,
			getEntrypointDependencyGraph: () => this.entrypointDependencyGraph,
			importServerModule: async <T>(filePath: string) =>
				await this.serverModuleTranspiler.importModule<T>({
					filePath,
					outdir: path.join(resolveInternalExecutionDir(this.appConfig), '.server-modules'),
					externalPackages: true,
				}),
		};
	}

	public stop() {
		this.runtimeReady = false;
		this.entrypointRegistry.clearAll();
		this.devTransformServer.reset();
		for (const watcher of this.watchers.values()) {
			watcher.close();
		}
		this.watchers.clear();
		this.entrypointDependencyGraph.reset();
	}

	protected clearFailedEntrypointRegistration(entrypointPath: string): void {
		this.entrypointRegistry.clearRegistration(entrypointPath);
		this.entrypointDependencyGraph.clearEntrypointDependencies(entrypointPath);
	}

	public async registerEntrypoint(entrypointPath: string): Promise<string> {
		return this.registerDevTransformEntrypoint(entrypointPath, 'page').outputUrl;
	}

	public async registerScriptEntrypoint(entrypointPath: string): Promise<ResolvedHmrEntrypoint> {
		const { normalized, outputUrl, role } = this.registerDevTransformEntrypoint(entrypointPath, 'script');
		return {
			sourcePath: normalized,
			outputPath: normalized,
			outputUrl,
			role,
		};
	}

	private registerDevTransformEntrypoint(
		entrypointPath: string,
		role: ResolvedHmrEntrypoint['role'],
	): { normalized: string; outputUrl: string; role: ResolvedHmrEntrypoint['role'] } {
		const normalized = path.resolve(entrypointPath);
		if (!fileSystem.exists(normalized)) {
			throw new Error(`[HMR] Failed to register ${role} entrypoint: missing source ${normalized}`);
		}

		const outputUrl = this.devTransformServer.registerModule(entrypointPath);
		this.entrypointRegistry.registerTransformModule(entrypointPath, outputUrl, { role });
		return { normalized, outputUrl, role };
	}

	[Symbol.dispose]() {
		this.stop();
	}
}
