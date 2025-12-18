import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig, IHmrManager } from '../internal-types.ts';

/**
 * Configuration options for the ProjectWatcher
 * @interface ProjectWatcherConfig
 * @property {EcoPagesAppConfig} config - The application configuration
 * @property {() => void} refreshRouterRoutesCallback - Callback to refresh router routes when files change
 * @property {IHmrManager} hmrManager - The HMR manager to broadcast changes
 */
type ProjectWatcherConfig = {
	config: EcoPagesAppConfig;
	refreshRouterRoutesCallback: () => void;
	hmrManager: IHmrManager;
};

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
	private appConfig: EcoPagesAppConfig;
	private refreshRouterRoutesCallback: () => void;
	private hmrManager: IHmrManager;
	private watcher: FSWatcher | undefined;

	constructor({ config, refreshRouterRoutesCallback, hmrManager }: ProjectWatcherConfig) {
		import.meta.env.NODE_ENV = 'development';
		this.appConfig = config;
		this.refreshRouterRoutesCallback = refreshRouterRoutesCallback;
		this.hmrManager = hmrManager;
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
		const { srcDir, rootDir } = this.appConfig;
		const regex = new RegExp(`${rootDir}/${srcDir}/.*`);

		for (const key in require.cache) {
			if (regex.test(key)) {
				delete require.cache[key];
			}
		}
	}

	/**
	 * Handles file changes by uncaching modules, refreshing routes, and delegating to HMR strategies.
	 * @param rawPath - Path of the changed file
	 */
	private async handleFileChange(rawPath: string): Promise<void> {
		const filePath = path.resolve(rawPath);
		// appLogger.debug(`[ProjectWatcher] File changed: ${filePath}`);
		try {
			this.uncacheModules();
			const isPageFile = filePath.startsWith(this.appConfig.absolutePaths.pagesDir);

			if (isPageFile) {
				this.refreshRouterRoutesCallback();
			}

			await this.hmrManager.handleFileChange(filePath);
		} catch (error) {
			if (error instanceof Error) {
				this.hmrManager.broadcast({ type: 'error', message: error.message });
				this.handleError(error);
			}
		}
	}

	/**
	 * Triggers router refresh for page directory changes.
	 * This ensures the router is updated when pages are added or removed.
	 *
	 * @param {string} path - Path of the changed directory
	 */
	triggerRouterRefresh(path: string) {
		const isPageDir = path.startsWith(this.appConfig.absolutePaths.pagesDir);
		if (isPageDir) {
			this.refreshRouterRoutesCallback();
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
	 * Processes file changes for specific file extensions.
	 * Used by processors to handle their specific file types.
	 *
	 * @private
	 * @param {string} path - Path of the changed file
	 * @param {string[]} extensions - File extensions to process
	 * @param {(path: string) => void} handler - Handler function for the file change
	 */
	private shouldProcess(path: string, extensions: string[], handler: (path: string) => void) {
		if (!extensions.length || extensions.some((ext) => path.endsWith(ext))) {
			handler(path);
		}
	}

	/**
	 * Creates and configures the file system watcher.
	 * This sets up:
	 * 1. Processor-specific file watching
	 * 2. Page file watching
	 * 3. Directory watching
	 * 4. Error handling
	 *
	 * Uses chokidar's built-in debouncing through `awaitWriteFinish` to handle
	 * rapid file changes efficiently.
	 */
	public async createWatcherSubscription() {
		if (!this.watcher) {
			const processorPaths: string[] = [];
			for (const processor of this.appConfig.processors.values()) {
				const watchConfig = processor.getWatchConfig();
				if (!watchConfig) continue;
				processorPaths.push(...watchConfig.paths);
			}

			processorPaths.push(this.appConfig.absolutePaths.pagesDir);

			this.watcher = chokidar.watch(processorPaths, {
				ignoreInitial: true,
				ignorePermissionErrors: true,
				awaitWriteFinish: {
					stabilityThreshold: 50,
					pollInterval: 50,
				},
			});
		}

		for (const processor of this.appConfig.processors.values()) {
			const watchConfig = processor.getWatchConfig();
			if (!watchConfig) continue;
			const { extensions = [], onCreate, onChange, onDelete, onError } = watchConfig;

			if (onCreate) this.watcher.on('add', (path) => this.shouldProcess(path, extensions, onCreate));
			if (onChange) this.watcher.on('change', (path) => this.shouldProcess(path, extensions, onChange));
			if (onDelete) this.watcher.on('unlink', (path) => this.shouldProcess(path, extensions, onDelete));
			if (onError) this.watcher.on('error', onError as (error: unknown) => void);
		}

		this.watcher.add(this.appConfig.absolutePaths.srcDir);

		this.watcher
			.on('change', (path) => this.handleFileChange(path))
			.on('add', (path) => this.triggerRouterRefresh(path))
			.on('addDir', (path) => this.triggerRouterRefresh(path))
			.on('unlink', (path) => this.triggerRouterRefresh(path))
			.on('unlinkDir', (path) => this.triggerRouterRefresh(path))
			.on('error', (error) => this.handleError(error));

		return this.watcher;
	}
}
