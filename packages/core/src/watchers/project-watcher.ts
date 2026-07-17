import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig, IHmrManager, IClientBridge } from '../types/internal-types.ts';
import type { ProcessorWatchConfig, ProcessorWatchContext } from '../plugins/processor.ts';
import {
	DevelopmentInvalidationService,
	type DevelopmentInvalidationPlan,
} from '../services/invalidation/development-invalidation.service.ts';
import { prepareHmrFileChange } from '../hmr/hmr-file-change-prep.ts';
import { getAppPageBrowserGraphSession } from '../route-renderer/orchestration/page-browser-graph/page-browser-graph-session.ts';
import { isRegisteredScriptEntrypoint } from '../hmr/hmr-entrypoint-output.ts';
import { resolveInternalExecutionDir } from '../utils/resolve-work-dir.ts';
import { createProjectWatcherIgnorePredicate } from './project-watcher-ignore.ts';

/**
 * Configuration options for the ProjectWatcher
 * @interface ProjectWatcherConfig
 * @property {EcoPagesAppConfig} config - The application configuration
 * @property {() => Promise<void>} refreshRouterRoutesCallback - Callback to refresh router routes
 * @property {IHmrManager} hmrManager - The HMR manager instance
 * @property {ClientBridge} bridge - The client bridge instance
 */
export interface ProjectWatcherConfig {
	config: EcoPagesAppConfig;
	refreshRouterRoutesCallback: () => Promise<void>;
	hmrManager: IHmrManager;
	bridge: IClientBridge;
	/** When true, the host dev server owns browser dev-client bootstrap. */
	hostOwnsDevClient?: boolean;
	/** Delay before a change event is processed; 0 disables debouncing. */
	changeDebounceMs?: number;
}

/**
 * ProjectWatcher handles file system changes for hot module replacement (HMR).
 * It uses chokidar to watch for file changes and triggers appropriate actions:
 * - Uncaches modules when files change
 * - Refreshes router routes for page files
 * - Triggers HMR server reload
 * - Handles processor-specific file changes
 *
 * The watcher uses chokidar's built-in debouncing through `awaitWriteFinish`
 * to handle rapid file changes efficiently:
 * - stabilityThreshold: 50ms - Time to wait for writes to stabilize
 * - pollInterval: 50ms - Interval to poll for file changes
 *
 * @class ProjectWatcher
 */
export class ProjectWatcher {
	/**
	 * Duplicate identical watcher events within this window are ignored.
	 *
	 * Some editors or save pipelines emit two near-identical filesystem change
	 * notifications for the same file. Ecopages should treat those as one logical
	 * update so HMR and route refresh work are not repeated unnecessarily.
	 */
	private static readonly duplicateChangeWindowMs = 150;
	private appConfig: EcoPagesAppConfig;
	private refreshRouterRoutesCallback: () => Promise<void>;
	private hmrManager: IHmrManager;
	private bridge: IClientBridge;
	private readonly hostOwnsDevClient: boolean;
	private readonly invalidationService: DevelopmentInvalidationService;
	private readonly changeDebounceMs: number;
	private watcher: FSWatcher | null = null;
	private closed = false;
	private pendingChangeEvents = new Map<
		string,
		{ event: 'change' | 'add' | 'unlink'; timer: ReturnType<typeof setTimeout> }
	>();
	private changeQueue: Promise<void> = Promise.resolve();

	constructor({
		config,
		refreshRouterRoutesCallback,
		hmrManager,
		bridge,
		hostOwnsDevClient,
		changeDebounceMs,
	}: ProjectWatcherConfig) {
		this.appConfig = config;
		this.refreshRouterRoutesCallback = refreshRouterRoutesCallback;
		this.hmrManager = hmrManager;
		this.bridge = bridge;
		this.hostOwnsDevClient = hostOwnsDevClient === true;
		const envDebounceMs = process.env.ECOPAGES_WATCH_CHANGE_DEBOUNCE_MS;
		this.changeDebounceMs =
			changeDebounceMs ??
			(envDebounceMs !== undefined && envDebounceMs !== '' ? Number(envDebounceMs) : undefined) ??
			ProjectWatcher.duplicateChangeWindowMs;
		this.invalidationService = new DevelopmentInvalidationService(config);
		this.triggerRouterRefresh = this.triggerRouterRefresh.bind(this);
		this.handleError = this.handleError.bind(this);
		this.handleFileChange = this.handleFileChange.bind(this);
		this.processFileChange = this.processFileChange.bind(this);
	}

	/**
	 * Uncaches modules in the source directory to ensure fresh imports.
	 * This is necessary for hot module replacement to work correctly.
	 * @private
	 */
	private uncacheModules(): void {
		if (typeof require === 'undefined') return;

		const { srcDir, rootDir } = this.appConfig;
		const regex = new RegExp(`${rootDir}/${srcDir}/.*`);

		for (const key in require.cache) {
			if (regex.test(key)) {
				delete require.cache[key];
			}
		}
	}

	private isRouteSourceFile(filePath: string): boolean {
		return this.invalidationService.isRouteSourceFile(filePath);
	}

	private isIncludeSourceFile(filePath: string): boolean {
		return this.invalidationService.isIncludeSourceFile(filePath);
	}

	private requestBrowserReload(): void {
		if (this.hostOwnsDevClient) {
			return;
		}

		this.bridge.reload();
	}

	/**
	 * Handles public directory file changes by copying only the changed file.
	 * @param filePath - Absolute path of the changed file
	 */
	private async handlePublicDirFileChange(filePath: string): Promise<void> {
		try {
			const relativePath = path.relative(this.appConfig.absolutePaths.publicDir, filePath);
			const destPath = path.join(this.appConfig.absolutePaths.distDir, relativePath);

			if (fileSystem.exists(filePath)) {
				const destDir = path.dirname(destPath);
				fileSystem.ensureDir(destDir);
				await fileSystem.copyFileAsync(filePath, destPath);
			}

			this.requestBrowserReload();
		} catch (error) {
			appLogger.error(`Failed to copy public file: ${error instanceof Error ? error.message : String(error)}`);
			this.requestBrowserReload();
		}
	}

	/**
	 * Serializes file change handling so that concurrent chokidar events are
	 * processed one at a time, preventing overlapping builds and race conditions.
	 */
	private enqueueChange(task: () => Promise<void>): Promise<void> {
		const queuedTask = this.changeQueue.then(task, task);
		this.changeQueue = queuedTask.catch(() => undefined);
		return queuedTask;
	}

	/**
	 * Handles file changes by uncaching modules, refreshing routes, and delegating appropriately.
	 * Follows 5-rule priority:
	 * 0. Public directory match? -> copy file and reload
	 * 1. additionalWatchPaths match? -> reload
	 * 2. Include template source? -> current-page refresh via HMR after processor notifications are deferred
	 * 3. Processor-owned asset? -> processor already handled it via notification, skip HMR
	 * 4. Otherwise -> HMR strategies
	 *
	 * Processors that watch a file extension as a dependency (e.g. PostCSS watching
	 * .tsx for Tailwind class scanning) are always notified first, but do not
	 * prevent the file from flowing through the normal HMR strategy pipeline.
	 *
	 * Duplicate identical watcher events for the same file are coalesced within a
	 * short window before any of the priority rules run.
	 * @param rawPath - Path of the changed file
	 * @param event - The type of file system event
	 */
	private handleFileChange(rawPath: string, event: 'change' | 'add' | 'unlink' = 'change'): Promise<void> {
		if (this.closed) {
			return Promise.resolve();
		}

		const filePath = path.resolve(rawPath);

		if (this.changeDebounceMs === 0) {
			return this.enqueueChange(() => this.processFileChange(filePath, event));
		}

		const existing = this.pendingChangeEvents.get(filePath);
		if (existing) {
			clearTimeout(existing.timer);
		}

		const timer = setTimeout(() => {
			this.pendingChangeEvents.delete(filePath);
			void this.enqueueChange(() => this.processFileChange(filePath, event));
		}, this.changeDebounceMs);

		this.pendingChangeEvents.set(filePath, { event, timer });
		return Promise.resolve();
	}

	private async processFileChange(filePath: string, event: 'change' | 'add' | 'unlink'): Promise<void> {
		try {
			const plan = this.invalidationService.planFileChange(filePath);

			if (plan.category === 'public-asset') {
				await this.handlePublicDirFileChange(filePath);
				return;
			}

			this.uncacheModules();
			const resolvedFilePath = path.resolve(filePath);
			const graphPreparation = this.hmrManager.isEnabled()
				? prepareHmrFileChange(this.appConfig, resolvedFilePath)
				: undefined;

			if (plan.refreshRoutes && (event === 'unlink' || event === 'add')) {
				getAppPageBrowserGraphSession(this.appConfig).invalidateByRouteFile(resolvedFilePath);
			}
			const isRegisteredScriptEdit = isRegisteredScriptEntrypoint(
				this.hmrManager.getWatchedFiles(),
				resolvedFilePath,
			);

			if (plan.invalidateServerModules && !isRegisteredScriptEdit) {
				this.invalidationService.invalidateServerModules([filePath]);
			}

			if (plan.refreshRoutes) {
				await this.refreshRouterRoutesCallback();
			}

			if (plan.reloadBrowser) {
				this.requestBrowserReload();
				return;
			}

			const deferProcessorNotifications =
				plan.category === 'include-source' ||
				plan.category === 'explicit-server-view' ||
				isRegisteredScriptEdit;

			if (deferProcessorNotifications && plan.delegateToHmr) {
				await this.prewarmBeforeHmr(resolvedFilePath, plan);
				await this.hmrManager.handleFileChange(filePath, {
					graphIdentities: graphPreparation?.affectedGraphIdentities,
				});
				await this.notifyProcessors(filePath, event);
				return;
			}

			await this.notifyProcessors(filePath, event);

			if (plan.processorHandledAsset) {
				return;
			}

			if (plan.delegateToHmr) {
				await this.hmrManager.handleFileChange(filePath, {
					graphIdentities: graphPreparation?.affectedGraphIdentities,
				});
			}
		} catch (error) {
			if (error instanceof Error) {
				this.bridge.error(error.message);
				this.handleError(error);
			}
		}
	}

	/**
	 * Re-imports server modules before HMR broadcast so reload/refetch does not
	 * race stale in-memory imports or custom-element registry state.
	 */
	private async prewarmBeforeHmr(filePath: string, plan: DevelopmentInvalidationPlan): Promise<void> {
		if (plan.category !== 'include-source' && plan.category !== 'explicit-server-view') {
			return;
		}

		const modulePaths =
			plan.category === 'include-source'
				? [this.appConfig.absolutePaths.htmlTemplatePath]
				: [path.resolve(filePath)];

		await this.prewarmServerModuleImports(modulePaths, { scope: 'server template' });
	}

	private async prewarmServerModuleImports(
		modulePaths: readonly string[],
		options: { bypassCache?: boolean; scope: string },
	): Promise<void> {
		const appModuleLoader = this.appConfig.runtime?.appModuleLoader;
		if (!appModuleLoader) {
			return;
		}

		const outdir = path.join(resolveInternalExecutionDir(this.appConfig), '.server-modules');

		for (const modulePath of modulePaths) {
			if (!modulePath) {
				continue;
			}

			try {
				await appModuleLoader.importModule({
					filePath: modulePath,
					rootDir: this.appConfig.rootDir,
					outdir,
					externalPackages: true,
					bypassCache: options.bypassCache,
				});
			} catch (error) {
				appLogger.error(
					`Failed to prewarm ${options.scope} ${modulePath}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	}

	/**
	 * Notifies all processors whose watch config matches the given file extension.
	 * This is called before checking processor ownership so that dependency-only
	 * processors (e.g. PostCSS watching .tsx for class scanning) receive their
	 * notifications regardless of whether they own the file.
	 */
	private async notifyProcessors(filePath: string, event: 'change' | 'add' | 'unlink'): Promise<void> {
		const ctx: ProcessorWatchContext = { path: filePath, bridge: this.bridge };

		for (const processor of this.appConfig.processors.values()) {
			const watchConfig = processor.getWatchConfig();
			if (!watchConfig) continue;

			const { extensions = [] } = watchConfig;
			if (extensions.length && !extensions.some((ext) => filePath.endsWith(ext))) {
				continue;
			}

			const handler = this.getProcessorHandler(watchConfig, event);
			if (handler) {
				await handler(ctx);
			}
		}
	}

	private getProcessorHandler(
		watchConfig: ProcessorWatchConfig,
		event: 'change' | 'add' | 'unlink',
	): ((ctx: ProcessorWatchContext) => Promise<void>) | undefined {
		switch (event) {
			case 'change':
				return watchConfig.onChange;
			case 'add':
				return watchConfig.onCreate;
			case 'unlink':
				return watchConfig.onDelete;
		}
	}

	/**
	 * Checks if a file is in the public directory.
	 */
	private isPublicDirFile(filePath: string): boolean {
		return this.invalidationService.isPublicDirFile(filePath);
	}

	/**
	 * Checks if file path matches any additionalWatchPaths patterns.
	 */
	private matchesAdditionalWatchPaths(filePath: string): boolean {
		return this.invalidationService.matchesAdditionalWatchPaths(filePath);
	}

	/**
	 * Checks if a file is owned by a processor as an asset input.
	 * Ownership requires declared asset capabilities; watch config only drives
	 * {@link notifyProcessors} notifications.
	 */
	private isHandledByProcessor(filePath: string): boolean {
		return this.invalidationService.isProcessorOwnedAsset(filePath);
	}

	/**
	 * Triggers router refresh for page directory changes.
	 * This ensures the router is updated when pages are added or removed.
	 *
	 * @param {string} path - Path of the changed directory
	 */
	async triggerRouterRefresh(changedPath: string): Promise<void> {
		const resolvedPath = path.resolve(changedPath);
		const isPageDir =
			resolvedPath.startsWith(this.appConfig.absolutePaths.pagesDir) && path.extname(resolvedPath) === '';

		if (isPageDir || this.isRouteSourceFile(resolvedPath)) {
			await this.refreshRouterRoutesCallback();
		}
	}

	/**
	 * Handles and logs errors that occur during file watching.
	 *
	 * @param {unknown} error - The error to handle
	 */
	handleError(error: unknown) {
		if (error instanceof Error) {
			this.hmrManager.broadcast({ type: 'error', message: error.message });
		}
		appLogger.error(`Watcher error: ${error}`);
	}

	/**
	 * Creates and configures the file system watcher.
	 * This sets up:
	 * 1. Page file watching
	 * 2. Directory watching
	 * 3. Error handling
	 *
	 * Processor notifications are dispatched inside handleFileChange, ensuring
	 * a single unified event pipeline with no parallel chokidar bindings.
	 *
	 * Uses chokidar's built-in debouncing through `awaitWriteFinish` to handle
	 * rapid file changes efficiently.
	 */
	public async createWatcherSubscription() {
		if (this.watcher) {
			return this.watcher;
		}

		const processorPaths = new Set<string>();
		for (const processor of this.appConfig.processors.values()) {
			const watchConfig = processor.getWatchConfig();
			if (!watchConfig) continue;
			for (const watchPath of watchConfig.paths) {
				processorPaths.add(watchPath);
			}
		}

		if (fileSystem.exists(this.appConfig.absolutePaths.includesDir)) {
			processorPaths.add(this.appConfig.absolutePaths.includesDir);
		}

		if (fileSystem.exists(this.appConfig.absolutePaths.srcDir)) {
			processorPaths.add(this.appConfig.absolutePaths.srcDir);
		}

		if (fileSystem.exists(this.appConfig.absolutePaths.publicDir)) {
			processorPaths.add(this.appConfig.absolutePaths.publicDir);
		}

		for (const watchPath of this.appConfig.additionalWatchPaths) {
			processorPaths.add(watchPath);
		}

		const ignored = createProjectWatcherIgnorePredicate(this.appConfig.absolutePaths);

		this.watcher = chokidar.watch(Array.from(processorPaths), {
			ignoreInitial: true,
			ignorePermissionErrors: true,
			ignored,
			awaitWriteFinish: {
				stabilityThreshold: 50,
				pollInterval: 50,
			},
		});

		this.watcher
			.on('change', (p) => this.handleFileChange(p, 'change'))
			.on('add', (p) => this.handleFileChange(p, 'add'))
			.on('addDir', (p) => this.enqueueChange(() => this.triggerRouterRefresh(p)))
			.on('unlink', (p) => this.handleFileChange(p, 'unlink'))
			.on('unlinkDir', (p) => this.enqueueChange(() => this.triggerRouterRefresh(p)))
			.on('error', (error) => this.handleError(error));

		for (const processor of this.appConfig.processors.values()) {
			const watchConfig = processor.getWatchConfig();
			if (watchConfig?.onError) {
				this.watcher.on('error', watchConfig.onError as (error: unknown) => void);
			}
		}

		return this.watcher;
	}

	/**
	 * Closes the active filesystem watcher subscription.
	 *
	 * @remarks
	 * Safe to call multiple times. Used when tearing down dev servers in tests
	 * and other short-lived Ecopages runtimes.
	 */
	public async close(): Promise<void> {
		this.closed = true;

		for (const pending of this.pendingChangeEvents.values()) {
			clearTimeout(pending.timer);
		}
		this.pendingChangeEvents.clear();

		if (this.watcher) {
			await this.watcher.close();
			this.watcher = null;
		}

		await this.changeQueue.catch(() => undefined);
	}
}
