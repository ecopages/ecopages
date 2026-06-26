import type { EcoBuildPlugin } from './build-types.ts';
import { mergeBrowserRuntimeManifests } from './browser-runtime-manifest.ts';
import type { AppBuildManifest } from './build-manifest.ts';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig, IHmrManager } from '../types/internal-types.ts';

function patchAppRuntime(
	appConfig: EcoPagesAppConfig,
	patch: Partial<NonNullable<EcoPagesAppConfig['runtime']>>,
): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		...patch,
	};
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
	hmrManager?: IHmrManager;
	onRuntimePlugin?: (plugin: EcoBuildPlugin) => void;
}): Promise<void> {
	if (options.appConfig.runtime?.runtimeAssetsPrepared) {
		appLogger.debug('Skipped setupAppRuntimePlugins: runtime assets already prepared');
		for (const loader of options.appConfig.loaders.values()) {
			options.onRuntimePlugin?.(loader);
		}
		for (const processor of options.appConfig.processors.values()) {
			if (processor.plugins) {
				for (const plugin of processor.plugins) {
					options.onRuntimePlugin?.(plugin);
				}
			}
		}
		for (const integration of options.appConfig.integrations) {
			for (const plugin of integration.plugins) {
				options.onRuntimePlugin?.(plugin);
			}
		}
		return;
	}

	appLogger.debugTime('setupAppRuntimePlugins');

	try {
		for (const loader of options.appConfig.loaders.values()) {
			options.onRuntimePlugin?.(loader);
		}

		for (const processor of options.appConfig.processors.values()) {
			await processor.setup();

			if (processor.plugins) {
				for (const plugin of processor.plugins) {
					options.onRuntimePlugin?.(plugin);
				}
			}
		}

		for (const integration of options.appConfig.integrations) {
			integration.setConfig(options.appConfig);
			integration.setRuntimeOrigin(options.runtimeOrigin);
			if (options.hmrManager) {
				integration.setHmrManager(options.hmrManager);
			}

			await integration.setup();

			for (const plugin of integration.plugins) {
				options.onRuntimePlugin?.(plugin);
			}
		}

		patchAppRuntime(options.appConfig, { runtimeAssetsPrepared: true });
	} finally {
		appLogger.debugTimeEnd('setupAppRuntimePlugins');
	}
}
