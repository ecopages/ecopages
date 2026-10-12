import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig, IHmrManager } from '../../../types/internal-types.ts';
import { RESOLVED_ASSETS_DIR } from '../../../config/constants.ts';
import { disposeAppBuildRuntime } from '../../../build/runtime/build-runtime.ts';
import { ensureIntegrationRuntimeReady } from '../../../build/app-build-manifest-runtime.ts';
import { appLogger } from '../../../global/app-logger.ts';
import type { ProjectWatcher } from '../../../watchers/project-watcher.ts';
import { copyRuntimePublicDirIfChanged } from './copy-runtime-public-dir.ts';

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
 * Activates every configured integration after watch-mode HMR is ready.
 *
 * @remarks
 * Awaited before the server advertises listen so the first Page request does not
 * compete with cold integration `setup()`. Failures are logged and do not crash
 * the server. Concurrent first-page renders still join the same coalesced
 * {@link ensureIntegrationRuntimeReady} promise.
 */
export async function startDevWarmup(options: { appConfig: EcoPagesAppConfig; runtimeOrigin: string }): Promise<void> {
	const { appConfig, runtimeOrigin } = options;

	try {
		await Promise.all(
			appConfig.integrations.map((integration) =>
				ensureIntegrationRuntimeReady({
					appConfig,
					integrationName: integration.name,
					runtimeOrigin,
				}),
			),
		);
	} catch (error) {
		const errorDetails = error instanceof Error ? (error.stack ?? error.message) : String(error);
		appLogger.error(`Failed to prewarm integration runtimes: ${errorDetails}`);
	}
}

/**
 * Releases shared dev resources in a consistent order across server adapters.
 *
 * @remarks
 * Bun calls `ensureRuntimeReady()` during `initialize()` when watch is enabled; Node defers
 * runtime creation to `completeInitialization()`. Transport-specific setup stays in
 * each adapter — only shared teardown lives here. Integration `setup()` calls still in flight
 * settle before any `teardown()`, so a late setup cannot recreate released resources. A failed
 * integration `teardown()` still clears activation state, so the next startup runs `setup()` again.
 */
export async function disposeDevResources(options: {
	projectWatcher: ProjectWatcher | null | undefined;
	appConfig: EcoPagesAppConfig;
	hmrManager: IHmrManager | null | undefined;
	bridge: { destroy(): void } | null | undefined;
	previewHost: { stop(): Promise<void> };
}): Promise<void> {
	const cleanup = [
		() => options.projectWatcher?.close(),
		() => disposeAppBuildRuntime(options.appConfig),
		() => options.hmrManager?.stop(),
		() => options.bridge?.destroy(),
		() => options.previewHost.stop(),
		() => Promise.allSettled(options.appConfig.runtime?.integrationActivations?.values() ?? []),
		...options.appConfig.integrations.map((integration) => () => integration.teardown()),
	];
	const errors: unknown[] = [];
	for (const release of cleanup) {
		try {
			await release();
		} catch (error) {
			errors.push(error);
		}
	}
	options.appConfig.runtime?.integrationActivations?.clear();
	attachedHmrApps.delete(options.appConfig);
	if (errors.length === 1) throw errors[0];
	if (errors.length > 1) throw new AggregateError(errors, 'Failed to release dev resources');
}
