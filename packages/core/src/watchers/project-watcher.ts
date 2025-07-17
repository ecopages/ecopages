import chokidar, { type FSWatcher } from 'chokidar';
import { hmrServerError, hmrServerReload } from '../adapters/bun/hmr.ts';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';

/**
 * Configuration options for the ProjectWatcher
 * @interface ProjectWatcherConfig
 * @property {EcoPagesAppConfig} config - The application configuration
 * @property {() => void} refreshRouterRoutesCallback - Callback to refresh router routes when files change
 */
type ProjectWatcherConfig = {
	config: EcoPagesAppConfig;
	refreshRouterRoutesCallback: () => void;
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
	private watcher: FSWatcher | undefined;

	constructor({ config, refreshRouterRoutesCallback }: ProjectWatcherConfig) {
		import.meta.env.NODE_ENV = 'development';
		this.appConfig = config;
		this.refreshRouterRoutesCallback = refreshRouterRoutesCallback;
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
	 * Handles file changes by:
	 * 1. Uncaching affected modules
	 * 2. Refreshing router routes if it's a page file
	 * 3. Triggering HMR server reload
	 *
	 * @private
	 * @param {string} path - Path of the changed file
	 */
	private handleFileChange(path: string): void {
		try {
			this.uncacheModules();
			const isPageFile = path.includes(this.appConfig.pagesDir);

			if (isPageFile) {
				this.refreshRouterRoutesCallback();
			}

			hmrServerReload(path);
		} catch (error) {
			if (error instanceof Error) {
				hmrServerError(error);
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
		const isPageDir = path.includes(this.appConfig.pagesDir);
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
			hmrServerError(error);
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
			.on('change', this.handleFileChange)
			.on('add', (path) => this.triggerRouterRefresh(path))
			.on('addDir', (path) => this.triggerRouterRefresh(path))
			.on('unlink', (path) => this.triggerRouterRefresh(path))
			.on('unlinkDir', (path) => this.triggerRouterRefresh(path))
			.on('error', (error) => this.handleError(error));

		return this.watcher;
	}
}
