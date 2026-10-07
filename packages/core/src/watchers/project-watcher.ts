import { readdirSync, realpathSync, statSync, type Stats } from 'node:fs';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../global/app-logger.ts';
import { isPathInside } from '../utils/path-containment.ts';
import type { EcoPagesAppConfig, IHmrManager, IClientBridge } from '../types/internal-types.ts';
import type { ProcessorWatchConfig, ProcessorWatchContext } from '../plugins/processor.ts';
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
	/** Delay before a change event is processed; 0 disables debouncing. */
	changeDebounceMs?: number;
	/** Applies config, dotenv, or linked package changes through the owning runtime lifecycle. */
	onRestartRequest?: (filePath: string) => Promise<void>;
	/** Whether an entry watcher already owns changes to the config module. */
	entryWatcherOwnsConfig?: boolean;
}

/**
 * ProjectWatcher subscribes to project files and applies each debounce window
 * through one `applyDevFileChanges` call. Dirty results rebuild on the next
 * request; the browser is notified once per batch.
 */
export class ProjectWatcher {
	/**
	 * Watcher events that arrive during this window are applied as one batch.
	 */
	private static readonly duplicateChangeWindowMs = 150;
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
	private unsubscribeFromRecordedWatchPaths?: () => void;
	/**
	 * Paths just passed to `watcher.add` that already existed on disk.
	 *
	 * @remarks
	 * Chokidar emits `add` for those files even though nothing was created.
	 * Treating that as a create reloads the browser after the first request that
	 * recorded the path (for example a client navigation to an unvisited Page).
	 */
	private readonly ignoreSubscriptionAdds = new Set<string>();
	/**
	 * Files and directories that already existed in watched trees at subscribe.
	 * A later `add` for one of these is a startup scan, not a create.
	 */
	private readonly existedAtWatchStart = new Set<string>();
	private closed = false;
	private pendingDevFileKinds = new Map<string, DevFileChangeKind>();
	private pendingFlushTimer: ReturnType<typeof setTimeout> | undefined;
	private pendingFlushResolvers: Array<() => void> = [];
	private changeQueue: Promise<void> = Promise.resolve();

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

	/** An initial scan is synthetic only for paths present in the subscription snapshot. */
	private isSyntheticStartupAdd(filePath: string): boolean {
		const resolvedPath = path.resolve(filePath);
		const existingPath = resolveExistingPath(resolvedPath);
		const existed = this.existedAtWatchStart.has(existingPath) || this.existedAtWatchStart.has(resolvedPath);
		this.existedAtWatchStart.delete(existingPath);
		this.existedAtWatchStart.delete(resolvedPath);
		return existed;
	}

	private snapshotExistingWatchedPaths(
		roots: readonly string[],
		ignoreProjectPath: (watchedPath: string) => boolean,
	): void {
		this.existedAtWatchStart.clear();
		for (const root of roots) {
			rememberExistingWatchPath(root, ignoreProjectPath, this.existedAtWatchStart);
		}
	}

	/**
	 * @remarks
	 * Sent whoever owns the dev client: the Vite host turns Vite HMR off and serves the Ecopages HMR runtime,
	 * which subscribes to this bridge, so it is the browser client there too.
	 */
	private requestBrowserReload(): void {
		this.bridge.reload();
	}

	/**
	 * Handles public directory file changes by copying only the changed file.
	 * @param filePath - Absolute path of the changed file
	 */
	private async handlePublicDirFileChange(filePath: string): Promise<void> {
		await this.copyPublicDirFile(filePath);
		this.requestBrowserReload();
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
			appLogger.error(`Failed to copy public file: ${error instanceof Error ? error.message : String(error)}`);
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
		if (event === 'unlink') {
			this.ignoreSubscriptionAdds.delete(resolvedPath);
			this.existedAtWatchStart.delete(resolvedPath);
			this.existedAtWatchStart.delete(resolveExistingPath(resolvedPath));
		} else if (
			event === 'add' &&
			(this.ignoreSubscriptionAdds.delete(resolvedPath) ||
				this.ignoreSubscriptionAdds.delete(resolveExistingPath(resolvedPath)))
		) {
			return Promise.resolve();
		} else if (event === 'add' && this.isSyntheticStartupAdd(resolvedPath)) {
			return Promise.resolve();
		}

		this.pendingDevFileKinds.set(resolvedPath, watcherEventToDevFileChangeKind(event));

		if (this.changeDebounceMs === 0) {
			return this.enqueueChange(() => this.flushPendingDevFileChanges());
		}

		if (this.pendingFlushTimer) {
			clearTimeout(this.pendingFlushTimer);
		}

		const flushPromise = new Promise<void>((resolve) => {
			this.pendingFlushResolvers.push(resolve);
		});

		this.pendingFlushTimer = setTimeout(() => {
			this.pendingFlushTimer = undefined;
			const resolvers = this.pendingFlushResolvers.splice(0);
			void this.enqueueChange(() => this.flushPendingDevFileChanges()).finally(() => {
				for (const resolve of resolvers) {
					resolve();
				}
			});
		}, this.changeDebounceMs);

		return flushPromise;
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

	private async processFileChange(filePath: string, event: 'change' | 'add' | 'unlink' = 'change'): Promise<void> {
		this.pendingDevFileKinds.set(path.resolve(filePath), watcherEventToDevFileChangeKind(event));
		await this.flushPendingDevFileChanges();
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

			if (applied.files.some((file) => file.plan.category !== 'public-asset')) {
				this.uncacheModules();
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
		for (const file of files) {
			await this.notifyProcessors(file.filePath, devFileChangeKindToWatcherEvent(file.kind));
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
	 *
	 * @remarks
	 * A glob in `additionalWatchPaths` is watched through its static base
	 * directory, which can be the project root for `**` patterns. Files reached
	 * only through such a base are ignored unless they match a pattern, and so
	 * are dot-directories the pattern does not name, so a broad base does not
	 * feed unrelated files into the change pipeline.
	 */
	public async createWatcherSubscription() {
		if (this.watcher) {
			await this.watcherReady;
			return this.watcher;
		}

		const processorPaths = new Set<string>();
		const buildInputIndex = getAppBuildInputIndex(this.appConfig);
		for (const recordedPath of buildInputIndex.recordedWatchPaths()) {
			processorPaths.add(recordedPath);
		}

		if (fileSystem.exists(this.appConfig.absolutePaths.pagesDir)) {
			processorPaths.add(this.appConfig.absolutePaths.pagesDir);
		}

		for (const sourceDir of [
			this.appConfig.absolutePaths.componentsDir,
			this.appConfig.absolutePaths.includesDir,
			this.appConfig.absolutePaths.layoutsDir,
			path.join(this.appConfig.absolutePaths.srcDir, 'views'),
		]) {
			if (fileSystem.exists(sourceDir)) {
				processorPaths.add(sourceDir);
			}
		}

		if (fileSystem.exists(this.appConfig.absolutePaths.publicDir)) {
			processorPaths.add(this.appConfig.absolutePaths.publicDir);
		}

		const globWatchPaths: AdditionalWatchPath[] = [];
		for (const pattern of this.appConfig.additionalWatchPaths) {
			const watchPath = resolveAdditionalWatchPath(pattern, this.appConfig.rootDir);
			if (!watchPath.glob) {
				processorPaths.add(watchPath.base);
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
			processorPaths.add(restartPath);
		}

		this.workspacePackageRoots = resolveWorkspacePackageWatchRoots(this.appConfig.rootDir);
		const literalPaths = processorPaths;
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

		this.snapshotExistingWatchedPaths(
			[
				this.appConfig.absolutePaths.pagesDir,
				this.appConfig.absolutePaths.componentsDir,
				this.appConfig.absolutePaths.includesDir,
				this.appConfig.absolutePaths.layoutsDir,
				path.join(this.appConfig.absolutePaths.srcDir, 'views'),
				this.appConfig.absolutePaths.publicDir,
				...buildInputIndex.recordedWatchPaths(),
			],
			ignoreProjectPath,
		);
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
			this.watcher!.once('ready', resolve);
			this.watcher!.once('error', reject);
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
			if (fileSystem.exists(resolvedPath)) {
				this.ignoreSubscriptionAdds.add(resolvedPath);
				this.ignoreSubscriptionAdds.add(resolveExistingPath(resolvedPath));
			}
			this.watcher.add(resolvedPath);
		});

		this.watcher
			.on('change', (p) => this.handleFileChange(p, 'change'))
			.on('add', (p) => this.handleFileChange(p, 'add'))
			.on('addDir', (p) => {
				if (this.isSyntheticStartupAdd(p)) {
					return;
				}
				return this.enqueueChange(() => this.triggerRouterRefresh(p));
			})
			.on('unlink', (p) => this.handleFileChange(p, 'unlink'))
			.on('unlinkDir', (p) => this.enqueueChange(() => this.triggerRouterRefresh(p)))
			.on('error', (error) => this.handleError(error));

		for (const processor of this.appConfig.processors.values()) {
			const watchConfig = processor.getWatchConfig();
			if (watchConfig?.onError) {
				this.watcher.on('error', watchConfig.onError as (error: unknown) => void);
			}
		}

		await this.watcherReady;
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
		this.unsubscribeFromRecordedWatchPaths?.();
		this.unsubscribeFromRecordedWatchPaths = undefined;
		this.ignoreSubscriptionAdds.clear();
		this.existedAtWatchStart.clear();

		if (this.pendingFlushTimer) {
			clearTimeout(this.pendingFlushTimer);
			this.pendingFlushTimer = undefined;
		}
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

function resolveExistingPath(filePath: string): string {
	const resolvedPath = path.resolve(filePath);
	try {
		return realpathSync(resolvedPath);
	} catch {
		return resolvedPath;
	}
}

function rememberExistingWatchPath(
	root: string,
	ignoreProjectPath: (watchedPath: string) => boolean,
	into: Set<string>,
): void {
	const resolvedRoot = resolveExistingPath(root);
	if (ignoreProjectPath(resolvedRoot)) {
		return;
	}
	let stats: Stats;
	try {
		stats = statSync(resolvedRoot);
	} catch {
		return;
	}
	into.add(resolvedRoot);
	if (!stats.isDirectory()) {
		return;
	}
	let entries;
	try {
		entries = readdirSync(resolvedRoot, { withFileTypes: true, encoding: 'utf8' });
	} catch {
		return;
	}
	for (const entry of entries) {
		const entryPath = path.join(resolvedRoot, entry.name);
		if (ignoreProjectPath(entryPath)) {
			continue;
		}
		if (entry.isDirectory()) {
			rememberExistingWatchPath(entryPath, ignoreProjectPath, into);
			continue;
		}
		if (entry.isFile()) {
			into.add(resolveExistingPath(entryPath));
		}
	}
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

function devFileChangeKindToWatcherEvent(kind: DevFileChangeKind): 'change' | 'add' | 'unlink' {
	if (kind === 'created') {
		return 'add';
	}
	if (kind === 'deleted') {
		return 'unlink';
	}
	return 'change';
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
