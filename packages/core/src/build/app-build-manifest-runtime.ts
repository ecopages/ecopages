import type { EcoBuildPlugin } from './build-types.ts';
import { mergeBrowserRuntimeManifests } from './browser-runtime-manifest.ts';
import type { AppBuildManifest } from './build-manifest.ts';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { startupTrace } from '../diagnostics/startup-trace.ts';

function patchAppRuntime(
	appConfig: EcoPagesAppConfig,
	patch: Partial<NonNullable<EcoPagesAppConfig['runtime']>>,
): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		...patch,
	};
}

/** Returns whether runtime plugin setup runs inside the Lit static-render worker thread. */
function isLitStaticRenderWorkerThread(): boolean {
	return process.env.ECOPAGES_LIT_STATIC_RENDER_WORKER === 'true';
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

		for (const integration of options.appConfig.integrations) {
			integration.setConfig(options.appConfig);
			integration.setRuntimeOrigin(options.runtimeOrigin);

			await integration.setup();

			for (const plugin of integration.plugins) {
				options.onRuntimePlugin?.(plugin);
			}
		}

		patchAppRuntime(options.appConfig, { runtimeAssetsPrepared: true });
	} finally {
		appLogger.debugTimeEnd('setupAppRuntimePlugins');
		startupTrace.markPhaseEnd('setupAppRuntimePlugins');
	}
}
