import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { IHmrManager } from '../../../types/public-types.ts';
import { RESOLVED_ASSETS_DIR } from '../../../config/constants.ts';
import { disposeAppBuildRuntime } from '../../../build/runtime/build-runtime.ts';
import { ensureIntegrationRuntimeReady } from '../../../build/app-build-manifest-runtime.ts';
import { appLogger } from '../../../global/app-logger.ts';
import type { ProjectWatcher } from '../../../watchers/project-watcher.ts';
import { copyRuntimePublicDirIfChanged } from './copy-runtime-public-dir.ts';
import { clearAppDevClientBridge } from '../../../dev/client-bridge-registry.ts';
import { clearAppHmrManager } from '../../../dev/hmr-manager-registry.ts';

/**
 * Copies source `public/` into dist and ensures the resolved assets directory exists.
 */
export function prepareRuntimePublicDir(appConfig: EcoPagesAppConfig): void {
	const srcPublicDir = path.join(appConfig.rootDir, appConfig.srcDir, appConfig.publicDir);

	if (fileSystem.exists(srcPublicDir)) {
		copyRuntimePublicDirIfChanged(srcPublicDir, path.join(appConfig.rootDir, appConfig.distDir));
	}

	fileSystem.ensureDir(path.join(appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR));
}

const attachedHmrApps = new WeakSet<EcoPagesAppConfig>();

/**
 * Attaches the shared HMR manager to every integration exactly once per app config.
 *
 * @remarks
 * Runtime plugin setup must not call `integration.setHmrManager()` directly. Adapters invoke
 * this after the manager is enabled so late plugin init cannot double-bind integrations.
 */
export function attachHmrToIntegrations(appConfig: EcoPagesAppConfig, hmrManager: IHmrManager): void {
	if (attachedHmrApps.has(appConfig)) {
		return;
	}

	attachedHmrApps.add(appConfig);

	for (const integration of appConfig.integrations) {
		integration.setHmrManager(hmrManager);
	}
}

/**
 * Starts background activation of every configured integration after watch-mode HMR is ready.
 *
 * @remarks
 * Fire-and-forget: overlaps with watcher setup so first-page render can join the same
 * coalesced {@link ensureIntegrationRuntimeReady} promise instead of paying a cold vendor build.
 * Failures are logged and do not crash the server.
 */
export function startDevWarmup(options: { appConfig: EcoPagesAppConfig; runtimeOrigin: string }): void {
	const { appConfig, runtimeOrigin } = options;

	void Promise.all(
		appConfig.integrations.map((integration) =>
			ensureIntegrationRuntimeReady({
				appConfig,
				integrationName: integration.name,
				runtimeOrigin,
			}),
		),
	).catch((error) => {
		appLogger.error(
			`Failed to prewarm integration runtimes: ${error instanceof Error ? error.message : String(error)}`,
		);
	});
}

/** Returns whether background cold client-graph prewarm is enabled. */
export function isDevColdClientGraphEnabled(): boolean {
	return process.env.ECOPAGES_DEV_COLD_CLIENT_GRAPH !== 'false';
}

/**
 * Starts background cold client-graph prewarm for every integration that supports it.
 */
export function startConfiguredClientGraphPrewarm(options: {
	appConfig: EcoPagesAppConfig;
	templateRouteFilePaths: readonly string[];
	hmrEnabled: boolean;
}): void {
	if (!options.hmrEnabled || !isDevColdClientGraphEnabled()) {
		return;
	}

	for (const integration of options.appConfig.integrations) {
		integration.startDevClientGraphPrewarm?.({
			appConfig: options.appConfig,
			templateRouteFilePaths: options.templateRouteFilePaths,
		});
	}
}

/**
 * Waits for integration-owned cold client-graph batches when blocking mode is enabled.
 */
export async function awaitConfiguredClientGraphPrewarm(appConfig: EcoPagesAppConfig): Promise<void> {
	if (!isDevColdClientGraphEnabled() || process.env.ECOPAGES_DEV_COLD_CLIENT_GRAPH_BLOCKING !== 'true') {
		return;
	}

	await Promise.all(appConfig.integrations.map((integration) => integration.awaitDevClientGraphPrewarm()));
}

/**
 * Releases shared dev resources in a consistent order across server adapters.
 *
 * @remarks
 * Bun calls `buildRuntime()` during `initialize()` when watch is enabled; Node defers
 * runtime creation to `completeInitialization()`. Transport-specific setup stays in
 * each adapter — only shared teardown lives here.
 */
export async function disposeDevResources(options: {
	projectWatcher: ProjectWatcher | null | undefined;
	appConfig: EcoPagesAppConfig;
	hmrManager: IHmrManager | null | undefined;
	bridge: { destroy(): void } | null | undefined;
	previewHost: { stop(): Promise<void> };
}): Promise<void> {
	await options.projectWatcher?.close();
	await disposeAppBuildRuntime(options.appConfig);
	options.hmrManager?.stop();
	options.bridge?.destroy();
	clearAppDevClientBridge(options.appConfig);
	clearAppHmrManager(options.appConfig);
	await options.previewHost.stop();
}
