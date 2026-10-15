import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HMR_RUNTIME_SCRIPT_URL, resolveHmrRuntimeWorkDir } from '../../../hmr/hmr-runtime-paths.ts';
import {
	bundleDevClientRuntime,
	injectDevClientRuntimes,
	readDevClientRuntime,
	type DevClientRuntime,
} from '../../../hmr/dev-client-runtime.ts';
import { isDevToolbarEnabled } from '../../../dev-toolbar/dev-toolbar-config.ts';
import { createDevToolbarClientRuntime } from '../../../dev-toolbar/dev-toolbar-runtime.ts';
import { isDevTransformModuleUrl } from '../../../hmr/hmr-asset-paths.ts';
import { isRegisteredDevTransformEntrypoint } from '../../../hmr/hmr-entrypoint-output.ts';
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
import type {
	ClientBridgeEvent,
	HmrFileChangeOptions,
	RegisteredScriptEntrypointChangeHandler,
	ResolvedHmrEntrypoint,
} from '../../../types/public-types.ts';
import { DevTransformEntrypointRegistry } from './dev-transform-entrypoint-registry.ts';
import { BrowserBundleService } from '../../../services/assets/browser-bundle.service.ts';
import { requireAppRuntime } from '../../../config/app-runtime.ts';
import { createAppServerModuleTranspiler } from '../../../services/module-loading/app-server-module-transpiler.service.ts';
import type { EntrypointDependencyGraph } from '../../../services/runtime-state/entrypoint-dependency-graph.service.ts';
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
	private readonly scriptEntrypointChangeHandlers: RegisteredScriptEntrypointChangeHandler[] = [];
	private readonly registeredScriptReloadRequired = new Set<string>();
	protected readonly entrypointRegistry: DevTransformEntrypointRegistry;
	protected readonly browserBundleService: BrowserBundleService;
	protected readonly invalidationService: DevelopmentInvalidationService;
	protected readonly entrypointDependencyGraph: EntrypointDependencyGraph;
	protected readonly serverModuleTranspiler: ServerModuleTranspiler;
	private readonly hmrRuntime: DevClientRuntime;
	private readonly devToolbarRuntime: DevClientRuntime;
	private readonly runtimeBuilds = new Map<DevClientRuntime, Promise<boolean>>();
	private readonly readyRuntimes = new Set<DevClientRuntime>();
	protected readonly devTransformServer: DevTransformServer;

	constructor({ appConfig, bridge }: SharedHmrManagerParams) {
		this.appConfig = appConfig;
		this.bridge = bridge;
		this.runtimeWorkDir = resolveHmrRuntimeWorkDir(resolveInternalWorkDir(this.appConfig));
		this.hmrRuntime = {
			name: 'HMR',
			url: HMR_RUNTIME_SCRIPT_URL,
			workDir: this.runtimeWorkDir,
			resolveEntry: () => fileURLToPath(import.meta.resolve('@ecopages/core/hmr/client/hmr-runtime')),
			onFailure: (error) => this.onRuntimeBundleFailure(error),
		};
		this.devToolbarRuntime = createDevToolbarClientRuntime(appConfig);
		this.entrypointRegistry = new DevTransformEntrypointRegistry();
		this.browserBundleService = new BrowserBundleService(appConfig);
		this.invalidationService = new DevelopmentInvalidationService(appConfig);
		const runtime = requireAppRuntime(appConfig);
		runtime.hmr = this;
		this.entrypointDependencyGraph = this.createEntrypointDependencyGraph(runtime.entrypointDependencyGraph);
		runtime.entrypointDependencyGraph = this.entrypointDependencyGraph;
		this.serverModuleTranspiler = createAppServerModuleTranspiler(this.appConfig);
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
	}

	/**
	 * Returns the browser runtimes this session serves: the HMR client, plus the Dev Toolbar client when it is
	 * configured and HMR is enabled.
	 */
	private getDevClientRuntimes(): DevClientRuntime[] {
		return isDevToolbarEnabled(this.appConfig, { watch: this.enabled })
			? [this.hmrRuntime, this.devToolbarRuntime]
			: [this.hmrRuntime];
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

	public onScriptEntrypointChanged(handler: RegisteredScriptEntrypointChangeHandler): void {
		if (!this.scriptEntrypointChangeHandlers.includes(handler)) {
			this.scriptEntrypointChangeHandlers.push(handler);
		}
	}

	public setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	public isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Builds each browser runtime once per manager session and reuses an in-flight build for concurrent callers.
	 */
	public async ensureRuntimeReady(): Promise<boolean> {
		const ready = await Promise.all(this.getDevClientRuntimes().map((runtime) => this.ensureRuntimeBuilt(runtime)));
		return ready.every(Boolean);
	}

	private async ensureRuntimeBuilt(runtime: DevClientRuntime): Promise<boolean> {
		if (this.readyRuntimes.has(runtime)) {
			return true;
		}

		let build = this.runtimeBuilds.get(runtime);
		if (!build) {
			build = bundleDevClientRuntime(runtime, this.browserBundleService);
			this.runtimeBuilds.set(runtime, build);
		}

		try {
			const ready = await build;
			if (ready) {
				this.readyRuntimes.add(runtime);
			}
			return ready;
		} finally {
			this.runtimeBuilds.delete(runtime);
		}
	}

	/**
	 * Loads the runtimes that built successfully from an HTML response, and leaves it alone while HMR is off.
	 */
	public async injectDevClientRuntimes(response: Response): Promise<Response> {
		if (!this.enabled) {
			return response;
		}

		return injectDevClientRuntimes(
			response,
			this.getDevClientRuntimes().filter((runtime) => this.readyRuntimes.has(runtime)),
		);
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
			await this.runRegisteredEntrypointChangeHandlers(resolvedFilePath);

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

	/**
	 * @remarks
	 * The Project Watcher batch already marked the server modules of this file dirty through
	 * `applyDevFileChanges`, so the manager neither invalidates them again nor imports them ahead of the
	 * next request that needs them.
	 */
	private async runRegisteredEntrypointChangeHandlers(filePath: string): Promise<void> {
		for (const handler of this.scriptEntrypointChangeHandlers) {
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
		const { pathname } = new URL(request.url);
		const runtime = this.getDevClientRuntimes().find((candidate) => candidate.url === pathname);
		return runtime ? readDevClientRuntime(runtime) : null;
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
		this.enabled = false;
		this.readyRuntimes.clear();
		this.scriptEntrypointChangeHandlers.length = 0;
		this.registeredScriptReloadRequired.clear();
		this.entrypointRegistry.clearAll();
		this.devTransformServer.reset();
		this.entrypointDependencyGraph.reset();
		if (this.appConfig.appRuntime?.hmr === this) {
			this.appConfig.appRuntime.hmr = null;
		}
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
