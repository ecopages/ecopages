import { mergeBrowserRuntimeManifests } from './browser/browser-runtime-manifest.ts';
import { seedProcessorWatchPaths } from './cache/build-input-dependency-index.ts';
import {
	createAppBuildManifest,
	type AppBuildManifest,
	type BuildPluginRegistration,
} from './contracts/build-manifest.ts';
import { requireAppRuntime } from '../config/app-runtime.ts';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { startupTrace } from '../diagnostics/startup-trace.ts';
import { isLitStaticRenderWorkerThread } from './browser/lit-static-render-worker-context.ts';

/**
 * Seals the app's build manifest from its loaders, processors and integrations.
 *
 * @remarks
 * Called during runtime assembly. Loaders come first, then processors, then integrations. Each one's
 * `plugins(app)` is read once, and a Processor has no other method called; every registration is validated once,
 * by {@link createAppBuildManifest}. Integration browser runtime manifests stay separate declarations. An
 * Integration still receives the app config through `setConfig()` here, because its renderer and HMR hooks
 * read it before runtime activation.
 */
export function sealAppBuildManifest(appConfig: EcoPagesAppConfig): AppBuildManifest {
	const registrations: BuildPluginRegistration[] = [...appConfig.loaders.values()].map((plugin) => ({
		plugin,
		source: `Loader "${plugin.name}"`,
	}));
	const browserRuntimeManifests = [];

	for (const processor of appConfig.processors.values()) {
		for (const plugin of processor.plugins(appConfig)) {
			registrations.push({ plugin, source: `Processor "${processor.name}"` });
		}
	}

	for (const integration of appConfig.integrations) {
		integration.setConfig(appConfig);
		for (const plugin of integration.plugins(appConfig)) {
			registrations.push({ plugin, source: `Integration "${integration.name}"` });
		}
		browserRuntimeManifests.push(integration.browserRuntimeManifest);
	}

	return createAppBuildManifest(registrations, mergeBrowserRuntimeManifests(...browserRuntimeManifests));
}

export async function setupAppRuntimePlugins(options: { appConfig: EcoPagesAppConfig }): Promise<void> {
	startupTrace.markPhaseStart('setupAppRuntimePlugins');

	const runtime = requireAppRuntime(options.appConfig);
	if (runtime.runtimeAssetsPrepared) {
		appLogger.debug('Skipped setupAppRuntimePlugins: runtime assets already prepared');
		startupTrace.markPhaseEnd('setupAppRuntimePlugins');
		return;
	}

	if (isLitStaticRenderWorkerThread()) {
		appLogger.debug('Lit static-render worker: skipping processor setup (main thread already prepared artifacts)');
	}

	appLogger.debugTime('setupAppRuntimePlugins');

	try {
		const skipProcessorSetup = isLitStaticRenderWorkerThread();

		for (const processor of options.appConfig.processors.values()) {
			if (!skipProcessorSetup) {
				await processor.setup();
			}
		}

		seedProcessorWatchPaths(options.appConfig, runtime.buildInputIndex);
		runtime.runtimeAssetsPrepared = true;
	} finally {
		appLogger.debugTimeEnd('setupAppRuntimePlugins');
		startupTrace.markPhaseEnd('setupAppRuntimePlugins');
	}
}

/**
 * Activates one integration's runtime setup on first use.
 *
 * @remarks
 * Concurrent callers share a single in-flight promise per integration name.
 * Failed activations are evicted so a later caller can retry.
 */
export async function ensureIntegrationRuntimeReady(options: {
	appConfig: EcoPagesAppConfig;
	integrationName: string;
}): Promise<void> {
	const runtime = requireAppRuntime(options.appConfig);

	const existing = runtime.integrationActivations.get(options.integrationName);
	if (existing) {
		await existing;
		return;
	}

	const integration = options.appConfig.integrations.find((plugin) => plugin.name === options.integrationName);
	if (!integration) {
		return;
	}

	const activation = (async () => {
		integration.setConfig(options.appConfig);
		await integration.setup();
	})();

	runtime.integrationActivations.set(options.integrationName, activation);

	try {
		await activation;
	} catch (error) {
		runtime.integrationActivations.delete(options.integrationName);
		throw error;
	}
}
