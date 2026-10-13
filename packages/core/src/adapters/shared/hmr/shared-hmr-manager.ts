import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HMR_RUNTIME_SCRIPT_URL, resolveHmrRuntimeWorkDir } from '../../../hmr/hmr-runtime-paths.ts';
import {
	DEV_TOOLBAR_RUNTIME_SCRIPT_URL,
	resolveDevToolbarRuntimeWorkDir,
} from '../../../dev-toolbar/dev-toolbar-runtime-paths.ts';
import { DevToolbarHost } from '../../../dev-toolbar/dev-toolbar-host.ts';
import { isDevTransformModuleUrl } from '../../../hmr/hmr-asset-paths.ts';
import {
	removeStaleHmrEntrypointOutput,
	isRegisteredDevTransformEntrypoint,
	isRegisteredScriptEntrypoint,
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
import type { ClientBridgeEvent, HmrFileChangeOptions, ResolvedHmrEntrypoint } from '../../../types/public-types.ts';
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
import { prepareHmrFileChange } from '../../../hmr/hmr-file-change-prep.ts';

type HandleFileChangeOptions = HmrFileChangeOptions;

type SharedHmrManagerParams = {
	appConfig: EcoPagesAppConfig;
	bridge: IClientBridge;
};

export abstract class SharedHmrManager implements IHmrManager {
	public readonly appConfig: EcoPagesAppConfig;
	protected readonly bridge: IClientBridge;
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
	private devToolbarWorkDir: string;
	private devToolbarBuildPromise: Promise<boolean> | null = null;
	private devToolbarReady = false;
	protected readonly devTransformServer: DevTransformServer;

	constructor({ appConfig, bridge }: SharedHmrManagerParams) {
		this.appConfig = appConfig;
		this.bridge = bridge;
		this.runtimeWorkDir = resolveHmrRuntimeWorkDir(resolveInternalWorkDir(this.appConfig));
		this.devToolbarWorkDir = resolveDevToolbarRuntimeWorkDir(resolveInternalWorkDir(this.appConfig));
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
			onTransformError: (message) => this.broadcast({ type: 'error', message }),
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

	/**
	 * Reacts to a failed HMR runtime bundle.
	 *
	 * @remarks
	 * Only the HMR runtime reports here. A Dev Toolbar bundle failure is logged by the manager and
	 * leaves HMR running, because the toolbar is an optional client the page does not need to update.
	 */
	protected onRuntimeBundleFailure(error: unknown): void {
		appLogger.error('[HMR] Failed to build runtime script:', error);
	}

	protected ensureRuntimeWorkDir(): void {
		fileSystem.ensureDir(this.runtimeWorkDir);
		if (this.shouldBuildDevToolbar()) {
			fileSystem.ensureDir(this.devToolbarWorkDir);
		}
	}

	protected shouldBuildDevToolbar(): boolean {
		return this.getDevToolbarHost().isEnabled();
	}

	private getDevToolbarHost(): DevToolbarHost {
		return DevToolbarHost.forApp(this.appConfig, { watch: this.enabled });
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

	/**
	 * Builds the browser HMR runtime once per manager session and reuses the in-flight build for concurrent callers.
	 */
	public async ensureRuntimeReady(): Promise<boolean> {
		const [hmrReady, devToolbarReady] = await Promise.all([
			this.ensureHmrRuntimeReady(),
			this.ensureDevToolbarRuntimeReady(),
		]);
		return hmrReady && devToolbarReady;
	}

	private async ensureHmrRuntimeReady(): Promise<boolean> {
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

	private async ensureDevToolbarRuntimeReady(): Promise<boolean> {
		if (!this.shouldBuildDevToolbar()) {
			return true;
		}

		if (this.devToolbarReady) {
			return true;
		}

		if (this.devToolbarBuildPromise) {
			return this.devToolbarBuildPromise;
		}

		this.devToolbarBuildPromise = this.buildDevToolbarRuntimeInternal();
		try {
			const ready = await this.devToolbarBuildPromise;
			this.devToolbarReady = ready;
			return ready;
		} finally {
			this.devToolbarBuildPromise = null;
		}
	}

	private getRuntimePath(): string {
		return path.join(this.runtimeWorkDir, path.basename(HMR_RUNTIME_SCRIPT_URL));
	}

	private async buildDevToolbarRuntimeInternal(): Promise<boolean> {
		return this.getDevToolbarHost().bundleClientRuntime({
			browserBundleService: this.browserBundleService,
			workDir: this.devToolbarWorkDir,
			onFailure: (error) => appLogger.error('[DevToolbar] Could not bundle the Dev Toolbar runtime:', error),
		});
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
		await this.handleFileChanges([filePath], options);
	}

	public async handleFileChanges(filePaths: string[], options: HandleFileChangeOptions = {}): Promise<void> {
		if (filePaths.length === 0) {
			return;
		}

		this.devTransformServer.clearFailures();
		const events: ClientBridgeEvent[] = [];
		const uniqueFilePaths = [...new Set(filePaths.map((candidate) => path.resolve(candidate)))];

		for (const filePath of uniqueFilePaths) {
			const affectedGraphIdentities =
				options.graphIdentities ??
				(this.isEnabled() ? prepareHmrFileChange(this.appConfig, filePath).affectedGraphIdentities : undefined);
			const graphIdentities = affectedGraphIdentities?.length ? affectedGraphIdentities : undefined;
			try {
				events.push(...(await this.processFileChange(filePath, graphIdentities)));
			} catch (error) {
				appLogger.error(error instanceof Error ? error : new Error(String(error)));
				events.push({ type: 'error', message: error instanceof Error ? error.message : String(error) });
			}
		}

		this.broadcastBatchEvents(events, options, uniqueFilePaths);
	}

	private async processFileChange(
		filePath: string,
		graphIdentities: ClientBridgeEvent['graphIdentities'],
	): Promise<ClientBridgeEvent[]> {
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
			return [];
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
			return buildStrategyEvents({ type: 'none' }, !isRegisteredDevTransformEdit, graphIdentities);
		}

		appLogger.debug(`[${this.constructor.name}] Selected strategy: ${strategy.constructor.name}`);
		return buildStrategyEvents(await strategy.process(filePath), !isRegisteredDevTransformEdit, graphIdentities);
	}

	/**
	 * @remarks
	 * With no browser connected the events are dropped, not queued. A tab opened later loads its page after the
	 * change, so its HTML and versioned module URLs are already current. A tab that was reconnecting keeps its old
	 * page until the next change; replaying a `reload` for it would also reload every freshly opened tab, because
	 * the server cannot tell the two apart.
	 */
	private broadcastBatchEvents(
		events: ClientBridgeEvent[],
		options: HandleFileChangeOptions,
		filePaths: string[],
	): void {
		const batchEvents = coalesceBatchEvents(events);
		if (options.broadcast === false || batchEvents.length === 0) {
			return;
		}

		if (this.bridge.subscriberCount === 0) {
			const changeLabel = filePaths.length === 1 ? filePaths[0] : 'this file batch';
			appLogger.debug(`[${this.constructor.name}] No browser connected; dropping HMR events for ${changeLabel}`);
			return;
		}

		for (const event of batchEvents) {
			this.broadcast(event);
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

	/**
	 * Sends a browser that just connected the build errors of modules that still fail to transpile.
	 *
	 * @remarks
	 * A build error is broadcast while the failing module is served, which can happen before the page's HMR
	 * socket connects. Without this replay that browser would never show the error.
	 */
	public sendPendingBuildErrors(client: { send(payload: string): void }): void {
		for (const message of this.devTransformServer.getFailureMessages()) {
			client.send(JSON.stringify({ type: 'error', message } satisfies ClientBridgeEvent));
		}
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

		if (url.pathname === DEV_TOOLBAR_RUNTIME_SCRIPT_URL && this.shouldBuildDevToolbar()) {
			const runtimeResponse = this.getDevToolbarHost().readBundledRuntime(this.devToolbarWorkDir);
			if (runtimeResponse) {
				return runtimeResponse;
			}
		}

		return null;
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

function buildStrategyEvents(
	action: HmrAction,
	fallbackReload: boolean,
	graphIdentities: ClientBridgeEvent['graphIdentities'],
): ClientBridgeEvent[] {
	const events: ClientBridgeEvent[] =
		action.type === 'broadcast' && action.events ? action.events : fallbackReload ? [{ type: 'reload' }] : [];

	return events.map((event) =>
		event.graphIdentities === undefined && graphIdentities !== undefined ? { ...event, graphIdentities } : event,
	);
}

/**
 * @remarks
 * A `reload` makes every other update redundant. Otherwise each distinct update is kept, so edits that touch several
 * islands hot-update each of them, and several layout updates collapse into one soft refresh.
 */
function coalesceBatchEvents(events: ClientBridgeEvent[]): ClientBridgeEvent[] {
	const errors = deduplicateEvents(events.filter((event) => event.type === 'error'));
	const updates = deduplicateEvents(events.filter((event) => event.type !== 'error'));
	if (updates.length <= 1) {
		return [...errors, ...updates];
	}

	const graphIdentities = mergeGraphIdentities(updates);
	if (updates.some((event) => event.type === 'reload')) {
		return [...errors, { type: 'reload', ...(graphIdentities ? { graphIdentities } : {}) }];
	}

	const layoutUpdates = updates.filter((event) => event.type === 'layout-update');
	const others = updates.filter((event) => event.type !== 'layout-update');
	if (layoutUpdates.length <= 1) {
		return [...errors, ...others, ...layoutUpdates];
	}

	return [
		...errors,
		...others,
		{
			type: 'layout-update',
			timestamp: Math.max(...layoutUpdates.map((event) => event.timestamp ?? 0)),
			...(graphIdentities ? { graphIdentities } : {}),
		},
	];
}

function deduplicateEvents(events: ClientBridgeEvent[]): ClientBridgeEvent[] {
	const uniqueEvents = new Map<string, ClientBridgeEvent>();
	for (const event of events) {
		const key = JSON.stringify([event.type, event.path, event.message]);
		const existing = uniqueEvents.get(key);
		if (existing) {
			const graphIdentities = mergeGraphIdentities([existing, event]);
			uniqueEvents.set(key, {
				...existing,
				...(existing.timestamp !== undefined || event.timestamp !== undefined
					? { timestamp: Math.max(existing.timestamp ?? 0, event.timestamp ?? 0) }
					: {}),
				...(graphIdentities ? { graphIdentities } : {}),
			});
			continue;
		}
		uniqueEvents.set(key, event);
	}
	return [...uniqueEvents.values()];
}

function mergeGraphIdentities(events: ClientBridgeEvent[]): ClientBridgeEvent['graphIdentities'] {
	const identities = events.flatMap((event) => event.graphIdentities ?? []);
	if (identities.length === 0) {
		return undefined;
	}

	const unique = new Map(identities.map((identity) => [JSON.stringify(identity), identity]));
	return [...unique.values()];
}
