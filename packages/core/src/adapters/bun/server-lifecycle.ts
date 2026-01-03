import path from 'node:path';
import type { BunPlugin } from 'bun';
import { RESOLVED_ASSETS_DIR } from '../../constants';
import { appLogger } from '../../global/app-logger';
import type { EcoPagesAppConfig } from '../../internal-types';
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
			Bun.plugin(loader);
		}
	}

	/**
	 * Copies public directory to dist.
	 */
	copyPublicDir(): void {
		fileSystem.copyDir(
			path.join(this.appConfig.rootDir, this.appConfig.srcDir, this.appConfig.publicDir),
			path.join(this.appConfig.rootDir, this.appConfig.distDir, this.appConfig.publicDir),
		);
		fileSystem.ensureDir(path.join(this.appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR));
	}

	/**
	 * Initializes processors and integrations.
	 * @param options.watch - Whether watch mode is enabled
	 */
	async initializePlugins(options?: { watch?: boolean }): Promise<BunPlugin[]> {
		try {
			const hmrEnabled = !!options?.watch;
			this.hmrManager.setEnabled(hmrEnabled);

			const processorBuildPlugins: BunPlugin[] = [];

			const processorPromises = Array.from(this.appConfig.processors.values()).map(async (processor) => {
				await processor.setup();
				if (processor.plugins) {
					for (const plugin of processor.plugins) {
						Bun.plugin(plugin);
					}
				}
				if (processor.buildPlugins) {
					processorBuildPlugins.push(...processor.buildPlugins);
				}
			});

			const integrationPromises = this.appConfig.integrations.map(async (integration) => {
				integration.setConfig(this.appConfig);
				integration.setRuntimeOrigin(this.runtimeOrigin);
				integration.setHmrManager(this.hmrManager);
				await integration.setup();
			});

			await Promise.all([...processorPromises, ...integrationPromises]);

			this.hmrManager.setPlugins(processorBuildPlugins);
			return processorBuildPlugins;
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
