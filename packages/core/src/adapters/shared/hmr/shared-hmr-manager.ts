import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESOLVED_ASSETS_DIR } from '../../../config/constants.ts';
import { isDevTransformModuleUrl } from '../../../hmr/hmr-asset-paths.ts';
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
	protected readonly devTransformServer: DevTransformServer;

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
		this.devTransformServer = new DevTransformServer({ appConfig: this.appConfig });
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

	registerDevTransformContributor(contributor: DevTransformBundleContributor): void {
		this.devTransformServer.addContributor(contributor);
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
			invalidateDevTransformSource: (sourcePath: string) => this.devTransformServer.invalidateSource(sourcePath),
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

		if (isRegisteredScriptEntrypoint(this.entrypointRegistrar.getRegistered(), resolvedFilePath)) {
			if (this.shouldSkipMissingFileChange(filePath) && !fileSystem.exists(filePath)) {
				appLogger.debug(`[${this.constructor.name}] Skipping missing file change: ${filePath}`);
				this.clearFailedEntrypointRegistration(filePath);
				return;
			}

			await this.prepareRegisteredScriptChange(resolvedFilePath);

			const registered = this.entrypointRegistrar.getRegistered().get(resolvedFilePath);
			if (registered && isDevTransformModuleUrl(registered.outputUrl)) {
				this.devTransformServer.invalidateSource(resolvedFilePath);
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

			return;
		}

		this.devTransformServer.invalidateAll();

		if (this.shouldSkipMissingFileChange(filePath) && !fileSystem.exists(filePath)) {
			appLogger.debug(`[${this.constructor.name}] Skipping missing file change: ${filePath}`);
			this.clearFailedEntrypointRegistration(filePath);
			return;
		}

		const shouldBroadcast = options.broadcast ?? true;
		const strategy = this.selectChangeStrategy(filePath);

		if (!strategy) {
			appLogger.warn(`[HMR] No strategy found for ${filePath}`);
			if (shouldBroadcast && this.bridge.subscriberCount > 0) {
				this.broadcast({ type: 'reload' });
			}
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
			return;
		}

		if (shouldBroadcast && this.bridge.subscriberCount > 0) {
			this.broadcast({ type: 'reload' });
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
	 * Returns the registered script output when the entrypoint is already tracked for HMR.
	 *
	 * @remarks
	 * Dev-transform scripts use the source path as `outputPath`. A fresh dev session must
	 * still register the entrypoint so file watchers can invalidate it on change.
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

	public async tryHandleDevClientRequest(request: Request): Promise<Response | null> {
		return this.devTransformServer.tryHandleRequest(request);
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
		const url = this.devTransformServer.registerModule(entrypointPath);
		this.entrypointRegistrar.registerTransformModule(entrypointPath, url);
		return url;
	}

	public async registerScriptEntrypoint(entrypointPath: string): Promise<ResolvedHmrEntrypoint> {
		const normalized = path.resolve(entrypointPath);
		if (!fileSystem.exists(normalized)) {
			throw new Error(`[HMR] Failed to register script entrypoint: missing source ${normalized}`);
		}

		const outputUrl = await this.registerEntrypoint(entrypointPath);
		return {
			sourcePath: normalized,
			outputPath: normalized,
			outputUrl,
		};
	}

	[Symbol.dispose]() {
		this.stop();
	}
}
