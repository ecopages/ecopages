import path from 'node:path';
import { getBunRuntime } from '../../utils/runtime.ts';
import { RESOLVED_ASSETS_DIR } from '../../constants';
import { getAppBrowserBuildPlugins, setupAppRuntimePlugins } from '../../build/build-adapter.ts';
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
 * Coordinates Bun-runtime server startup side effects for one app instance.
 *
 * @remarks
 * This class keeps runtime-only concerns together: build-runtime bootstrapping,
 * Bun loader registration, public asset preparation, plugin setup, and file
 * watching. Core config/build state is expected to already be finalized before
 * this lifecycle runs.
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
	 * Initializes the runtime services that Bun startup depends on.
	 *
	 * @returns The static-site generator instance reused by the adapter.
	 */
	async initialize(): Promise<StaticSiteGenerator> {
		this.staticSiteGenerator = new StaticSiteGenerator({ appConfig: this.appConfig });
		await this.hmrManager.buildRuntime();

		this.setupLoaders();
		this.copyPublicDir();

		return this.staticSiteGenerator;
	}

	/**
	 * Registers config-owned build loaders with Bun's runtime plugin API.
	 *
	 * @remarks
	 * Bun remains responsible only for transport-level plugin registration here.
	 * Loader ownership and composition were already finalized during config build.
	 */
	setupLoaders(): void {
		const loaders = this.appConfig.loaders;
		for (const loader of loaders.values()) {
			getBunRuntime()?.plugin(loader as any);
		}
	}

	/**
	 * Copies public assets into the runtime dist directory and ensures the
	 * resolved-assets directory exists.
	 *
	 * @remarks
	 * Bun serves static files from the built dist root, so public files must be in
	 * place before request handling begins.
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
	 * Runs runtime-only processor and integration setup for this Bun app session.
	 *
	 * @param options.watch Whether watch mode is enabled.
	 * @returns The browser build plugins visible to HMR after runtime setup.
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
	 * Starts file watching and wires change events back into the adapter refresh
	 * callback.
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

	/**
	 * Returns the static-site generator created during initialization.
	 */
	getStaticSiteGenerator(): StaticSiteGenerator {
		return this.staticSiteGenerator;
	}
}
