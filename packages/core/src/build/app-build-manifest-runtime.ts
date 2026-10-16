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
 * `plugins(app)` is read once; every registration is validated once, by {@link createAppBuildManifest}. Browser
 * runtime manifests are data, not lifecycle hooks. Runtime setup happens after finalization.
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
			processor.setContext(options.appConfig);
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
		await integration.setup({ appConfig: options.appConfig, runtime });
	})();

	runtime.integrationActivations.set(options.integrationName, activation);

	try {
		await activation;
	} catch (error) {
		runtime.integrationActivations.delete(options.integrationName);
		throw error;
	}
}

export async function setupAppRuntimeIntegrations(options: { appConfig: EcoPagesAppConfig }): Promise<void> {
	await Promise.all(
		options.appConfig.integrations.map((integration) =>
			ensureIntegrationRuntimeReady({
				appConfig: options.appConfig,
				integrationName: integration.name,
			}),
		),
	);
}

/**
 * Releases runtime resources owned by the app's Integrations.
 *
 * @remarks
 * Waits for in-flight setup calls before teardown and clears activation state after each activated Integration
 * has had a chance to release its resources.
 */
export async function teardownAppRuntimeIntegrations(options: { appConfig: EcoPagesAppConfig }): Promise<void> {
	const runtime = requireAppRuntime(options.appConfig);
	const activeIntegrations = new Set(runtime.integrationActivations.keys());
	await Promise.allSettled(runtime.integrationActivations.values());

	const errors: unknown[] = [];
	for (const integration of options.appConfig.integrations) {
		if (!activeIntegrations.has(integration.name)) continue;

		try {
			await integration.teardown();
		} catch (error) {
			errors.push(error);
		}
	}
	runtime.integrationActivations.clear();

	if (errors.length === 1) throw errors[0];
	if (errors.length > 1) throw new AggregateError(errors, 'Failed to release Integration runtime resources');
}
