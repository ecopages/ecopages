import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { requireAppRuntime } from '../../../config/app-runtime.ts';
import type { EcoPagesAppConfig, IHmrManager } from '../../../types/internal-types.ts';
import { RESOLVED_ASSETS_DIR } from '../../../config/constants.ts';
import {
	ensureIntegrationRuntimeReady,
	teardownAppRuntimeIntegrations,
} from '../../../build/app-build-manifest-runtime.ts';
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

/**
 * Registers each Integration's development behavior once per app runtime.
 *
 * @remarks
 * Adapters invoke this after the HMR manager is installed on `AppRuntime`.
 */
export function attachHmrToIntegrations(appConfig: EcoPagesAppConfig): void {
	const runtime = requireAppRuntime(appConfig);
	if (runtime.hmrAttachedToIntegrations) {
		return;
	}

	runtime.hmrAttachedToIntegrations = true;

	for (const integration of appConfig.integrations) {
		integration.hmr({ appConfig, runtime });
	}
}

/**
 * Activates every configured integration after watch-mode HMR is ready.
 *
 * @remarks
 * Awaited before network request readiness is released, so requests do not
 * compete with cold Integration `setup()`. The listener may already be bound.
 * Failures are logged after all setup attempts settle and do not crash the
 * server. Concurrent first-page renders still join the same coalesced
 * {@link ensureIntegrationRuntimeReady} promise.
 */
export async function startDevWarmup(options: { appConfig: EcoPagesAppConfig }): Promise<void> {
	const { appConfig } = options;
	const results = await Promise.allSettled(
		appConfig.integrations.map((integration) =>
			ensureIntegrationRuntimeReady({
				appConfig,
				integrationName: integration.name,
			}),
		),
	);

	for (const [index, result] of results.entries()) {
		if (result.status === 'rejected') {
			const integrationName = appConfig.integrations[index]?.name ?? 'unknown';
			const errorDetails =
				result.reason instanceof Error ? (result.reason.stack ?? result.reason.message) : String(result.reason);
			appLogger.error(`Failed to prewarm Integration "${integrationName}": ${errorDetails}`);
		}
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
	hmrManager?: IHmrManager | null | undefined;
	bridge: { destroy(): void } | null | undefined;
	stopPreviewServer: () => Promise<void>;
}): Promise<void> {
	const runtime = requireAppRuntime(options.appConfig);
	const hmrManager = options.hmrManager ?? runtime.hmr;
	const cleanup = [
		() => options.projectWatcher?.close(),
		() => hmrManager?.stop(),
		() => options.bridge?.destroy(),
		options.stopPreviewServer,
		() => teardownAppRuntimeIntegrations({ appConfig: options.appConfig }),
	];
	const errors: unknown[] = [];
	for (const release of cleanup) {
		try {
			await release();
		} catch (error) {
			errors.push(error);
		}
	}
	runtime.hmr = null;
	runtime.hmrAttachedToIntegrations = false;
	if (errors.length === 1) throw errors[0];
	if (errors.length > 1) throw new AggregateError(errors, 'Failed to release dev resources');
}
