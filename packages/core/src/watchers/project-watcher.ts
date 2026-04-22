import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig, IHmrManager, IClientBridge } from '../types/internal-types.ts';
import type { ProcessorWatchConfig, ProcessorWatchContext } from '../plugins/processor.ts';
import { DevelopmentInvalidationService } from '../services/invalidation/development-invalidation.service.ts';

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
	private readonly invalidationService: DevelopmentInvalidationService;
	private watcher: FSWatcher | null = null;
	private lastHandledChange = new Map<string, number>();
	private changeQueue: Promise<void> = Promise.resolve();

	constructor({ config, refreshRouterRoutesCallback, hmrManager, bridge }: ProjectWatcherConfig) {
		this.appConfig = config;
		this.refreshRouterRoutesCallback = refreshRouterRoutesCallback;
		this.hmrManager = hmrManager;
		this.bridge = bridge;
		this.invalidationService = new DevelopmentInvalidationService(config);
		this.triggerRouterRefresh = this.triggerRouterRefresh.bind(this);
		this.handleError = this.handleError.bind(this);
		this.handleFileChange = this.handleFileChange.bind(this);
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

			this.bridge.reload();
		} catch (error) {
			appLogger.error(`Failed to copy public file: ${error instanceof Error ? error.message : String(error)}`);
			this.bridge.reload();
		}
	}

	/**
	 * Serializes file change handling so that concurrent chokidar events are
	 * processed one at a time, preventing overlapping builds and race conditions.
	 */
	private enqueueChange(task: () => Promise<void>): void {
		const queuedTask = this.changeQueue.then(task, task);
		this.changeQueue = queuedTask.catch(() => undefined);
	}

	/**
	 * Handles file changes by uncaching modules, refreshing routes, and delegating appropriately.
	 * Follows 5-rule priority:
	 * 0. Public directory match? -> copy file and reload
	 * 1. additionalWatchPaths match? -> reload
	 * 2. Include template source? -> reload after processor notifications
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
	private async handleFileChange(rawPath: string, event: 'change' | 'add' | 'unlink' = 'change'): Promise<void> {
		const filePath = path.resolve(rawPath);
		const now = Date.now();
		const lastHandledAt = this.lastHandledChange.get(filePath);
		if (lastHandledAt !== undefined && now - lastHandledAt < ProjectWatcher.duplicateChangeWindowMs) {
			return;
		}
		this.lastHandledChange.set(filePath, now);

		try {
			const plan = this.invalidationService.planFileChange(filePath);

			if (plan.category === 'public-asset') {
				await this.handlePublicDirFileChange(filePath);
				return;
			}

			this.uncacheModules();
			if (plan.invalidateServerModules) {
				this.invalidationService.invalidateServerModules([filePath]);
			}

			if (plan.refreshRoutes) {
				await this.refreshRouterRoutesCallback();
			}

			if (plan.category === 'additional-watch') {
				this.bridge.reload();
				return;
			}

			await this.notifyProcessors(filePath, event);

			if (plan.category === 'include-source') {
				this.bridge.reload();
				return;
			}

			if (plan.processorHandledAsset) {
				return;
			}

			if (plan.delegateToHmr) {
				await this.hmrManager.handleFileChange(filePath);
			}
		} catch (error) {
			if (error instanceof Error) {
				this.bridge.error(error.message);
				this.handleError(error);
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
	 * Checks if a file is handled by a processor.
	 * Processors that declare asset capabilities own those file types.
	 * Processors without capabilities fall back to checking watch extensions.
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

		const processorPaths: string[] = [];
		for (const processor of this.appConfig.processors.values()) {
			const watchConfig = processor.getWatchConfig();
			if (!watchConfig) continue;
			processorPaths.push(...watchConfig.paths);
		}

		if (fileSystem.exists(this.appConfig.absolutePaths.includesDir)) {
			processorPaths.push(this.appConfig.absolutePaths.includesDir);
		}

		if (fileSystem.exists(this.appConfig.absolutePaths.srcDir)) {
			processorPaths.push(this.appConfig.absolutePaths.srcDir);
		}

		if (fileSystem.exists(this.appConfig.absolutePaths.pagesDir)) {
			processorPaths.push(this.appConfig.absolutePaths.pagesDir);
		}

		if (fileSystem.exists(this.appConfig.absolutePaths.publicDir)) {
			processorPaths.push(this.appConfig.absolutePaths.publicDir);
		}

		if (this.appConfig.additionalWatchPaths.length) {
			processorPaths.push(...this.appConfig.additionalWatchPaths);
		}

		this.watcher = chokidar.watch(processorPaths, {
			ignoreInitial: true,
			ignorePermissionErrors: true,
			awaitWriteFinish: {
				stabilityThreshold: 50,
				pollInterval: 50,
			},
		});

		this.watcher
			.on('change', (p) => this.enqueueChange(() => this.handleFileChange(p, 'change')))
			.on('add', (p) => this.enqueueChange(() => this.handleFileChange(p, 'add')))
			.on('addDir', (p) => this.enqueueChange(() => this.triggerRouterRefresh(p)))
			.on('unlink', (p) => this.enqueueChange(() => this.handleFileChange(p, 'unlink')))
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
}
