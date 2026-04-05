import { getBunRuntime } from '../../utils/runtime.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import { StaticSiteGenerator } from '../../static-site-generator/static-site-generator.ts';
import type { ClientBridge } from './client-bridge.ts';
import type { HmrManager } from './hmr-manager.ts';
import {
	bindSharedRuntimeHmrManager,
	initializeSharedRuntimePlugins,
	prepareSharedRuntimePublicDir,
	startSharedProjectWatching,
} from '../shared/runtime-bootstrap.ts';

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
		prepareSharedRuntimePublicDir(this.appConfig);

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
	 * Runs runtime-only processor and integration setup for this Bun app session.
	 *
	 * @param options.watch Whether watch mode is enabled.
	 * @returns The browser build plugins visible to HMR after runtime setup.
	 */
	async initializePlugins(options?: { watch?: boolean }): Promise<EcoBuildPlugin[]> {
		try {
			const hmrEnabled = !!options?.watch;
			this.hmrManager.setEnabled(hmrEnabled);

			await initializeSharedRuntimePlugins({
				appConfig: this.appConfig,
				runtimeOrigin: this.runtimeOrigin,
				hmrManager: this.hmrManager,
				onRuntimePlugin: (plugin) => {
					getBunRuntime()?.plugin(plugin as any);
				},
			});

			return bindSharedRuntimeHmrManager(this.appConfig, this.hmrManager);
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
		await startSharedProjectWatching({
			appConfig: this.appConfig,
			refreshRouterRoutesCallback: callbacks.refreshRouterRoutesCallback,
			hmrManager: this.hmrManager,
			bridge: this.bridge,
		});
	}

	/**
	 * Returns the static-site generator created during initialization.
	 */
	getStaticSiteGenerator(): StaticSiteGenerator {
		return this.staticSiteGenerator;
	}
}
