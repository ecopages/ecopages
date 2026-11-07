import { seedProcessorWatchPaths } from './cache/build-input-dependency-index.ts';
import {
	createAppBuildManifest,
	type AppBuildManifest,
	type BuildPluginRegistration,
} from './contracts/build-manifest.ts';
import { requireAppRuntime } from '../utils/app-runtime.ts';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import { startupTrace } from '../diagnostics/startup-trace.ts';
import { isLitStaticRenderWorkerThread } from './browser/lit-static-render-worker-context.ts';
import { installConfiguredServerDom } from '../plugins/server-dom.ts';

/**
 * Seals the app's build manifest from its loaders, processors and integrations.
 *
 * @remarks
 * Called during runtime assembly. Loaders come first, then processors, then integrations. Each one's
 * `plugins(app)` is read once; every registration is validated once, by {@link createAppBuildManifest}. Runtime
 * setup happens after finalization.
 */
export function sealAppBuildManifest(appConfig: EcoPagesAppConfig): AppBuildManifest {
	const registrations: BuildPluginRegistration[] = [...appConfig.loaders.values()].map((plugin) => ({
		plugin,
		source: `Loader "${plugin.name}"`,
	}));

	for (const processor of appConfig.processors.values()) {
		for (const plugin of processor.plugins(appConfig)) {
			registrations.push({ plugin, source: `Processor "${processor.name}"` });
		}
	}

	for (const integration of appConfig.integrations) {
		for (const plugin of integration.plugins(appConfig)) {
			registrations.push({ plugin, source: `Integration "${integration.name}"` });
		}
	}

	return createAppBuildManifest(registrations);
}

/**
 * Gives each Processor its app config and calls `setup()`.
 *
 * @remarks
 * When `skipProcessorSetup` is set, or this is the Lit static-render worker, each Processor
 * restores from the production server-modules map instead of scanning sources.
 */
export async function setupAppRuntimePlugins(options: {
	appConfig: EcoPagesAppConfig;
	skipProcessorSetup?: boolean;
}): Promise<void> {
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
		const skipProcessorSetup = options.skipProcessorSetup === true || isLitStaticRenderWorkerThread();

		for (const processor of options.appConfig.processors.values()) {
			processor.setContext(options.appConfig);
			if (skipProcessorSetup) {
				await processor.restoreProductionRuntime?.();
			} else {
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
 * Activates one integration's runtime setup on first use, then resolves its global scripts when the runtime's
 * `globalScriptResolution` is `'activation'`.
 *
 * @remarks
 * Concurrent callers share a single in-flight promise per integration name.
 * Server DOM install runs inside that promise, before `setup()`, so a second
 * caller cannot skip the in-flight activation. Resolution runs inside it too,
 * after a successful `setup()`, so an Integration a request activates in dev or
 * start, or after a failed warmup, has its global scripts once it is ready.
 * A `'browser-build'` runtime leaves them to {@link resolveIntegrationDependencies}.
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
		await installConfiguredServerDom(options.appConfig.integrations);
		await integration.setup({ appConfig: options.appConfig, runtime });
		if (runtime.globalScriptResolution === 'activation') await integration.refreshResolvedIntegrationDependencies();
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
			ensureIntegrationRuntimeReady({ appConfig: options.appConfig, integrationName: integration.name }),
		),
	);
}

/**
 * Fails a production export whose runtime resolves Integration global scripts at activation.
 *
 * @remarks
 * Such a runtime bundles each global script on its own into `dist/client` at its first activation, beside the copy
 * the app-wide browser build emits. Static generation calls this before it activates anything.
 */
export function requireBrowserBuildGlobalScriptResolution(appConfig: EcoPagesAppConfig): void {
	const { globalScriptResolution } = requireAppRuntime(appConfig);
	if (globalScriptResolution !== 'browser-build') {
		throw new Error(
			`A production export needs an app runtime created with globalScriptResolution 'browser-build', but it was created with '${globalScriptResolution}'. Run it through \`ecopages build\` or \`ecopages preview\`, or finalize the config with { globalScriptResolution: 'browser-build' }.`,
		);
	}
}

/**
 * Resolves each Integration's global scripts once a `'browser-build'` runtime's browser build is known.
 *
 * @remarks
 * Integration `setup()` does not resolve them. Static generation calls this after the app-wide browser build, so
 * each global script resolves to that build's output, and the Lit static-render worker calls it after restoring
 * the asset ledger. An Integration that was never set up is skipped.
 *
 * @throws When the runtime resolves at activation (see {@link requireBrowserBuildGlobalScriptResolution}).
 */
export async function resolveIntegrationDependencies(options: { appConfig: EcoPagesAppConfig }): Promise<void> {
	requireBrowserBuildGlobalScriptResolution(options.appConfig);
	for (const integration of options.appConfig.integrations) {
		await integration.refreshResolvedIntegrationDependencies();
	}
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
