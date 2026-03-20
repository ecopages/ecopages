import path from 'node:path';
import { getBunRuntime } from '../../utils/runtime.ts';
import { RESOLVED_ASSETS_DIR } from '../../constants';
import {
	getAppBrowserBuildPlugins,
	setupAppRuntimePlugins,
} from '../../build/build-adapter.ts';
import { appLogger } from '../../global/app-logger';
import type { EcoPagesAppConfig } from '../../internal-types';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import { fileSystem } from '@ecopages/file-system';
import { StaticSiteGenerator } from '../../static-site-generator/static-site-generator';
import { ProjectWatcher } from '../../watchers/project-watcher';
import type { ClientBridge } from './client-bridge';
import type { HmrManager } from './hmr-manager';

export interface WatcherCallbacks {
	refreshRouterRoutesCallback: () => Promise<void>;
}

export interface ServerLifecycleParams {
	appConfig: EcoPagesAppConfig;
	runtimeOrigin: string;
	hmrManager: HmrManager;
	bridge: ClientBridge;
}

/**
 * Handles server lifecycle: initialization, plugins, loaders, and file watching.
 */
export class ServerLifecycle {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly hmrManager: HmrManager;
	private readonly bridge: ClientBridge;
	private readonly runtimeOrigin: string;
	private staticSiteGenerator!: StaticSiteGenerator;

	constructor({ appConfig, runtimeOrigin, hmrManager, bridge }: ServerLifecycleParams) {
		this.appConfig = appConfig;
		this.runtimeOrigin = runtimeOrigin;
		this.hmrManager = hmrManager;
		this.bridge = bridge;
	}

	/**
	 * Initializes the server's core components.
	 * @returns The static site generator instance for use by other components
	 */
	async initialize(): Promise<StaticSiteGenerator> {
		this.staticSiteGenerator = new StaticSiteGenerator({ appConfig: this.appConfig });
		await this.hmrManager.buildRuntime();

		this.setupLoaders();
		this.copyPublicDir();

		return this.staticSiteGenerator;
	}

	/**
	 * Sets up Bun loaders from config.
	 * Note: This will be abstracted to a LoaderStrategy interface in #4 Runtime Abstraction.
	 */
	setupLoaders(): void {
		const loaders = this.appConfig.loaders;
		for (const loader of loaders.values()) {
			getBunRuntime()?.plugin(loader as any);
		}
	}

	/**
	 * Copies public directory contents to dist root.
	 * Static files are served from root (e.g., /favicon.ico, /robots.txt).
	 */
	copyPublicDir(): void {
		try {
			const srcPublicDir = path.join(this.appConfig.rootDir, this.appConfig.srcDir, this.appConfig.publicDir);

			if (fileSystem.exists(srcPublicDir)) {
				fileSystem.copyDir(srcPublicDir, path.join(this.appConfig.rootDir, this.appConfig.distDir));
			}

			fileSystem.ensureDir(path.join(this.appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR));
		} catch (error) {
			appLogger.error(
				`Failed to copy public directory: ${error instanceof Error ? error.message : String(error)}`,
			);
			throw error;
		}
	}

	/**
	 * Initializes processors and integrations.
	 * @param options.watch - Whether watch mode is enabled
	 */
	async initializePlugins(options?: { watch?: boolean }): Promise<EcoBuildPlugin[]> {
		try {
			const hmrEnabled = !!options?.watch;
			this.hmrManager.setEnabled(hmrEnabled);

			await setupAppRuntimePlugins({
				appConfig: this.appConfig,
				runtimeOrigin: this.runtimeOrigin,
				hmrManager: this.hmrManager,
				onRuntimePlugin: (plugin) => {
					getBunRuntime()?.plugin(plugin as any);
				},
			});

			const allBuildPlugins = getAppBrowserBuildPlugins(this.appConfig);
			this.hmrManager.setPlugins(allBuildPlugins);
			return allBuildPlugins;
		} catch (error) {
			appLogger.error(`Failed to initialize plugins: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}

	/**
	 * Starts file watching for HMR.
	 */
	async startWatching(callbacks: WatcherCallbacks): Promise<void> {
		const watcherInstance = new ProjectWatcher({
			config: this.appConfig,
			refreshRouterRoutesCallback: callbacks.refreshRouterRoutesCallback,
			hmrManager: this.hmrManager,
			bridge: this.bridge,
		});

		await watcherInstance.createWatcherSubscription();
	}

	getStaticSiteGenerator(): StaticSiteGenerator {
		return this.staticSiteGenerator;
	}
}
