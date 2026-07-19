import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESOLVED_ASSETS_DIR } from '../../../config/constants.ts';
import {
	removeStaleHmrEntrypointOutput,
	isRegisteredScriptEntrypoint,
	isBrowserOnlyRegisteredScriptEntrypoint,
	type ResolvedHmrEntrypoint,
} from '../../../hmr/hmr-entrypoint-output.ts';
import { requireBuildRuntime } from '../../../build/runtime/build-runtime.ts';
import type {
	DefaultHmrContext,
	EcoPagesAppConfig,
	IHmrManager,
	IClientBridge,
} from '../../../types/internal-types.ts';
import { fileSystem } from '@ecopages/file-system';
import { HmrStrategyType, type HmrStrategy } from '../../../hmr/hmr-strategy.ts';
import { DefaultHmrStrategy } from '../../../hmr/strategies/default-hmr-strategy.ts';
import { JsHmrStrategy } from '../../../hmr/strategies/js-hmr-strategy.ts';
import { ServerRenderedTemplateHmrStrategy } from '../../../hmr/strategies/server-rendered-template-hmr-strategy.ts';
import { DevelopmentInvalidationService } from '../../../services/invalidation/development-invalidation.service.ts';
import { appLogger } from '../../../global/app-logger.ts';
import type { ClientBridgeEvent, HmrFileChangeOptions } from '../../../types/public-types.ts';
import { HmrEntrypointRegistrar } from './hmr-entrypoint-registrar.ts';
import { BrowserBundleService } from '../../../services/assets/browser-bundle.service.ts';
import { getAppServerModuleTranspiler } from '../../../services/module-loading/app-server-module-transpiler.service.ts';
import {
	getAppEntrypointDependencyGraph,
	setAppEntrypointDependencyGraph,
	type EntrypointDependencyGraph,
} from '../../../services/runtime-state/entrypoint-dependency-graph.service.ts';
import type { ServerModuleTranspiler } from '../../../services/module-loading/server-module-transpiler.service.ts';
import { resolveInternalExecutionDir, resolveInternalWorkDir } from '../../../utils/resolve-work-dir.ts';

type HandleFileChangeOptions = HmrFileChangeOptions;

type SharedHmrManagerParams = {
	appConfig: EcoPagesAppConfig;
	bridge: IClientBridge;
};

export abstract class SharedHmrManager implements IHmrManager {
	public readonly appConfig: EcoPagesAppConfig;
	protected readonly bridge: IClientBridge;
	protected watchers = new Map<string, fs.FSWatcher>();
	protected distDir: string;
	protected enabled = false;
	protected strategies: HmrStrategy[] = [];
	protected readonly entrypointRegistrar: HmrEntrypointRegistrar;
	protected readonly browserBundleService: BrowserBundleService;
	protected readonly invalidationService: DevelopmentInvalidationService;
	protected readonly entrypointDependencyGraph: EntrypointDependencyGraph;
	protected readonly serverModuleTranspiler: ServerModuleTranspiler;
	private runtimeBuildPromise: Promise<boolean> | null = null;
	private runtimeReady = false;

	constructor({ appConfig, bridge }: SharedHmrManagerParams) {
		this.appConfig = appConfig;
		this.bridge = bridge;
		this.distDir = path.join(resolveInternalWorkDir(this.appConfig), RESOLVED_ASSETS_DIR, '_hmr');
		this.entrypointRegistrar = new HmrEntrypointRegistrar({
			srcDir: this.appConfig.absolutePaths.srcDir,
			distDir: this.distDir,
			clearFailedRegistration: (entrypointPath) => this.clearFailedEntrypointRegistration(entrypointPath),
		});
		this.browserBundleService = new BrowserBundleService(appConfig);
		this.invalidationService = new DevelopmentInvalidationService(appConfig);
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
			getWatchedFiles: () => this.entrypointRegistrar.getWatchedFiles(),
			getDistDir: () => this.distDir,
			getSrcDir: () => this.appConfig.absolutePaths.srcDir,
			getPagesDir: () => this.appConfig.absolutePaths.pagesDir,
			getLayoutsDir: () => this.appConfig.absolutePaths.layoutsDir,
			getTemplateExtensions: () => this.appConfig.templatesExt,
			getBrowserBundleService: () => this.browserBundleService,
			getEntrypointDependencyGraph: () => this.entrypointDependencyGraph,
			shouldProcessEntrypoint: (entrypointPath: string) => this.shouldJsStrategyProcessEntrypoint(entrypointPath),
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
		return path.join(this.distDir, '_hmr_runtime.js');
	}

	private async buildRuntimeInternal(): Promise<boolean> {
		const runtimeSource = fileURLToPath(import.meta.resolve('@ecopages/core/hmr/client/hmr-runtime'));
		const runtimePath = this.getRuntimePath();

		removeStaleHmrEntrypointOutput(runtimePath, 'HMR');

		try {
			const result = await this.browserBundleService.bundle({
				profile: 'hmr-runtime',
				entrypoints: [runtimeSource],
				outdir: this.distDir,
				naming: '_hmr_runtime.js',
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

		if (this.shouldSkipMissingFileChange(filePath) && !fileSystem.exists(filePath)) {
			appLogger.debug(`[${this.constructor.name}] Skipping missing file change: ${filePath}`);
			this.clearFailedEntrypointRegistration(filePath);
			return;
		}

		if (isRegisteredScriptEntrypoint(this.entrypointRegistrar.getRegistered(), resolvedFilePath)) {
			await this.prepareRegisteredScriptChange(resolvedFilePath);
		}

		const shouldBroadcast = options.broadcast ?? true;
		const strategy = this.selectChangeStrategy(filePath);

		if (!strategy) {
			appLogger.warn(`[HMR] No strategy found for ${filePath}`);
			return;
		}

		appLogger.debug(`[${this.constructor.name}] Selected strategy: ${strategy.constructor.name}`);

		const action = await strategy.process(filePath);

		if (shouldBroadcast && action.type === 'broadcast' && action.events) {
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
		}
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

	private selectEntrypointEmitter(entrypointPath: string): HmrStrategy | undefined {
		return this.getStrategiesByPriority().find((candidate) => {
			if (candidate.type !== HmrStrategyType.INTEGRATION) {
				return false;
			}

			try {
				return candidate.canEmitEntrypoint(entrypointPath);
			} catch (error) {
				appLogger.error(error);
				return false;
			}
		});
	}

	protected createUnownedEntrypointError(entrypointPath: string): Error {
		return new Error(
			`[HMR] No integration owns entrypoint ${entrypointPath}. Page entrypoints must be emitted by their owning integration.`,
		);
	}

	/**
	 * Materializes one integration-owned page entrypoint during cold registration.
	 *
	 * @remarks
	 * Registration uses {@link HmrStrategy.canEmitEntrypoint} / {@link HmrStrategy.emitEntrypoint},
	 * not {@link HmrStrategy.matches} / {@link HmrStrategy.process}. File-change handling stays
	 * on `handleFileChange()`.
	 */
	public async emitIntegrationEntrypoint(entrypointPath: string, outputPath: string): Promise<void> {
		const emitter = this.selectEntrypointEmitter(entrypointPath);

		if (!emitter) {
			throw this.createUnownedEntrypointError(entrypointPath);
		}

		appLogger.debug(`[${this.constructor.name}] Selected entrypoint emitter: ${emitter.constructor.name}`);
		await emitter.emitEntrypoint(entrypointPath, outputPath);
	}

	/**
	 * Runs server invalidation and integration hooks before rebuilding a registered script entrypoint.
	 *
	 * @remarks
	 * Browser-only `*.script.ts` entrypoints skip server module invalidation and bypass-cache
	 * import; only integration change handlers and the downstream strategy rebuild run.
	 */
	private async prepareRegisteredScriptChange(filePath: string): Promise<void> {
		const isBrowserOnlyRegisteredScript = isBrowserOnlyRegisteredScriptEntrypoint(filePath);

		if (!isBrowserOnlyRegisteredScript) {
			this.invalidationService.invalidateServerModules([filePath]);
		}

		const handlers = this.appConfig.runtime?.registeredScriptEntrypointChangeHandlers ?? [];
		for (const handler of handlers) {
			try {
				await handler(filePath);
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: `Failed to handle registered script entrypoint change for ${filePath}: ${String(error)}`;
				this.broadcast({ type: 'error', message });
				throw error;
			}
		}

		if (isBrowserOnlyRegisteredScript) {
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
		return this.entrypointRegistrar.getRegistered().get(path.resolve(entrypointPath))?.outputUrl;
	}

	/**
	 * Registers an already-materialized HMR entrypoint without rebuilding it.
	 *
	 * @remarks
	 * Cold dev batches build grouped Rolldown passes up front and then seed the
	 * registrar so the first SSR resolves the artifact from disk. The entrypoint
	 * is also added to the watched files so subsequent source edits still rebuild.
	 */
	public seedResolvedEntrypoint(resolved: ResolvedHmrEntrypoint): void {
		this.entrypointRegistrar.seedResolvedEntrypoint(resolved);
	}

	public trackInFlightEntrypoint(entrypointPath: string, promise: Promise<ResolvedHmrEntrypoint>): void {
		this.entrypointRegistrar.trackInFlightEntrypoint(entrypointPath, promise);
	}

	public tryTrackInFlightEntrypoint(entrypointPath: string, promise: Promise<ResolvedHmrEntrypoint>): boolean {
		return this.entrypointRegistrar.tryTrackInFlightEntrypoint(entrypointPath, promise);
	}

	public releaseInFlightEntrypoint(entrypointPath: string): void {
		this.entrypointRegistrar.releaseInFlightEntrypoint(entrypointPath);
	}

	/**
	 * Returns the emitted HMR script output when the entrypoint is already registered
	 * and its browser bundle exists on disk.
	 *
	 * @remarks
	 * Disk artifacts alone are not enough: a fresh dev session must still register
	 * the entrypoint so file watchers can rebuild it on change.
	 */
	public getResolvedScriptOutput(entrypointPath: string): ResolvedHmrEntrypoint | undefined {
		const normalizedEntrypoint = path.resolve(entrypointPath);
		const registered = this.entrypointRegistrar.getRegistered().get(normalizedEntrypoint);

		if (!registered || !fileSystem.exists(registered.outputPath)) {
			return undefined;
		}

		return registered;
	}

	public getWatchedFiles(): Map<string, string> {
		return this.entrypointRegistrar.getWatchedFiles();
	}

	public tryHandleAssetRequest(request: Request): Response | null {
		const url = new URL(request.url);

		if (url.pathname === '/_hmr_runtime.js') {
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

		if (url.pathname.startsWith('/assets/_hmr/')) {
			const relativePath = url.pathname.slice('/assets/_hmr/'.length);
			const assetPath = path.join(this.distDir, relativePath);

			if (fileSystem.exists(assetPath)) {
				return new Response(fileSystem.readFileAsBuffer(assetPath) as BodyInit, {
					headers: {
						'Content-Type': 'application/javascript',
						'Cache-Control': 'no-store, must-revalidate',
					},
				});
			}
		}

		return null;
	}

	public getDistDir(): string {
		return this.distDir;
	}

	public getDefaultContext(): DefaultHmrContext {
		return {
			getWatchedFiles: () => this.entrypointRegistrar.getWatchedFiles(),
			getDistDir: () => this.distDir,
			getSrcDir: () => this.appConfig.absolutePaths.srcDir,
			getLayoutsDir: () => this.appConfig.absolutePaths.layoutsDir,
			getPagesDir: () => this.appConfig.absolutePaths.pagesDir,
			getBuildExecutor: () => requireBuildRuntime(this.appConfig).getProfile('browser-hmr'),
			getBrowserBundleService: () => this.browserBundleService,
			getEntrypointDependencyGraph: () => this.entrypointDependencyGraph,
			seedResolvedEntrypoint: (resolved: ResolvedHmrEntrypoint) => this.seedResolvedEntrypoint(resolved),
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
		this.entrypointRegistrar.clearAll();
		for (const watcher of this.watchers.values()) {
			watcher.close();
		}
		this.watchers.clear();
		this.entrypointDependencyGraph.reset();
	}

	protected clearFailedEntrypointRegistration(entrypointPath: string): void {
		this.entrypointRegistrar.clearRegistration(entrypointPath);
		this.entrypointDependencyGraph.clearEntrypointDependencies(entrypointPath);
	}

	public async registerEntrypoint(entrypointPath: string): Promise<string> {
		const resolved = await this.entrypointRegistrar.registerEntrypoint(entrypointPath, {
			emit: async (normalizedEntrypoint, outputPath) =>
				await this.emitIntegrationEntrypoint(normalizedEntrypoint, outputPath),
			getMissingOutputError: (normalizedEntrypoint, outputPath) =>
				new Error(
					`[HMR] Integration failed to emit entrypoint ${normalizedEntrypoint} to ${outputPath}. Page entrypoints must be produced by their owning integration.`,
				),
		});
		return resolved.outputUrl;
	}

	public async registerScriptEntrypoint(entrypointPath: string): Promise<ResolvedHmrEntrypoint> {
		return await this.entrypointRegistrar.registerEntrypoint(entrypointPath, {
			emit: async (normalizedEntrypoint, outputPath) =>
				await this.emitScriptEntrypoint(normalizedEntrypoint, outputPath),
			getMissingOutputError: (normalizedEntrypoint, outputPath) =>
				new Error(`[HMR] Failed to register script entrypoint: ${normalizedEntrypoint} to ${outputPath}`),
		});
	}

	protected async emitScriptEntrypoint(entrypointPath: string, outputPath: string): Promise<void> {
		const naming = path.relative(this.distDir, outputPath).split(path.sep).join('/');
		const buildResult = await this.browserBundleService.bundle({
			profile: 'hmr-entrypoint',
			entrypoints: [entrypointPath],
			outdir: this.distDir,
			naming,
			minify: false,
		});

		if (!buildResult.success) {
			throw new Error(
				`[HMR] Generic script entrypoint build failed for ${entrypointPath}: ${JSON.stringify(buildResult.logs)}`,
			);
		}

		if (!fileSystem.exists(outputPath) && buildResult.outputs.length > 0) {
			const resolvedOutputPath = path.resolve(outputPath);
			const emittedOutput =
				buildResult.outputs.find((output) => path.resolve(output.path) === resolvedOutputPath)?.path ??
				buildResult.outputs.find((output) => path.basename(output.path) === path.basename(outputPath))?.path;

			if (emittedOutput && fileSystem.exists(emittedOutput)) {
				fileSystem.ensureDir(path.dirname(outputPath));
				if (path.resolve(emittedOutput) !== resolvedOutputPath) {
					fileSystem.copyFile(emittedOutput, outputPath);
				}
			}
		}

		const entrypointDependencies = buildResult.dependencyGraph?.entrypoints?.[entrypointPath];
		if (entrypointDependencies) {
			this.entrypointDependencyGraph.setEntrypointDependencies(entrypointPath, entrypointDependencies);
		}
	}

	[Symbol.dispose]() {
		this.stop();
	}
}
