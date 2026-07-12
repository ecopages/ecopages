import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { IHmrManager } from '../../types/public-types.ts';
import { RESOLVED_ASSETS_DIR } from '../../config/constants.ts';
import { disposeAppBuildRuntime } from '../../build/build-runtime.ts';
import type { ProjectWatcher } from '../../watchers/project-watcher.ts';
import { copyRuntimePublicDirIfChanged } from './copy-runtime-public-dir.ts';
import { clearAppDevClientBridge } from '../../dev/client-bridge-registry.ts';
import { clearAppHmrManager } from '../../dev/hmr-manager-registry.ts';
import { injectHmrRuntimeIntoHtmlResponse, isHtmlResponse, shouldInjectHmrHtmlResponse } from './hmr-html-response.ts';

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
 * @deprecated Use {@link attachHmrToIntegrations} instead.
 */
export function wireIntegrationHmrManagers(appConfig: EcoPagesAppConfig, hmrManager: IHmrManager): void {
	attachHmrToIntegrations(appConfig, hmrManager);
}

/**
 * Injects the dev HMR runtime into adapter-level HTML responses when watch mode is active.
 */
export async function maybeInjectAdapterHmrHtmlResponse(
	response: Response,
	options: {
		watch: boolean;
		hmrManager?: Pick<IHmrManager, 'isEnabled'>;
		hostOwnsDevClient: boolean;
	},
): Promise<Response> {
	if (
		shouldInjectHmrHtmlResponse(options.watch, options.hmrManager, options.hostOwnsDevClient) &&
		isHtmlResponse(response)
	) {
		return injectHmrRuntimeIntoHtmlResponse(response);
	}

	return response;
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
