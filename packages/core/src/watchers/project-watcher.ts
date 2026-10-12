import type { Stats } from 'node:fs';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../global/app-logger.ts';
import { isPathInside } from '../utils/path-containment.ts';
import type { EcoPagesAppConfig, IHmrManager, IClientBridge } from '../types/internal-types.ts';
import type { ProcessorWatchChanges } from '../plugins/processor.ts';
import {
	DevelopmentInvalidationService,
	type AppliedDevFileChange,
	type AppliedDevFileChanges,
	type DevFileChangeKind,
	type DevFileChanges,
} from '../services/invalidation/development-invalidation.service.ts';
import { isRegisteredDevTransformEntrypoint } from '../hmr/hmr-entrypoint-output.ts';
import { prepareHmrFileChange } from '../hmr/hmr-file-change-prep.ts';
import { createProjectWatcherIgnorePredicate } from './project-watcher-ignore.ts';
import { resolveRuntimeRestartWatchPaths } from '../dev/development-restart-watch-paths.ts';
import {
	type AdditionalWatchPath,
	matchesAdditionalWatchPath,
	mayContainAdditionalWatchMatches,
	resolveAdditionalWatchPath,
} from '../utils/additional-watch-paths.ts';
import { RESOLVED_ASSETS_VENDORS_DIR } from '../config/constants.ts';
import { resolveWorkspacePackageWatchRoots, isWorkspacePackageFile } from './workspace-package-watch-roots.ts';
import { getAppBuildInputIndex } from '../build/cache/build-input-dependency-index.ts';

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
	/** Trailing delay before a change batch is scheduled; defaults to 150 ms, and 0 disables debouncing. */
	changeDebounceMs?: number;
	/** Applies config, dotenv, or linked package changes through the owning runtime lifecycle. */
	onRestartRequest?: (filePath: string) => Promise<void>;
	/** Whether an entry watcher already owns changes to the config module. */
	entryWatcherOwnsConfig?: boolean;
}

/**
 * ProjectWatcher subscribes to project files and applies each non-restart
 * debounce batch through one `applyDevFileChanges` call. Dirty results rebuild
 * on the next request. For those batches, it notifies matching Processors once
 * and runs browser update handling once.
 *
 * @remarks
 * The maximum-wait timer schedules a batch no later than one second after its
 * first event. Processing remains serialized behind earlier work, and closing
 * the watcher drops scheduled batches that have not started.
 */
export class ProjectWatcher {
	/**
	 * Watcher events that arrive during this window are applied as one batch.
	 */
	private static readonly duplicateChangeWindowMs = 150;
	private static readonly maximumChangeWaitMs = 1_000;
	private static readonly watcherReadyTimeoutMs = 30_000;
	private appConfig: EcoPagesAppConfig;
	private refreshRouterRoutesCallback: () => Promise<void>;
	private hmrManager: IHmrManager;
	private bridge: IClientBridge;
	private readonly invalidationService: DevelopmentInvalidationService;
	private readonly changeDebounceMs: number;
	private readonly onRestartRequest?: (filePath: string) => Promise<void>;
	private readonly entryWatcherOwnsConfig: boolean;
	private restartRequestScheduled = false;
	private restartNeedsVendorInvalidation = false;
	private workspacePackageRoots: string[] = [];
	private watcher: FSWatcher | null = null;
	private watcherReady?: Promise<void>;
	private watcherReadyTimeout: ReturnType<typeof setTimeout> | undefined;
	private rejectWatcherReady: ((error: Error) => void) | undefined;
	private unsubscribeFromRecordedWatchPaths?: () => void;
	private closed = false;
	private pendingDevFileKinds = new Map<string, DevFileChangeKind>();
	private pendingFlushTimer: ReturnType<typeof setTimeout> | undefined;
	private pendingMaxFlushTimer: ReturnType<typeof setTimeout> | undefined;
	private pendingFlushResolvers: Array<() => void> = [];
	private changeQueue: Promise<void> = Promise.resolve();
	private closePromise: Promise<void> | undefined;

	constructor({
		config,
		refreshRouterRoutesCallback,
		hmrManager,
		bridge,
		changeDebounceMs,
		onRestartRequest,
		entryWatcherOwnsConfig,
	}: ProjectWatcherConfig) {
		this.appConfig = config;
		this.refreshRouterRoutesCallback = refreshRouterRoutesCallback;
		this.hmrManager = hmrManager;
		this.bridge = bridge;
		const envDebounceMs = process.env.ECOPAGES_WATCH_CHANGE_DEBOUNCE_MS;
		this.changeDebounceMs =
			changeDebounceMs ??
			(envDebounceMs !== undefined && envDebounceMs !== '' ? Number(envDebounceMs) : undefined) ??
			ProjectWatcher.duplicateChangeWindowMs;
		this.onRestartRequest = onRestartRequest;
		this.entryWatcherOwnsConfig = entryWatcherOwnsConfig === true;
		this.invalidationService = new DevelopmentInvalidationService(config);
		this.triggerRouterRefresh = this.triggerRouterRefresh.bind(this);
		this.handleError = this.handleError.bind(this);
		this.handleFileChange = this.handleFileChange.bind(this);
	}

	private isRouteSourceFile(filePath: string): boolean {
		return this.invalidationService.isRouteSourceFile(filePath);
	}

	private requestBrowserReload(): void {
		this.bridge.reload();
	}

	private async copyPublicDirFile(filePath: string): Promise<void> {
		try {
			const relativePath = path.relative(this.appConfig.absolutePaths.publicDir, filePath);
			const destPath = path.join(this.appConfig.absolutePaths.distDir, relativePath);

			if (fileSystem.exists(filePath)) {
				const destDir = path.dirname(destPath);
				fileSystem.ensureDir(destDir);
				await fileSystem.copyFileAsync(filePath, destPath);
			}
		} catch (error) {
			appLogger.error(`Failed to copy public file: ${formatErrorWithStack(error)}`);
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
	 * Collects watcher events for one debounce window, then applies them as a batch.
	 */
	private handleFileChange(rawPath: string, event: 'change' | 'add' | 'unlink' = 'change'): Promise<void> {
		if (this.closed) {
			return Promise.resolve();
		}

		const resolvedPath = path.resolve(rawPath);
		this.pendingDevFileKinds.set(resolvedPath, watcherEventToDevFileChangeKind(event));

		if (this.changeDebounceMs === 0) {
			return this.enqueueChange(() => this.flushPendingDevFileChanges());
		}

		if (this.pendingFlushTimer !== undefined) {
			clearTimeout(this.pendingFlushTimer);
		}
		if (this.pendingMaxFlushTimer === undefined) {
			this.pendingMaxFlushTimer = setTimeout(
				() => this.flushScheduledDevFileChanges(),
				ProjectWatcher.maximumChangeWaitMs,
			);
		}

		const flushPromise = new Promise<void>((resolve) => {
			this.pendingFlushResolvers.push(resolve);
		});

		this.pendingFlushTimer = setTimeout(() => this.flushScheduledDevFileChanges(), this.changeDebounceMs);

		return flushPromise;
	}

	private flushScheduledDevFileChanges(): void {
		this.clearPendingFlushTimers();
		const changes = takePendingDevFileChanges(this.pendingDevFileKinds);
		const resolvers = this.pendingFlushResolvers.splice(0);
		void this.enqueueChange(async () => {
			if (this.closed) return;
			await this.processDevFileChanges(changes);
		}).finally(() => {
			for (const resolve of resolvers) {
				resolve();
			}
		});
	}

	private clearPendingFlushTimers(): void {
		if (this.pendingFlushTimer !== undefined) {
			clearTimeout(this.pendingFlushTimer);
			this.pendingFlushTimer = undefined;
		}

		if (this.pendingMaxFlushTimer !== undefined) {
			clearTimeout(this.pendingMaxFlushTimer);
			this.pendingMaxFlushTimer = undefined;
		}
	}

	private clearWatcherReadyTimeout(): void {
		if (this.watcherReadyTimeout !== undefined) {
			clearTimeout(this.watcherReadyTimeout);
			this.watcherReadyTimeout = undefined;
		}
	}

	private async waitForWatcherReady(): Promise<FSWatcher> {
		try {
			await this.watcherReady;
		} catch (error) {
			try {
				await this.close();
			} catch (closeError) {
				appLogger.error(
					`Failed to close filesystem watcher after startup failed: ${formatErrorWithStack(closeError)}`,
				);
			}
			throw error;
		}

		if (!this.watcher) {
			throw new Error('Filesystem watcher closed before becoming ready');
		}
		return this.watcher;
	}

	private async flushPendingDevFileChanges(): Promise<void> {
		if (this.pendingDevFileKinds.size === 0) {
			return;
		}

		const changes = takePendingDevFileChanges(this.pendingDevFileKinds);
		await this.processDevFileChanges(changes);
	}

	/**
	 * @remarks
	 * Linked dependencies can be bundled inside an unchanged package whose vendor
	 * fingerprint does not include them. Discard generated vendors before the
	 * host restarts so the next process cannot reuse those stale bundles.
	 */
	private handleRuntimeRestart(filePath: string): void {
		const onRestartRequest = this.onRestartRequest;
		if (!onRestartRequest) {
			appLogger.warn(
				isWorkspacePackageFile(filePath, this.workspacePackageRoots)
					? `Linked package changed (${filePath}). Clear ${path.join(this.appConfig.absolutePaths.distDir, RESOLVED_ASSETS_VENDORS_DIR)} and restart the development server to apply it.`
					: `Development restart input changed (${filePath}). Restart the development server to apply it.`,
			);
			return;
		}

		this.restartNeedsVendorInvalidation ||= isWorkspacePackageFile(filePath, this.workspacePackageRoots);
		if (this.restartRequestScheduled) {
			return;
		}

		this.restartRequestScheduled = true;
		void this.changeQueue
			.then(() => {
				if (this.restartNeedsVendorInvalidation) {
					const vendorsDir = path.join(this.appConfig.absolutePaths.distDir, RESOLVED_ASSETS_VENDORS_DIR);
					if (fileSystem.exists(vendorsDir)) fileSystem.remove(vendorsDir);
				}
				return onRestartRequest(filePath);
			})
			.catch((error) => this.handleError(error))
			.finally(() => {
				this.restartRequestScheduled = false;
				this.restartNeedsVendorInvalidation = false;
			});
	}

	/**
	 * Applies one collected batch: mark dirty, refresh routes once, notify once.
	 */
	private async processDevFileChanges(changes: DevFileChanges): Promise<void> {
		try {
			const restartPath = this.findBatchRestartPath(changes);
			if (restartPath) {
				this.handleRuntimeRestart(restartPath);
				return;
			}

			const applied = await this.invalidationService.applyDevFileChanges(changes);
			if (applied.files.length === 0) {
				return;
			}

			await this.copyPublicAssets(applied.files);
			if (applied.refreshRoutes) {
				await this.refreshRouterRoutesCallback();
			}
			await this.notifyProcessorsForBatch(applied.files);
			await this.notifyBatchClientUpdate(applied);
		} catch (error) {
			this.handleError(error);
		}
	}

	private findBatchRestartPath(changes: DevFileChanges): string | undefined {
		for (const filePath of [...changes.changed, ...changes.created, ...changes.deleted]) {
			if (isWorkspacePackageFile(filePath, this.workspacePackageRoots)) {
				return filePath;
			}

			if (!this.invalidationService.isRuntimeRestartFile(filePath)) {
				continue;
			}

			if (this.entryWatcherOwnsConfig && this.invalidationService.isConfigModuleFile(filePath)) {
				continue;
			}

			return filePath;
		}

		return undefined;
	}

	private async copyPublicAssets(files: AppliedDevFileChange[]): Promise<void> {
		for (const file of files) {
			if (file.plan.category === 'public-asset') {
				await this.copyPublicDirFile(file.filePath);
			}
		}
	}

	private async notifyProcessorsForBatch(files: AppliedDevFileChange[]): Promise<void> {
		for (const processor of this.appConfig.processors.values()) {
			const watchConfig = processor.getWatchConfig();
			if (!watchConfig?.onChanges) continue;

			const changes: ProcessorWatchChanges = {
				created: [],
				changed: [],
				deleted: [],
				bridge: this.bridge,
			};

			for (const file of files) {
				const { filePath } = file;
				const { extensions = [] } = watchConfig;
				if (extensions.length && !extensions.some((ext) => filePath.endsWith(ext))) {
					continue;
				}

				changes[file.kind].push(filePath);
			}

			if (changes.created.length || changes.changed.length || changes.deleted.length) {
				try {
					await watchConfig.onChanges(changes);
				} catch (error) {
					appLogger.error(
						`Processor ${processor.name} failed to handle file changes`,
						error instanceof Error ? error : new Error(String(error)),
					);
				}
			}
		}
	}

	private async notifyBatchClientUpdate(applied: AppliedDevFileChanges): Promise<void> {
		const hmrCandidates = applied.files.filter(
			(file) => file.plan.delegateToHmr && !file.plan.processorHandledAsset && !file.plan.reloadBrowser,
		);
		if (hmrCandidates.length === 0) {
			if (applied.reloadBrowser) {
				this.requestBrowserReload();
			}
			return;
		}

		const registeredHmrFiles = this.collectRegisteredHmrFiles(hmrCandidates);
		const hasUnregisteredHmr = registeredHmrFiles.length !== hmrCandidates.length;

		if (registeredHmrFiles.length === 1 && !applied.reloadBrowser && !hasUnregisteredHmr) {
			await this.delegateRegisteredHmrFile(registeredHmrFiles[0]);
			return;
		}

		for (const file of registeredHmrFiles) {
			await this.delegateRegisteredHmrFile(file, false);
		}

		if (applied.reloadBrowser || hasUnregisteredHmr || registeredHmrFiles.length > 1) {
			this.requestBrowserReload();
		}
	}

	private collectRegisteredHmrFiles(files: AppliedDevFileChange[]): AppliedDevFileChange[] {
		if (typeof this.hmrManager.getRegisteredEntrypoints !== 'function') {
			return [];
		}

		const registered = this.hmrManager.getRegisteredEntrypoints();
		return files.filter((file) => isRegisteredDevTransformEntrypoint(registered, file.filePath));
	}

	private async delegateRegisteredHmrFile(file: AppliedDevFileChange, broadcast = true): Promise<void> {
		const graphPreparation = this.hmrManager.isEnabled()
			? prepareHmrFileChange(this.appConfig, file.filePath)
			: undefined;
		await this.hmrManager.handleFileChange(file.filePath, {
			broadcast,
			graphIdentities: graphPreparation?.affectedGraphIdentities,
		});
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
			isPathInside(resolvedPath, this.appConfig.absolutePaths.pagesDir) && path.extname(resolvedPath) === '';

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
		if (error instanceof Error && typeof this.hmrManager.broadcast === 'function') {
			this.hmrManager.broadcast({ type: 'error', message: error.message });
		}
		appLogger.error(`Watcher error: ${formatErrorWithStack(error)}`);
	}

	/**
	 * @remarks
	 * The subscription watches `srcDir` recursively alongside external recorded
	 * inputs, restart files, workspace roots, and additional watch paths. Processor
	 * notifications share the same file-change pipeline. `awaitWriteFinish` waits
	 * for writes to stabilize before a file event is processed.
	 *
	 * A glob in `additionalWatchPaths` is watched through its static base
	 * directory, which can be the project root for `**` patterns. Files reached
	 * only through such a base are ignored unless they match a pattern, and so
	 * are dot-directories the pattern does not name, so a broad base does not
	 * feed unrelated files into the change pipeline. Readiness rejects and closes
	 * the subscription if Chokidar does not become ready within 30 seconds.
	 */
	public async createWatcherSubscription() {
		if (this.watcher) {
			return this.waitForWatcherReady();
		}

		const buildInputIndex = getAppBuildInputIndex(this.appConfig);
		const srcDir = this.appConfig.absolutePaths.srcDir;
		const literalPaths = new Set<string>([srcDir]);
		const { pagesDir, componentsDir, includesDir, layoutsDir, publicDir } = this.appConfig.absolutePaths;
		for (const sourceDir of [pagesDir, componentsDir, includesDir, layoutsDir, publicDir]) {
			if (!isPathInside(sourceDir, srcDir) && fileSystem.exists(sourceDir)) {
				literalPaths.add(sourceDir);
			}
		}
		for (const recordedPath of buildInputIndex.recordedWatchPaths()) {
			if (!isPathInside(recordedPath, srcDir)) {
				literalPaths.add(recordedPath);
			}
		}

		const globWatchPaths: AdditionalWatchPath[] = [];
		for (const pattern of this.appConfig.additionalWatchPaths) {
			const watchPath = resolveAdditionalWatchPath(pattern, this.appConfig.rootDir);
			if (!watchPath.glob) {
				literalPaths.add(watchPath.base);
				continue;
			}

			if (path.dirname(watchPath.base) === watchPath.base) {
				appLogger.warn(
					`additionalWatchPaths entry "${pattern}" watches the filesystem root; start it with a directory.`,
				);
			}
			globWatchPaths.push(watchPath);
		}

		for (const restartPath of resolveRuntimeRestartWatchPaths(this.appConfig)) {
			literalPaths.add(restartPath);
		}

		this.workspacePackageRoots = resolveWorkspacePackageWatchRoots(this.appConfig.rootDir);
		const ignoreProjectPath = createProjectWatcherIgnorePredicate(
			this.appConfig.absolutePaths,
			this.workspacePackageRoots,
		);
		const ignored = (watchedPath: string, stats?: Stats): boolean => {
			if (ignoreProjectPath(watchedPath)) return true;
			if (
				!stats ||
				[...literalPaths].some((literalPath) => isPathInside(watchedPath, literalPath)) ||
				this.workspacePackageRoots.some((root) => isPathInside(watchedPath, root))
			)
				return false;
			return stats.isDirectory()
				? !globWatchPaths.some((watchPath) => mayContainAdditionalWatchMatches(watchedPath, watchPath))
				: !globWatchPaths.some((watchPath) => matchesAdditionalWatchPath(watchedPath, watchPath));
		};

		this.watcher = chokidar.watch(
			[...literalPaths, ...this.workspacePackageRoots, ...new Set(globWatchPaths.map(({ base }) => base))],
			{
				ignoreInitial: true,
				ignorePermissionErrors: true,
				ignored,
				awaitWriteFinish: {
					stabilityThreshold: 50,
					pollInterval: 50,
				},
			},
		);

		this.watcherReady = new Promise<void>((resolve, reject) => {
			this.rejectWatcherReady = reject;
			this.watcherReadyTimeout = setTimeout(() => {
				this.watcherReadyTimeout = undefined;
				this.rejectWatcherReady = undefined;
				reject(
					new Error(
						`Filesystem watcher did not become ready within ${ProjectWatcher.watcherReadyTimeoutMs}ms`,
					),
				);
			}, ProjectWatcher.watcherReadyTimeoutMs);
			this.watcher!.once('ready', () => {
				this.clearWatcherReadyTimeout();
				this.rejectWatcherReady = undefined;
				resolve();
			});
			this.watcher!.once('error', (error) => {
				this.clearWatcherReadyTimeout();
				this.rejectWatcherReady = undefined;
				reject(error);
			});
		});

		this.unsubscribeFromRecordedWatchPaths = buildInputIndex.subscribeToWatchPaths((filePath) => {
			if (this.closed || !this.watcher) {
				return;
			}
			if (ignoreProjectPath(filePath)) {
				return;
			}
			const resolvedPath = path.resolve(filePath);
			if (
				literalPaths.has(resolvedPath) ||
				[...literalPaths].some((literalPath) => isPathInside(resolvedPath, literalPath))
			) {
				return;
			}
			literalPaths.add(resolvedPath);
			this.watcher.add(resolvedPath);
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

		return this.waitForWatcherReady();
	}

	/**
	 * Closes the active filesystem watcher subscription.
	 *
	 * @remarks
	 * Safe to call multiple times. Used when tearing down dev servers in tests
	 * and other short-lived Ecopages runtimes.
	 */
	public close(): Promise<void> {
		if (this.closePromise) {
			return this.closePromise;
		}

		this.closePromise = this.closeWatcher();
		return this.closePromise;
	}

	private async closeWatcher(): Promise<void> {
		this.closed = true;
		this.clearWatcherReadyTimeout();
		this.rejectWatcherReady?.(new Error('Filesystem watcher closed before it became ready'));
		this.rejectWatcherReady = undefined;
		this.unsubscribeFromRecordedWatchPaths?.();
		this.unsubscribeFromRecordedWatchPaths = undefined;

		this.clearPendingFlushTimers();
		this.pendingDevFileKinds.clear();
		for (const resolve of this.pendingFlushResolvers.splice(0)) {
			resolve();
		}

		if (this.watcher) {
			await this.watcher.close();
			this.watcher = null;
		}

		await this.changeQueue.catch(() => undefined);
	}
}

function formatErrorWithStack(error: unknown): string {
	return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function watcherEventToDevFileChangeKind(event: 'change' | 'add' | 'unlink'): DevFileChangeKind {
	if (event === 'add') {
		return 'created';
	}
	if (event === 'unlink') {
		return 'deleted';
	}
	return 'changed';
}

function takePendingDevFileChanges(pending: Map<string, DevFileChangeKind>): DevFileChanges {
	const changed: string[] = [];
	const created: string[] = [];
	const deleted: string[] = [];

	for (const [filePath, kind] of pending) {
		if (kind === 'created') {
			created.push(filePath);
		} else if (kind === 'deleted') {
			deleted.push(filePath);
		} else {
			changed.push(filePath);
		}
	}
	pending.clear();

	return { changed, created, deleted };
}
