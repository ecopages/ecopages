import path from 'node:path';
import { getServerModuleBuildCacheOutdir } from '../../../build/server/route-module-build-cache-registry.ts';
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
import { isRegisteredDevTransformEntrypoint } from '../../../hmr/hmr-entrypoint-output.ts';
import type {
	DefaultHmrContext,
	EcoPagesAppConfig,
	IHmrManager,
	IClientBridge,
} from '../../../config/internal-types.ts';
import { fileSystem } from '@ecopages/file-system';
import { HmrStrategyType, type HmrAction, type HmrStrategy } from '../../../hmr/hmr-strategy.ts';
import { DefaultHmrStrategy } from '../../../hmr/strategies/default-hmr-strategy.ts';
import { JsHmrStrategy } from '../../../hmr/strategies/js-hmr-strategy.ts';
import { ServerRenderedTemplateHmrStrategy } from '../../../hmr/strategies/server-rendered-template-hmr-strategy.ts';
import {
	getDevelopmentInvalidationService,
	type DevelopmentInvalidationService,
} from '../../../dev/invalidation/development-invalidation.service.ts';
import { appLogger } from '../../../global/app-logger.ts';
import type {
	ClientBridgeEvent,
	HmrFileChangeOptions,
	RegisteredScriptEntrypointChangeHandler,
	ResolvedHmrEntrypoint,
} from '../../../types/contracts.ts';
import { DevTransformEntrypointRegistry } from './dev-transform-entrypoint-registry.ts';
import { BrowserBundleService } from '../../../assets/browser-bundle.service.ts';
import { requireAppRuntime } from '../../../utils/app-runtime.ts';
import { resolveInternalWorkDir } from '../../../utils/resolve-work-dir.ts';
import { DevTransformServer } from '../../../dev/transform-server/dev-transform-server.ts';
import type { DevTransformBundleContributor } from '../../../dev/transform-server/types.ts';
import type { BuildInputDependencyIndex } from '../../../build/cache/build-input-dependency-index.ts';

type EntrypointDependencyGraph = ReturnType<DefaultHmrContext['getEntrypointDependencyGraph']>;

type HmrManagerParams = {
	appConfig: EcoPagesAppConfig;
	bridge: IClientBridge;
};

export class HmrManager implements IHmrManager {
	public readonly appConfig: EcoPagesAppConfig;
	protected readonly bridge: IClientBridge;
	protected runtimeWorkDir: string;
	protected enabled = false;
	protected strategies: HmrStrategy[] = [];
	/**
	 * @remarks
	 * Kept out of `strategies` because it matches every path: it reloads the page when no other strategy claims
	 * the change.
	 */
	private readonly fallbackStrategy = new DefaultHmrStrategy();
	private readonly scriptEntrypointChangeHandlers: RegisteredScriptEntrypointChangeHandler[] = [];
	private readonly registeredScriptReloadRequired = new Set<string>();
	/**
	 * Error messages of changed files whose strategy or script-change handler threw, by file path.
	 *
	 * @remarks
	 * An entry stays until that file processes without error, because nothing records it again on a later
	 * request the way a dev-transform failure is.
	 */
	private readonly fileChangeErrors = new Map<string, string>();
	protected readonly entrypointRegistry: DevTransformEntrypointRegistry;
	protected readonly browserBundleService: BrowserBundleService;
	protected readonly invalidationService: DevelopmentInvalidationService;
	private readonly buildInputIndex: BuildInputDependencyIndex;
	private readonly entrypointDependencyGraph: EntrypointDependencyGraph = {
		getDependencyEntrypoints: (filePath) => new Set(this.buildInputIndex.resolveKeys('entrypoint', filePath)),
	};
	private readonly hmrRuntime: DevClientRuntime;
	private readonly devToolbarRuntime: DevClientRuntime;
	private readonly runtimeBuilds = new Map<DevClientRuntime, Promise<boolean>>();
	private readonly readyRuntimes = new Set<DevClientRuntime>();
	protected readonly devTransformServer: DevTransformServer;

	constructor({ appConfig, bridge }: HmrManagerParams) {
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
		this.invalidationService = getDevelopmentInvalidationService(appConfig);
		const runtime = requireAppRuntime(appConfig);
		runtime.hmr = this;
		this.buildInputIndex = runtime.buildInputIndex;
		this.devTransformServer = new DevTransformServer({
			appConfig: this.appConfig,
			onModuleDependencies: (modulePath, dependencies) => {
				const entrypointPath = path.resolve(modulePath);
				this.buildInputIndex.register({ consumer: 'entrypoint', key: entrypointPath }, [
					entrypointPath,
					...dependencies,
				]);
			},
			onTransformError: (message) => this.broadcast({ type: 'error', message }),
		});
		this.ensureRuntimeWorkDir();
		this.initializeStrategies();
	}

	/**
	 * Reacts to a failed HMR runtime bundle.
	 *
	 * @remarks
	 * Only the HMR runtime reports here. A Dev Toolbar bundle failure is logged by the manager and
	 * leaves HMR running, because the toolbar is an optional client the page does not need to update.
	 */
	protected onRuntimeBundleFailure(error: unknown): void {
		this.enabled = false;
		appLogger.error('[HMR] Failed to build runtime script; continuing with HMR disabled.', error);
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
			consumeRegisteredScriptReloadRequired: (sourcePath: string) =>
				this.consumeRegisteredScriptReloadRequired(sourcePath),
		};

		this.strategies = [
			new JsHmrStrategy(jsContext),
			new ServerRenderedTemplateHmrStrategy(this.invalidationService),
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

	public async handleFileChanges(filePaths: string[], options: HmrFileChangeOptions = {}): Promise<void> {
		if (filePaths.length === 0) {
			return;
		}

		this.devTransformServer.clearFailures();
		const events: ClientBridgeEvent[] = [];
		const uniqueFilePaths = [...new Set(filePaths.map((candidate) => path.resolve(candidate)))];

		for (const filePath of uniqueFilePaths) {
			try {
				events.push(...(await this.processFileChange(filePath)));
				this.fileChangeErrors.delete(filePath);
			} catch (error) {
				appLogger.error(error instanceof Error ? error : new Error(String(error)));
				const message = error instanceof Error ? error.message : String(error);
				this.fileChangeErrors.set(filePath, message);
				events.push({ type: 'error', message });
			}
		}

		this.broadcastBatchEvents(events, options, uniqueFilePaths);
	}

	private async processFileChange(filePath: string): Promise<ClientBridgeEvent[]> {
		const resolvedFilePath = path.resolve(filePath);
		const isRegisteredDevTransformEdit = isRegisteredDevTransformEntrypoint(
			this.entrypointRegistry.getRegisteredEntrypoints(),
			resolvedFilePath,
		);

		if (!isRegisteredDevTransformEdit) {
			this.invalidateDevTransformDependents(resolvedFilePath);
		}

		if (!fileSystem.exists(filePath)) {
			appLogger.debug(`[HMR] Skipping missing file change: ${filePath}`);
			this.clearFailedEntrypointRegistration(filePath);
			return [];
		}

		if (isRegisteredDevTransformEdit) {
			await this.runRegisteredEntrypointChangeHandlers(resolvedFilePath);
			this.devTransformServer.invalidateSource(resolvedFilePath);
		}

		const strategy = this.selectChangeStrategy(filePath);
		appLogger.debug(`[${this.constructor.name}] Selected strategy: ${strategy.constructor.name}`);
		return buildStrategyEvents(await strategy.process(filePath), !isRegisteredDevTransformEdit);
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
		options: HmrFileChangeOptions,
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
		for (const entrypointPath of this.entrypointDependencyGraph.getDependencyEntrypoints(changedFilePath)) {
			this.devTransformServer.invalidateSource(entrypointPath);
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

	private selectChangeStrategy(filePath: string): HmrStrategy {
		const strategy = this.getStrategiesByPriority().find((candidate) => {
			try {
				return candidate.matches(filePath);
			} catch (error) {
				appLogger.error(error);
				return false;
			}
		});
		return strategy ?? this.fallbackStrategy;
	}

	/**
	 * @remarks
	 * The Project Watcher batch already marked the server modules of this file dirty through
	 * `applyDevFileChanges`, so the manager neither invalidates them again nor imports them ahead of the
	 * next request that needs them.
	 */
	private async runRegisteredEntrypointChangeHandlers(filePath: string): Promise<void> {
		for (const handler of this.scriptEntrypointChangeHandlers) {
			if ((await handler(filePath)) === true) {
				this.registeredScriptReloadRequired.add(path.resolve(filePath));
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
	 * Sends a browser that just connected the build errors of modules that still fail to transpile, and of
	 * changed files whose last processing failed.
	 *
	 * @remarks
	 * A build error is broadcast while the failing module is served, which can happen before the page's HMR
	 * socket connects. A change error can share its batch with a `reload`, which drops the error shown before
	 * it. Without this replay that browser would never show the error.
	 */
	public sendPendingBuildErrors(client: { send(payload: string): void }): void {
		for (const message of [...this.devTransformServer.getFailureMessages(), ...this.fileChangeErrors.values()]) {
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
				await requireAppRuntime(this.appConfig).moduleLoader.importModule<T>({
					filePath,
					outdir: getServerModuleBuildCacheOutdir(this.appConfig),
					externalPackages: true,
				}),
		};
	}

	public stop() {
		this.enabled = false;
		this.readyRuntimes.clear();
		this.scriptEntrypointChangeHandlers.length = 0;
		this.registeredScriptReloadRequired.clear();
		this.fileChangeErrors.clear();
		this.entrypointRegistry.clearAll();
		this.devTransformServer.reset();
		this.buildInputIndex.clearConsumer('entrypoint');
		if (this.appConfig.appRuntime?.hmr === this) {
			this.appConfig.appRuntime.hmr = null;
		}
	}

	protected clearFailedEntrypointRegistration(entrypointPath: string): void {
		this.entrypointRegistry.clearRegistration(entrypointPath);
		this.buildInputIndex.unregister({ consumer: 'entrypoint', key: path.resolve(entrypointPath) });
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

function buildStrategyEvents(action: HmrAction, fallbackReload: boolean): ClientBridgeEvent[] {
	if (action.type === 'broadcast' && action.events) {
		return action.events;
	}
	return fallbackReload ? [{ type: 'reload' }] : [];
}

/**
 * @remarks
 * A `reload` makes every other update redundant. Otherwise each distinct update is kept, so edits that touch several
 * islands hot-update each of them, and several layout updates collapse into one soft refresh.
 *
 * Errors are placed after the updates. The client clears a shown build error whenever a non-error message arrives,
 * so an error that precedes an update in the same batch would be wiped out by it.
 */
function coalesceBatchEvents(events: ClientBridgeEvent[]): ClientBridgeEvent[] {
	const errors = deduplicateEvents(events.filter((event) => event.type === 'error'));
	const updates = deduplicateEvents(events.filter((event) => event.type !== 'error'));
	if (updates.length <= 1) {
		return [...updates, ...errors];
	}

	if (updates.some((event) => event.type === 'reload')) {
		return [{ type: 'reload' }, ...errors];
	}

	const layoutUpdates = updates.filter((event) => event.type === 'layout-update');
	const others = updates.filter((event) => event.type !== 'layout-update');
	if (layoutUpdates.length <= 1) {
		return [...others, ...layoutUpdates, ...errors];
	}

	return [
		...others,
		{
			type: 'layout-update',
			timestamp: Math.max(...layoutUpdates.map((event) => event.timestamp ?? 0)),
		},
		...errors,
	];
}

function deduplicateEvents(events: ClientBridgeEvent[]): ClientBridgeEvent[] {
	const uniqueEvents = new Map<string, ClientBridgeEvent>();
	for (const event of events) {
		const key = JSON.stringify([event.type, event.path, event.message]);
		const existing = uniqueEvents.get(key);
		if (existing) {
			uniqueEvents.set(key, {
				...existing,
				...(existing.timestamp !== undefined || event.timestamp !== undefined
					? { timestamp: Math.max(existing.timestamp ?? 0, event.timestamp ?? 0) }
					: {}),
			});
			continue;
		}
		uniqueEvents.set(key, event);
	}
	return [...uniqueEvents.values()];
}
