/**
 * Build pipeline contracts and app-owned adapter wiring.
 *
 * @remarks
 * The build layer exposes three concentric shapes:
 *
 * - `BuildAdapter` — the low-level backend contract. Two implementations
 *   exist: a bundler-backed adapter (the real backend) and
 *   {@link ViteHostBuildAdapter} (a host-owned boundary marker that throws
 *   on direct use, for host runtimes that own their own build pipeline).
 * - `BuildExecutor` — the runtime-facing facade stored on
 *   `appConfig.runtime.buildRuntime` via profile-based accessors.
 * - App-owned helpers (`getAppBuildAdapter` and the `set*` counterparts) —
 *   the supported way for runtime code to read and mutate the active adapter
 *   per `EcoPagesAppConfig`. Profile executors live on
 *   `appConfig.runtime.buildRuntime`.
 */

import type { EcoBuildPlugin } from './build-types.ts';
import { normalizeNodeRuntimeBuildOutputs } from './runtime-build-output-normalizer.ts';
import {
	type BuildAdapter,
	type BuildExecutor,
	type BuildOptions,
	type BuildOwnership,
	type BuildResult,
	type BuildTranspileOptions,
	type BuildTranspileProfile,
} from './build-contracts.ts';
export type {
	BuildAdapter,
	BuildDependencyGraph,
	BuildExecutor,
	BuildLog,
	BuildOptions,
	BuildOutput,
	BuildOwnership,
	BuildResult,
	BuildTranspileOptions,
	BuildTranspileProfile,
} from './build-contracts.ts';
import {
	createAppBuildManifest,
	getBrowserBuildPlugins,
	getServerBuildPlugins,
	type AppBuildManifest,
} from './build-manifest.ts';
import { getAppSourceTransforms } from '../plugins/source-transform.ts';
import { createAliasResolverPlugin } from '../plugins/alias-resolver-plugin.ts';
import { getJsxOwnershipPlugins } from './jsx-ownership-plugins.ts';
import { createRolldownBuildAdapter } from './rolldown-build-adapter.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';

/**
 * Merges `appPlugins` into an existing `plugins` array, deduping by
 * `plugin.name` so the app-owned manifest always wins on collision.
 *
 * @remarks
 * The last write wins because the function intentionally lets the
 * caller-supplied list override a manifest entry. Tests that exercise
 * this behavior live in `build-adapter.test.ts`.
 */
function mergeBuildExecutorPlugins(
	existing: EcoBuildPlugin[] | undefined,
	appPlugins: EcoBuildPlugin[],
): EcoBuildPlugin[] {
	if (!existing || existing.length === 0) {
		return appPlugins;
	}
	const byName = new Map<string, EcoBuildPlugin>();
	for (const plugin of existing) {
		byName.set(plugin.name, plugin);
	}
	for (const plugin of appPlugins) {
		byName.set(plugin.name, plugin);
	}
	return Array.from(byName.values());
}

/**
 * Wraps a {@link BuildExecutor} so each call to `build` receives the
 * union of the caller's `options.plugins` and the plugins sourced
 * from `getPlugins()`.
 *
 * @remarks
 * The single point of plugin injection in the runtime path: the
 * `ConfigBuilder` stores a raw adapter on
 * `appConfig.runtime.buildAdapter` and the
 * `installAppRuntimeBuildExecutor` step wraps that adapter with this
 * helper. Callers that issue builds through
 * `requireBuildRuntime(appConfig).getProfile(...)` get the merged plugin set
 * without further ceremony.
 */
export function withBuildExecutorPlugins(executor: BuildExecutor, getPlugins: () => EcoBuildPlugin[]): BuildExecutor {
	return {
		async build(options: BuildOptions): Promise<BuildResult> {
			const appPlugins = getPlugins();
			if (appPlugins.length === 0) {
				return executor.build(options);
			}
			return executor.build({
				...options,
				plugins: mergeBuildExecutorPlugins(options.plugins, appPlugins),
			});
		},
	};
}

/**
 * @remarks
 * All runtime-bag setters funnel through here so `appConfig.runtime` is patched
 * in one place instead of repeating the spread-merge at every call site.
 */
function patchAppRuntime(
	appConfig: EcoPagesAppConfig,
	patch: Partial<NonNullable<EcoPagesAppConfig['runtime']>>,
): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		...patch,
	};
}

function createHostOwnedBuildError(methodName: string): Error {
	return new Error(
		`Vite-hosted builds are owned by the host runtime. Core cannot ${methodName} through the host-owned compatibility adapter.`,
	);
}

/**
 * Boundary-marker adapter for Vite-host ownership.
 *
 * @remarks
 * This is not a real backend. It exists so `appConfig.runtime.buildAdapter`
 * can carry the `'vite-host'` ownership without falling back to a
 * framework-owned bundler path. Every method throws a
 * {@link createHostOwnedBuildError} so misrouted calls fail loudly
 * with a clear message instead of silently executing under a
 * different backend.
 *
 * The class stays in the public surface for host runtimes that own
 * their build pipeline (e.g. Nitro) and for app code that wants to
 * opt into host-owned ownership before its host wires up the build.
 */
export class ViteHostBuildAdapter implements BuildAdapter {
	readonly ownership = 'vite-host' as const;

	async build(_options: BuildOptions): Promise<BuildResult> {
		throw createHostOwnedBuildError('build');
	}

	resolve(_importPath: string, _rootDir: string): string {
		throw createHostOwnedBuildError('resolve imports');
	}

	getTranspileOptions(_profile: BuildTranspileProfile): BuildTranspileOptions {
		throw createHostOwnedBuildError('derive transpile options');
	}
}

/**
 * Constructs a {@link ViteHostBuildAdapter}. Use only in code paths
 * that explicitly opt into the host-owned boundary.
 */
export function createViteHostBuildAdapter(): BuildAdapter {
	return new ViteHostBuildAdapter();
}

/**
 * Constructs a build adapter for the given ownership.
 *
 * @param options - When `options.ownership` is omitted, the default is
 * `'rolldown'`. The Vite-host path is opt-in.
 */
export function createBuildAdapter(options?: { ownership?: BuildOwnership }): BuildAdapter {
	switch (options?.ownership ?? 'rolldown') {
		case 'vite-host':
			return createViteHostBuildAdapter();
		case 'rolldown':
		default:
			return createRolldownBuildAdapter();
	}
}

/** The shared default-bundler backend instance. Use {@link getAppBuildAdapter} in app-aware code. */
export const defaultRolldownBuildAdapter: BuildAdapter = createBuildAdapter({ ownership: 'rolldown' });

/** The shared Vite-host boundary instance. Use {@link getAppBuildAdapter} in app-aware code. */
export const defaultViteHostBuildAdapter: BuildAdapter = createBuildAdapter({ ownership: 'vite-host' });

/**
 * Global default build adapter.
 *
 * @remarks
 * Resolves to the bundled default-bundler adapter. New app-aware
 * code should prefer {@link getAppBuildAdapter}.
 */
export const defaultBuildAdapter: BuildAdapter = defaultRolldownBuildAdapter;

/**
 * Resolves the default build adapter for an ownership value.
 *
 * @param ownership - Defaults to `'rolldown'`. Returns the
 * {@link ViteHostBuildAdapter} only when the caller explicitly asks
 * for `'vite-host'`.
 */
export function getDefaultBuildAdapter(ownership: BuildOwnership = 'rolldown'): BuildAdapter {
	return ownership === 'vite-host' ? defaultViteHostBuildAdapter : defaultRolldownBuildAdapter;
}

/**
 * Reads the {@link BuildOwnership} declared on a {@link BuildAdapter}.
 *
 * @param buildAdapter - When `undefined`, defaults to `'rolldown'`.
 */
export function getBuildAdapterOwnership(buildAdapter: BuildAdapter | undefined): BuildOwnership {
	return buildAdapter?.ownership ?? 'rolldown';
}

/**
 * Resolves the build ownership of an app config.
 *
 * @remarks
 * Resolution order: `appConfig.runtime.buildOwnership` (explicit), then
 * the ownership declared on `appConfig.runtime.buildAdapter`, then the
 * default `'rolldown'`.
 */
export function getAppBuildOwnership(appConfig: EcoPagesAppConfig): BuildOwnership {
	return appConfig.runtime?.buildOwnership ?? getBuildAdapterOwnership(appConfig.runtime?.buildAdapter);
}

/**
 * Sets the explicit build ownership on an app config.
 *
 * @remarks
 * The `ConfigBuilder` uses this when the caller calls
 * `setBuildOwnership`. App code that needs a different ownership
 * should call this directly with a new value; passing the same
 * value is a no-op.
 */
export function setAppBuildOwnership(appConfig: EcoPagesAppConfig, buildOwnership: BuildOwnership): void {
	patchAppRuntime(appConfig, { buildOwnership });
}

/**
 * Returns the adapter owned by an app/runtime instance.
 *
 * @remarks
 * Falls back through `appConfig.runtime.buildAdapter` →
 * {@link getDefaultBuildAdapter} on the resolved ownership. Throws
 * never; a missing adapter resolves to the global default.
 */
export function getAppBuildAdapter(appConfig: EcoPagesAppConfig): BuildAdapter {
	return appConfig.runtime?.buildAdapter ?? getDefaultBuildAdapter(getAppBuildOwnership(appConfig));
}

/**
 * Installs the adapter that should serve future builds for one app
 * instance, and aligns the ownership field to the new adapter's
 * declared ownership.
 */
export function setAppBuildAdapter(appConfig: EcoPagesAppConfig, buildAdapter: BuildAdapter): void {
	patchAppRuntime(appConfig, {
		buildOwnership: getBuildAdapterOwnership(buildAdapter),
		buildAdapter,
	});
}

/**
 * Returns the build manifest owned by an app/runtime instance.
 *
 * @remarks
 * Falls back to a fresh manifest seeded from the config's loaders when
 * the app config has no manifest yet. This is the supported way to
 * read the manifest across the source-loading and asset-processing
 * services.
 */
export function getAppBuildManifest(appConfig: EcoPagesAppConfig): AppBuildManifest {
	return (
		appConfig.runtime?.buildManifest ??
		createAppBuildManifest({
			loaderPlugins: Array.from(appConfig.loaders?.values() ?? []),
		})
	);
}

/** Installs the build manifest that should be visible to one app instance. */
export function setAppBuildManifest(appConfig: EcoPagesAppConfig, buildManifest: AppBuildManifest): void {
	patchAppRuntime(appConfig, { buildManifest });
}

/**
 * Builds a fresh app manifest from the config's loaders plus optional
 * caller-supplied runtime/browser contributions.
 *
 * @remarks
 * Loader plugins are always taken from the config; runtime and
 * browser-bundle plugins are passed through from the caller when
 * supplied, otherwise left empty for later population by
 * {@link collectConfiguredAppBuildManifestContributions}.
 */
export function createConfiguredAppBuildManifest(
	appConfig: EcoPagesAppConfig,
	input?: Partial<AppBuildManifest>,
): AppBuildManifest {
	return createAppBuildManifest({
		loaderPlugins: input?.loaderPlugins ?? Array.from(appConfig.loaders.values()),
		runtimePlugins: input?.runtimePlugins,
		browserBundlePlugins: input?.browserBundlePlugins,
		browserRuntimeManifest: input?.browserRuntimeManifest,
	});
}

/**
 * Replaces the app-owned manifest using config-owned loaders and the
 * caller-supplied contribution input.
 */
export function updateAppBuildManifest(appConfig: EcoPagesAppConfig, input?: Partial<AppBuildManifest>): void {
	setAppBuildManifest(appConfig, createConfiguredAppBuildManifest(appConfig, input));
}

export {
	collectConfiguredAppBuildManifestContributions,
	ensureIntegrationRuntimeReady,
	setupAppRuntimePlugins,
} from './app-build-manifest-runtime.ts';

/**
 * Returns the server-bundle plugin list for one app/runtime instance.
 *
 * @remarks
 * Reads from the app's sealed build manifest; the manifest itself is
 * the source of truth for which plugins participate in the server
 * bundle.
 */
export function getAppServerBuildPlugins(appConfig: EcoPagesAppConfig): EcoBuildPlugin[] {
	const projectDir = appConfig.absolutePaths?.projectDir;
	const aliasPlugin = projectDir ? [createAliasResolverPlugin(projectDir)] : [];
	return [...aliasPlugin, ...getServerBuildPlugins(getAppBuildManifest(appConfig))];
}

/**
 * Returns the browser-bundle plugin list for one app/runtime instance.
 *
 * @remarks
 * Reads from the app's sealed build manifest. The browser-bundle
 * manifest is the source of truth for which plugins participate in the
 * browser bundle.
 *
 * Plugins whose `name` matches a registered {@link EcoSourceTransform} are
 * excluded here because browser builds run those transforms via the Rolldown
 * bridge post-load pass instead of as competing `onLoad` handlers.
 */
export function getAppBrowserBuildPlugins(appConfig: EcoPagesAppConfig): EcoBuildPlugin[] {
	const manifest = getAppBuildManifest(appConfig);
	const sourceTransformNames = new Set(getAppSourceTransforms(appConfig).map((transform) => transform.name));
	const browserPlugins = getBrowserBuildPlugins(manifest).filter((plugin) => !sourceTransformNames.has(plugin.name));
	const projectDir = appConfig.absolutePaths?.projectDir;
	const aliasPlugin = projectDir ? [createAliasResolverPlugin(projectDir)] : [];
	return [...aliasPlugin, ...browserPlugins, ...getJsxOwnershipPlugins(appConfig)];
}

/**
 * Runs a build through the active pipeline.
 *
 * @remarks
 * `executor` defaults to the default-bundler adapter for non-app-aware
 * callsites. App-aware code should pass a profile executor from
 * {@link requireBuildRuntime} to honor the per-app pipeline.
 */
export function build(
	options: BuildOptions,
	executor: BuildExecutor = defaultRolldownBuildAdapter,
): Promise<BuildResult> {
	return executor.build(options).then((result) => {
		if (result.success) {
			normalizeNodeRuntimeBuildOutputs(
				result.outputs.map((output) => output.path),
				options.root ?? process.cwd(),
			);
		}

		return result;
	});
}

/**
 * Default transpile-options helper for callsites without app runtime
 * context.
 *
 * @remarks
 * New app-aware code should prefer {@link getAppTranspileOptions}.
 */
export function getTranspileOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
	return defaultRolldownBuildAdapter.getTranspileOptions(profile);
}

/**
 * Resolves transpile options for one app/runtime instance by asking
 * the app's adapter.
 */
export function getAppTranspileOptions(
	appConfig: EcoPagesAppConfig,
	profile: BuildTranspileProfile,
): BuildTranspileOptions {
	return getAppBuildAdapter(appConfig).getTranspileOptions(profile);
}
