import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { getAppBrowserBuildPlugins, setupAppRuntimePlugins, type BuildExecutor } from '../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../build/build-types.ts';
import { installAppRuntimeBuildExecutor } from '../../build/runtime-build-executor.ts';
import { RESOLVED_ASSETS_DIR } from '../../constants.ts';
import type { EcoPagesAppConfig, IClientBridge, IHmrManager } from '../../internal-types.ts';
import { ProjectWatcher } from '../../watchers/project-watcher.ts';

/**
 * Installs and returns the app-owned runtime build executor used by adapter
 * startup and follow-up runtime work.
 */
export function installSharedRuntimeBuildExecutor(
	appConfig: EcoPagesAppConfig,
	options: { development: boolean },
): BuildExecutor {
	return installAppRuntimeBuildExecutor(appConfig, options);
}

/**
 * Copies app public assets into dist and ensures the resolved assets directory
 * exists before request handling begins.
 */
export function prepareSharedRuntimePublicDir(appConfig: EcoPagesAppConfig): void {
	const srcPublicDir = path.join(appConfig.rootDir, appConfig.srcDir, appConfig.publicDir);

	if (fileSystem.exists(srcPublicDir)) {
		fileSystem.copyDir(srcPublicDir, path.join(appConfig.rootDir, appConfig.distDir));
	}

	fileSystem.ensureDir(path.join(appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR));
}

/**
 * Runs runtime plugin setup against app-owned config/runtime state and optional
 * host plugin registration hooks.
 */
export async function initializeSharedRuntimePlugins(options: {
	appConfig: EcoPagesAppConfig;
	runtimeOrigin: string;
	hmrManager?: IHmrManager;
	onRuntimePlugin?: (plugin: unknown) => void;
}): Promise<void> {
	await setupAppRuntimePlugins(options);
}

/**
 * Starts shared project watching for runtime adapters.
 */
export async function startSharedProjectWatching(options: {
	appConfig: EcoPagesAppConfig;
	refreshRouterRoutesCallback: () => Promise<void>;
	hmrManager: IHmrManager;
	bridge: IClientBridge;
}): Promise<void> {
	const watcher = new ProjectWatcher({
		config: options.appConfig,
		refreshRouterRoutesCallback: options.refreshRouterRoutesCallback,
		hmrManager: options.hmrManager,
		bridge: options.bridge,
	});

	await watcher.createWatcherSubscription();
}

/**
 * Binds a runtime HMR manager to app-owned plugin and integration state.
 */
export function bindSharedRuntimeHmrManager(appConfig: EcoPagesAppConfig, hmrManager: IHmrManager): EcoBuildPlugin[] {
	const browserBuildPlugins = getAppBrowserBuildPlugins(appConfig);
	hmrManager.setPlugins(browserBuildPlugins);

	for (const integration of appConfig.integrations) {
		integration.setHmrManager(hmrManager);
	}

	return browserBuildPlugins;
}
