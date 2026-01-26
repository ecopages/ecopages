import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig, IHmrManager } from '../internal-types.ts';
import type { ClientBridge } from '../adapters/bun/client-bridge';
import type { ProcessorWatchContext } from '../plugins/processor.ts';

/**
 * Configuration options for the ProjectWatcher
 * @interface ProjectWatcherConfig
 * @property {EcoPagesAppConfig} config - The application configuration
 * @property {() => void} refreshRouterRoutesCallback - Callback to refresh router routes
 * @property {IHmrManager} hmrManager - The HMR manager instance
 * @property {ClientBridge} bridge - The client bridge instance
 */
export interface ProjectWatcherConfig {
	config: EcoPagesAppConfig;
	refreshRouterRoutesCallback: () => void;
	hmrManager: IHmrManager;
	bridge: ClientBridge;
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
	private appConfig: EcoPagesAppConfig;
	private refreshRouterRoutesCallback: () => void;
	private hmrManager: IHmrManager;
	private bridge: ClientBridge;
	private watcher: FSWatcher | null = null;

	constructor({ config, refreshRouterRoutesCallback, hmrManager, bridge }: ProjectWatcherConfig) {
		this.appConfig = config;
		this.refreshRouterRoutesCallback = refreshRouterRoutesCallback;
		this.hmrManager = hmrManager;
		this.bridge = bridge;
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
				await Bun.write(destPath, Bun.file(filePath));
			}

			this.bridge.reload();
		} catch (error) {
			appLogger.error(`Failed to copy public file: ${error instanceof Error ? error.message : String(error)}`);
			this.bridge.reload();
		}
	}

	/**
	 * Handles file changes by uncaching modules, refreshing routes, and delegating appropriately.
	 * Follows 4-rule priority:
	 * 0. Public directory match? → copy file and reload
	 * 1. additionalWatchPaths match? → reload
	 * 2. Processor extension match? → processor handles (skip HMR)
	 * 3. Otherwise → HMR strategies
	 * @param rawPath - Path of the changed file
	 */
	private async handleFileChange(rawPath: string): Promise<void> {
		const filePath = path.resolve(rawPath);
		try {
			if (this.isPublicDirFile(filePath)) {
				await this.handlePublicDirFileChange(filePath);
				return;
			}

			this.uncacheModules();
			const isPageFile = filePath.startsWith(this.appConfig.absolutePaths.pagesDir);

			if (isPageFile) {
				this.refreshRouterRoutesCallback();
			}

			if (this.matchesAdditionalWatchPaths(filePath)) {
				this.bridge.reload();
				return;
			}

			if (this.isHandledByProcessor(filePath)) {
				return;
			}

			await this.hmrManager.handleFileChange(filePath);
		} catch (error) {
			if (error instanceof Error) {
				this.bridge.error(error.message);
				this.handleError(error);
			}
		}
	}

	/**
	 * Checks if a file is in the public directory.
	 */
	private isPublicDirFile(filePath: string): boolean {
		return filePath.startsWith(this.appConfig.absolutePaths.publicDir);
	}

	/**
	 * Checks if file path matches any additionalWatchPaths patterns.
	 */
	private matchesAdditionalWatchPaths(filePath: string): boolean {
		const patterns = this.appConfig.additionalWatchPaths;
		if (!patterns.length) return false;

		for (const pattern of patterns) {
			if (pattern.includes('*')) {
				const ext = pattern.replace(/\*\*?\/\*/, '');
				if (filePath.endsWith(ext)) return true;
			} else {
				if (filePath.endsWith(pattern) || filePath === path.resolve(pattern)) return true;
			}
		}
		return false;
	}

	/**
	 * Checks if a file is handled by a processor.
	 * Processors that declare extensions own those file types.
	 */
	private isHandledByProcessor(filePath: string): boolean {
		for (const processor of this.appConfig.processors.values()) {
			const watchConfig = processor.getWatchConfig();
			if (!watchConfig) continue;

			const { extensions = [] } = watchConfig;
			if (extensions.length && extensions.some((ext) => filePath.endsWith(ext))) {
				return true;
			}
		}
		return false;
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
	 * @param {(ctx: ProcessorWatchContext) => void} handler - Handler function for the file change
	 */
	private shouldProcess(path: string, extensions: string[], handler: (ctx: ProcessorWatchContext) => void) {
		if (!extensions.length || extensions.some((ext) => path.endsWith(ext))) {
			handler({ path, bridge: this.bridge });
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
			.on('add', (path) => {
				this.handleFileChange(path);
				this.triggerRouterRefresh(path);
			})
			.on('addDir', (path) => this.triggerRouterRefresh(path))
			.on('unlink', (path) => this.triggerRouterRefresh(path))
			.on('unlinkDir', (path) => this.triggerRouterRefresh(path))
			.on('error', (error) => this.handleError(error));

		return this.watcher;
	}
}
