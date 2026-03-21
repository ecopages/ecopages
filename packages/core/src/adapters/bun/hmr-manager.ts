import fs from 'node:fs';
import path from 'node:path';
import type { ServerWebSocket, WebSocketHandler } from 'bun';
import { RESOLVED_ASSETS_DIR } from '../../constants';
import { getAppBuildExecutor } from '../../build/build-adapter.ts';
import type { DefaultHmrContext, EcoPagesAppConfig, IHmrManager } from '../../internal-types';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import { fileSystem } from '@ecopages/file-system';
import { HmrStrategyType, type HmrStrategy } from '../../hmr/hmr-strategy';
import { DefaultHmrStrategy } from '../../hmr/strategies/default-hmr-strategy';
import { JsHmrStrategy } from '../../hmr/strategies/js-hmr-strategy';
import { appLogger } from '../../global/app-logger';
import type { ClientBridge } from './client-bridge';
import type { ClientBridgeEvent } from '../../public-types';
import { HmrEntrypointRegistrar } from '../shared/hmr-entrypoint-registrar.ts';
import { BrowserBundleService } from '../../services/browser-bundle.service.ts';
import { DevelopmentInvalidationService } from '../../services/development-invalidation.service.ts';
import { getAppDevGraphService, NoopDevGraphService, setAppDevGraphService } from '../../services/dev-graph.service.ts';
import { getAppRuntimeSpecifierRegistry } from '../../services/runtime-specifier-registry.service.ts';
import { ServerModuleTranspiler } from '../../services/server-module-transpiler.service.ts';
import { resolveInternalExecutionDir, resolveInternalWorkDir } from '../../utils/resolve-work-dir.ts';

type BunSocket = ServerWebSocket<unknown>;
type BunSocketHandler = WebSocketHandler<unknown>;

export interface HmrManagerParams {
	appConfig: EcoPagesAppConfig;
	bridge: ClientBridge;
}

type HandleFileChangeOptions = {
	broadcast?: boolean;
};

/**
 * Bun development HMR manager.
 *
 * @remarks
 * Bun shares the same public contract as the Node manager: page entrypoints are
 * strict integration-owned registrations, while generic script assets use their
 * own explicit registration path.
 */
export class HmrManager implements IHmrManager {
	private static readonly entrypointRegistrationTimeoutMs = 4000;
	public readonly appConfig: EcoPagesAppConfig;
	private readonly bridge: ClientBridge;
	/** Keep track of watchers */
	private watchers = new Map<string, fs.FSWatcher>();
	/** entrypoint -> output path */
	private watchedFiles = new Map<string, string>();
	private entrypointRegistrations = new Map<string, Promise<string>>();
	private distDir: string;
	private plugins: EcoBuildPlugin[] = [];
	private enabled = true;
	private strategies: HmrStrategy[] = [];
	private readonly entrypointRegistrar: HmrEntrypointRegistrar;
	private readonly browserBundleService: BrowserBundleService;
	private readonly devGraphService: ReturnType<typeof getAppDevGraphService>;
	private readonly runtimeSpecifierRegistry: ReturnType<typeof getAppRuntimeSpecifierRegistry>;
	private readonly serverModuleTranspiler: ServerModuleTranspiler;
	private wsHandler!: {
		open: (ws: BunSocket) => void;
		close: (ws: BunSocket) => void;
	};

	constructor({ appConfig, bridge }: HmrManagerParams) {
		this.appConfig = appConfig;
		this.bridge = bridge;
		this.distDir = path.join(resolveInternalWorkDir(this.appConfig), RESOLVED_ASSETS_DIR, '_hmr');
		this.entrypointRegistrar = new HmrEntrypointRegistrar({
			srcDir: this.appConfig.absolutePaths.srcDir,
			distDir: this.distDir,
			entrypointRegistrations: this.entrypointRegistrations,
			watchedFiles: this.watchedFiles,
			clearFailedRegistration: (entrypointPath) => this.clearFailedEntrypointRegistration(entrypointPath),
			registrationTimeoutMs: HmrManager.entrypointRegistrationTimeoutMs,
		});
		this.browserBundleService = new BrowserBundleService(appConfig);
		const existingDevGraphService = getAppDevGraphService(appConfig);
		this.devGraphService =
			existingDevGraphService instanceof NoopDevGraphService
				? existingDevGraphService
				: new NoopDevGraphService();
		setAppDevGraphService(this.appConfig, this.devGraphService);
		this.runtimeSpecifierRegistry = getAppRuntimeSpecifierRegistry(this.appConfig);
		const invalidationService = new DevelopmentInvalidationService(this.appConfig);
		this.serverModuleTranspiler = new ServerModuleTranspiler({
			rootDir: this.appConfig.rootDir,
			buildExecutor: getAppBuildExecutor(this.appConfig),
			getInvalidationVersion: () => invalidationService.getServerModuleInvalidationVersion(),
			invalidateModules: (changedFiles) => invalidationService.invalidateServerModules(changedFiles),
		});
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
	 * Returns whether the generic JS strategy may rebuild an entrypoint.
	 *
	 * @remarks
	 * Integration-owned page entrypoints are excluded so a shared dependency
	 * invalidation cannot replace framework-owned browser output with a generic JS
	 * rebuild.
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

	/**
	 * Initializes core HMR strategies.
	 * Strategies are evaluated in priority order (highest first).
	 */
	private initializeStrategies(): void {
		const jsContext = {
			getWatchedFiles: () => this.watchedFiles,
			getSpecifierMap: () => this.runtimeSpecifierRegistry.getAll(),
			getDistDir: () => this.distDir,
			getPlugins: () => this.plugins,
			getSrcDir: () => this.appConfig.absolutePaths.srcDir,
			getBrowserBundleService: () => this.browserBundleService,
			getDevGraphService: () => this.devGraphService,
			shouldProcessEntrypoint: (entrypointPath: string) => this.shouldJsStrategyProcessEntrypoint(entrypointPath),
		};

		this.strategies = [new JsHmrStrategy(jsContext), new DefaultHmrStrategy()];
	}

	/**
	 * Registers a custom HMR strategy.
	 * Used by integrations to provide framework-specific HMR handling.
	 * @param strategy - The HMR strategy to register
	 */
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
	 * These mappings are consumed by framework-owned HMR strategies that preserve
	 * shared runtime imports in browser bundles. The registry stays generic so
	 * these mappings can later support broader import-map-style runtime features
	 * without moving integration semantics into core.
	 */
	public registerSpecifierMap(map: Record<string, string>): void {
		this.runtimeSpecifierRegistry.register(map);
	}

	public getWebSocketHandler(): BunSocketHandler {
		const open = (ws: BunSocket) => {
			this.bridge.subscribe(ws);
			appLogger.debug(`[HmrManager] Connection opened. Subscribers: ${this.bridge.subscriberCount}`);
		};

		const close = (ws: BunSocket) => {
			this.bridge.unsubscribe(ws);
			appLogger.debug(`[HmrManager] Connection closed. Subscribers: ${this.bridge.subscriberCount}`);
		};

		this.wsHandler = { open, close };

		return {
			open: this.wsHandler.open,
			close: this.wsHandler.close,
			message: (_ws, message) => {
				appLogger.debug('[HMR] Received message from client:', message);
			},
		};
	}

	/**
	 * Builds the client-side HMR runtime script.
	 */
	public async buildRuntime(): Promise<void> {
		const runtimeSource = path.resolve(import.meta.dirname, '../../hmr/client/hmr-runtime.ts');

		const result = await this.browserBundleService.bundle({
			profile: 'hmr-runtime',
			entrypoints: [runtimeSource],
			outdir: this.distDir,
			naming: '_hmr_runtime.js',
			minify: false,
			plugins: this.plugins,
		});

		if (!result.success) {
			appLogger.error('[HMR] Failed to build runtime script:', result.logs);
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

		appLogger.debug(`[HmrManager] Selected strategy: ${strategy.constructor.name}`);

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
	}

	/**
	 * Registers one integration-owned page entrypoint.
	 *
	 * @remarks
	 * Concurrent callers share one in-flight registration. The registration is
	 * cleared from the dedupe map when it settles so later callers cannot inherit a
	 * stale promise.
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
	 * This explicit path keeps the page-entrypoint contract strict while still
	 * allowing generic script assets to use the fallback build path.
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
	 * Performs strict integration-owned registration for one normalized path.
	 *
	 * @remarks
	 * The manager reserves the output URL, removes any stale emitted file, runs
	 * strategy processing without broadcasting, and then verifies that the owning
	 * integration emitted the expected file.
	 */
	private async emitStrictEntrypoint(entrypointPath: string, _outputPath: string): Promise<void> {
		await this.handleFileChange(entrypointPath, { broadcast: false });
	}

	/**
	 * Performs registration for a generic script asset.
	 *
	 * @remarks
	 * Strategies get the first chance to emit output. If no output exists after
	 * that pass, Bun falls back to the generic browser build for this explicit
	 * script-only path.
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
	 * Emitted `_hmr` files remain on disk because parallel app processes may share
	 * the same dist directory. The in-memory indexes are cleared so stale
	 * entrypoints and specifier maps cannot leak through a reused manager object.
	 */
	public stop() {
		this.entrypointRegistrations.clear();
		for (const watcher of this.watchers.values()) {
			watcher.close();
		}
		this.watchers.clear();
		this.watchedFiles.clear();
		this.runtimeSpecifierRegistry.clear();
		this.devGraphService.reset();
		this.plugins = [];
	}
}
