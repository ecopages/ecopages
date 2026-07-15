import type { EcoBuildPlugin } from './build-types.ts';
import { mergeBrowserRuntimeManifests } from './browser-runtime-manifest.ts';
import type { AppBuildManifest } from './build-manifest.ts';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { startupTrace } from '../diagnostics/startup-trace.ts';
import { isLitStaticRenderWorkerThread } from './lit-static-render-worker-context.ts';

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
		onRuntimePlugin?.(loader);
	}

	for (const processor of appConfig.processors.values()) {
		if (processor.plugins) {
			for (const plugin of processor.plugins) {
				onRuntimePlugin?.(plugin);
			}
		}
	}

	for (const integration of appConfig.integrations) {
		for (const plugin of integration.plugins) {
			onRuntimePlugin?.(plugin);
		}
	}
}

export async function collectConfiguredAppBuildManifestContributions(
	appConfig: EcoPagesAppConfig,
): Promise<Pick<AppBuildManifest, 'runtimePlugins' | 'browserBundlePlugins' | 'browserRuntimeManifest'>> {
	const runtimePlugins: EcoBuildPlugin[] = [];
	const browserBundlePlugins: EcoBuildPlugin[] = [];
	const browserRuntimeManifests = [];

	for (const processor of appConfig.processors.values()) {
		await processor.prepareBuildContributions();

		if (processor.plugins) {
			runtimePlugins.push(...processor.plugins);
		}

		if (processor.buildPlugins) {
			browserBundlePlugins.push(...processor.buildPlugins);
		}
	}

	for (const integration of appConfig.integrations) {
		integration.setConfig(appConfig);
		await integration.prepareBuildContributions();
		runtimePlugins.push(...(integration.plugins ?? []));
		browserBundlePlugins.push(...(integration.browserBuildPlugins ?? []));
		browserRuntimeManifests.push(integration.browserRuntimeManifest);
	}

	return {
		runtimePlugins,
		browserBundlePlugins,
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
			options.onRuntimePlugin?.(loader);
		}

		const skipProcessorSetup = isLitStaticRenderWorkerThread();

		for (const processor of options.appConfig.processors.values()) {
			if (!skipProcessorSetup) {
				await processor.setup();
			}

			if (processor.plugins) {
				for (const plugin of processor.plugins) {
					options.onRuntimePlugin?.(plugin);
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
 */
export async function ensureIntegrationRuntimeReady(options: {
	appConfig: EcoPagesAppConfig;
	integrationName: string;
	runtimeOrigin: string;
	onRuntimePlugin?: (plugin: EcoBuildPlugin) => void;
}): Promise<void> {
	const runtime = options.appConfig.runtime ?? {};
	options.appConfig.runtime = runtime;
	runtime.activatedIntegrations ??= new Set<string>();

	if (runtime.activatedIntegrations.has(options.integrationName)) {
		return;
	}

	const integration = options.appConfig.integrations.find((plugin) => plugin.name === options.integrationName);
	if (!integration) {
		return;
	}

	integration.setConfig(options.appConfig);
	integration.setRuntimeOrigin(options.runtimeOrigin);
	await integration.setup();

	const onRuntimePlugin = options.onRuntimePlugin ?? options.appConfig.runtime?.onRuntimePlugin;
	for (const plugin of integration.plugins ?? []) {
		onRuntimePlugin?.(plugin);
	}

	runtime.activatedIntegrations.add(options.integrationName);
}
