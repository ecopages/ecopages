import type { EcoBuildPlugin } from './contracts/build-types.ts';
import { mergeBrowserRuntimeManifests } from './browser/browser-runtime-manifest.ts';
import type { AppBuildManifest } from './contracts/build-manifest.ts';
import { validateBuildPluginRegistrations } from './contracts/build-manifest.ts';
import { appliesToBuildEnvironment } from './contracts/build-manifest.ts';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { startupTrace } from '../diagnostics/startup-trace.ts';
import { isLitStaticRenderWorkerThread } from './browser/lit-static-render-worker-context.ts';

function patchAppRuntime(
	appConfig: EcoPagesAppConfig,
	patch: Partial<NonNullable<EcoPagesAppConfig['runtime']>>,
): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		...patch,
	};
}

function registerRuntimePlugins(
	appConfig: EcoPagesAppConfig,
	onRuntimePlugin?: (plugin: EcoBuildPlugin) => void,
): void {
	for (const loader of appConfig.loaders.values()) {
		if (appliesToBuildEnvironment(loader, 'server')) onRuntimePlugin?.(loader);
	}

	for (const processor of appConfig.processors.values()) {
		if (processor.plugins) {
			for (const plugin of processor.plugins) {
				if (appliesToBuildEnvironment(plugin, 'server')) onRuntimePlugin?.(plugin);
			}
		}
	}

	for (const integration of appConfig.integrations) {
		for (const plugin of integration.plugins) {
			if (appliesToBuildEnvironment(plugin, 'server')) onRuntimePlugin?.(plugin);
		}
	}
}

/**
 * Collects integration and processor contributions before the app build manifest is sealed.
 *
 * @remarks
 * Called during config finalization via {@link updateAppBuildManifest}. Walks
 * processors first, then integrations, invoking {@link Processor.prepareBuildContributions}
 * and {@link IntegrationPlugin.prepareBuildContributions} so dynamic plugin lists can be
 * materialized before sealing.
 *
 * Both contributor kinds expose `plugins`, selected by each plugin's environments.
 * Integration browser runtime manifests remain separate declarations.
 *
 * Loaders are not collected here; {@link createConfiguredAppBuildManifest} always takes
 * them from `appConfig.loaders`.
 */
export async function collectConfiguredAppBuildManifestContributions(
	appConfig: EcoPagesAppConfig,
): Promise<AppBuildManifest> {
	const registrations = [...appConfig.loaders.values()].map((plugin) => ({
		plugin,
		source: `Loader "${plugin.name}"`,
	}));
	const plugins: EcoBuildPlugin[] = [];
	const browserRuntimeManifests = [];

	for (const processor of appConfig.processors.values()) {
		await processor.prepareBuildContributions();

		for (const plugin of processor.plugins ?? []) {
			plugins.push(plugin);
			registrations.push({ plugin, source: `Processor "${processor.name}"` });
		}
	}

	for (const integration of appConfig.integrations) {
		integration.setConfig(appConfig);
		await integration.prepareBuildContributions();
		for (const plugin of integration.plugins) {
			plugins.push(plugin);
			registrations.push({ plugin, source: `Integration "${integration.name}"` });
		}
		browserRuntimeManifests.push(integration.browserRuntimeManifest);
	}

	validateBuildPluginRegistrations(registrations);
	return {
		plugins,
		browserRuntimeManifest: mergeBrowserRuntimeManifests(...browserRuntimeManifests),
	};
}

export async function setupAppRuntimePlugins(options: {
	appConfig: EcoPagesAppConfig;
	runtimeOrigin: string;
	onRuntimePlugin?: (plugin: EcoBuildPlugin) => void;
}): Promise<void> {
	startupTrace.markPhaseStart('setupAppRuntimePlugins');

	if (options.appConfig.runtime?.runtimeAssetsPrepared) {
		appLogger.debug('Skipped setupAppRuntimePlugins: runtime assets already prepared');
		registerRuntimePlugins(options.appConfig, options.onRuntimePlugin);
		startupTrace.markPhaseEnd('setupAppRuntimePlugins');
		return;
	}

	if (isLitStaticRenderWorkerThread()) {
		appLogger.debug('Lit static-render worker: skipping processor setup (main thread already prepared artifacts)');
	}

	appLogger.debugTime('setupAppRuntimePlugins');

	try {
		if (options.onRuntimePlugin) {
			patchAppRuntime(options.appConfig, { onRuntimePlugin: options.onRuntimePlugin });
		}

		for (const loader of options.appConfig.loaders.values()) {
			if (appliesToBuildEnvironment(loader, 'server')) options.onRuntimePlugin?.(loader);
		}

		const skipProcessorSetup = isLitStaticRenderWorkerThread();

		for (const processor of options.appConfig.processors.values()) {
			if (!skipProcessorSetup) {
				await processor.setup();
			}

			if (processor.plugins) {
				for (const plugin of processor.plugins) {
					if (appliesToBuildEnvironment(plugin, 'server')) options.onRuntimePlugin?.(plugin);
				}
			}
		}

		patchAppRuntime(options.appConfig, { runtimeAssetsPrepared: true });
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
	runtimeOrigin: string;
	onRuntimePlugin?: (plugin: EcoBuildPlugin) => void;
}): Promise<void> {
	const runtime = options.appConfig.runtime ?? {};
	options.appConfig.runtime = runtime;
	runtime.integrationActivations ??= new Map<string, Promise<void>>();

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
		integration.setRuntimeOrigin(options.runtimeOrigin);
		await integration.setup();

		const onRuntimePlugin = options.onRuntimePlugin ?? options.appConfig.runtime?.onRuntimePlugin;
		for (const plugin of integration.plugins ?? []) {
			if (appliesToBuildEnvironment(plugin, 'server')) onRuntimePlugin?.(plugin);
		}
	})();

	runtime.integrationActivations.set(options.integrationName, activation);

	try {
		await activation;
	} catch (error) {
		runtime.integrationActivations.delete(options.integrationName);
		throw error;
	}
}
