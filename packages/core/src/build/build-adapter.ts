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
 *   `appConfig.runtime.buildExecutor`. It is intentionally narrower than
 *   `BuildAdapter` so callers that only need to issue builds do not depend
 *   on `resolve` / `getTranspileOptions`.
 * - App-owned helpers (`getAppBuildAdapter`, `getAppBuildExecutor`, and
 *   the `set*` counterparts) — the supported way for runtime code to read
 *   and mutate the active adapter per `EcoPagesAppConfig`.
 */

import type { EcoSourceTransform } from '../plugins/source-transform.ts';
import type { EcoBuildPlugin } from './build-types.ts';
import { mergeBrowserRuntimeManifests } from './browser-runtime-manifest.ts';
import { normalizeNodeRuntimeBuildOutputs } from './runtime-build-output-normalizer.ts';
import {
	createAppBuildManifest,
	getBrowserBuildPlugins,
	getServerBuildPlugins,
	type AppBuildManifest,
} from './build-manifest.ts';
import { getAppSourceTransforms } from '../plugins/source-transform.ts';
import { getJsxOwnershipPlugins } from './jsx-ownership-plugins.ts';
import { createRolldownBuildAdapter } from './rolldown-build-adapter.ts';
import { createRolldownDevBuildAdapter } from './rolldown-dev-build-adapter.ts';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { IHmrManager } from '../types/public-types.ts';

/**
 * Which backend owns the app's build pipeline.
 *
 * - `'rolldown'`: the default. Ecopages runs the build directly through
 *   its bundler-backed adapter.
 * - `'rolldown-dev'`: uses Rolldown's DevEngine for cached incremental
 *   rebuilds. Ideal for HMR and watch mode where the same entrypoints
 *   are rebuilt repeatedly.
 * - `'vite-host'`: a host runtime owns the build. {@link ViteHostBuildAdapter}
 *   is exposed as a boundary marker; any direct call into it throws.
 */
export type BuildOwnership = 'vite-host' | 'rolldown' | 'rolldown-dev';

/**
 * A single message emitted by the build backend.
 *
 * @remarks
 * Today this only carries `message`. Severity and structured fields
 * belong in a future schema bump; the current shape mirrors the
 * bundler's log output 1:1.
 */
export interface BuildLog {
	message: string;
}

/**
 * A single artifact emitted by the build backend.
 *
 * @remarks
 * `path` is the absolute on-disk path of the emitted file. For
 * filename templates that include a content-hash token, the bundler
 * returns the concrete resolved path (not the template), so callers
 * can read the file directly.
 */
export interface BuildOutput {
	path: string;
}

/**
 * Per-entrypoint dependency metadata surfaced alongside a build.
 *
 * @remarks
 * Populated from the bundler's per-chunk module list and exposed as a
 * normalized absolute-path map. Consumers (HMR invalidation, the build
 * manifest) read this without needing to know which adapter produced
 * it. The shape is preserved across adapters so historical callers
 * continue to compile.
 */
export interface BuildDependencyGraph {
	/**
	 * Normalized absolute entrypoint path mapped to every normalized
	 * absolute source input that contributed to that entrypoint's
	 * output, including the entrypoint itself.
	 */
	entrypoints: Record<string, string[]>;
}

/**
 * The full result of one `BuildAdapter.build` call.
 *
 * @remarks
 * `success === false` means the build failed and `outputs` will be
 * empty. Inspect `logs` for the error message; the original `Error` is
 * already normalized into `BuildLog` shape.
 */
export interface BuildResult {
	success: boolean;
	logs: BuildLog[];
	outputs: BuildOutput[];
	/**
	 * Per-entrypoint dependency metadata, when the backend produced it.
	 * Some backends (notably the Vite-host boundary marker) leave this
	 * undefined; callers must treat that as a valid state and fall
	 * back deterministically.
	 */
	dependencyGraph?: BuildDependencyGraph;
}

/**
 * Options accepted by every `BuildAdapter.build` call.
 *
 * @remarks
 * Fields that the adapter can forward are honored; fields that cannot
 * (currently `splitting`, `bundle`, and `outbase`) are accepted so
 * call-sites compile, but the adapter ignores them. See each field's
 * docstring for the current behavior.
 */
export interface BuildOptions {
	/**
	 * Absolute or context-root-relative source files that begin the build graph.
	 *
	 * Use a record (key → source path) when the caller needs to control chunk
	 * names. Keys become the `[name]` token in `naming`, which lets the caller
	 * embed path information that the bundler would otherwise strip.
	 */
	entrypoints: string[] | Record<string, string>;
	/** Output directory. Defaults to `dist/assets` when omitted. */
	outdir?: string;
	/**
	 * Base directory for `[dir]` placeholders in `naming`. Currently
	 * the bundled adapter derives the base from `root` directly and
	 * ignores this field.
	 */
	outbase?: string;
	/**
	 * Filename pattern for entrypoints. The bundled adapter honors
	 * `[name]`, `[hash]`, and `[ext]`. The `[dir]` token is stripped
	 * before forwarding to the bundler (rolldown does not implement it);
	 * callers that need directory structure preserved should use the
	 * record form of `entrypoints` so each key becomes its own chunk.
	 * When omitted, the bundler's default applies.
	 */
	naming?: string;
	/**
	 * Package export conditions to honor during resolution
	 * (e.g. `['import', 'browser', 'default']`).
	 */
	conditions?: string[];
	/**
	 * Global identifier replacements. Honored by the bundled adapter.
	 */
	define?: Record<string, string>;
	/** Run the bundler's minifier. Off by default. */
	minify?: boolean;
	/** Enable the bundler's tree-shaker. Defaults to `true`. */
	treeshaking?: boolean;
	/**
	 * Output target family. Accepted values: `'browser'`, `'node'`,
	 * anything else falls through to a platform-neutral setup.
	 */
	target?: string;
	/** Output module format. Accepted: `'esm'`, `'cjs'`, `'iife'`. */
	format?: string;
	/**
	 * Source map mode. Accepted: `'none'`, `'inline'`, `'external'`,
	 * `'linked'`. Anything else maps to the bundler's default (linked).
	 */
	sourcemap?: string;
	/**
	 * Historical code-splitting flag. Currently a no-op on the bundled
	 * adapter: the bundler splits by default and this flag is not
	 * forwarded. See the per-chunk naming convention in the adapter for
	 * the available control.
	 */
	splitting?: boolean;
	/** Project root used to resolve relative paths and the tsconfig lookup. */
	root?: string;
	/**
	 * Historical bundle flag. Currently a no-op on the bundled adapter:
	 * the bundler always bundles. Accepted so call-sites compile.
	 */
	bundle?: boolean;
	/**
	 * Treat `node_modules` packages as external. Honored by the bundled
	 * adapter.
	 */
	externalPackages?: boolean;
	/** Explicit list of module specifiers to leave as external imports. */
	external?: string[];
	/**
	 * JSX runtime configuration. Mirrors the bundler's `jsx` option shape.
	 */
	jsx?: {
		development?: boolean;
		factory?: string;
		fragment?: string;
		importSource?: string;
		runtime?: 'classic' | 'automatic';
		sideEffects?: boolean;
	};
	/**
	 * Runtime-agnostic `EcoBuildPlugin[]` to attach to this build. The
	 * bundled adapter translates the array via the rolldown plugin
	 * bridge.
	 */
	plugins?: EcoBuildPlugin[];
	/**
	 * App-owned source transforms for browser-targeted Rolldown builds.
	 *
	 * @remarks
	 * Applied by the Rolldown plugin bridge after first-wins `onLoad` plugins
	 * produce module contents. This is the canonical browser/HMR path for
	 * `eco-component-meta` and other transforms registered in
	 * `appConfig.sourceTransforms`. Server builds continue to use loader plugins
	 * instead; this field is ignored unless `target` is `'browser'`.
	 *
	 * {@link BrowserBundleService} forwards {@link getAppSourceTransforms} here
	 * automatically.
	 */
	sourceTransforms?: EcoSourceTransform[];
	/**
	 * Escape hatch for backends that need to forward unknown options
	 * to their underlying driver. Consumers should prefer the typed
	 * fields above.
	 */
	[key: string]: unknown;
}

/** Stable profile identifiers for `BuildAdapter.getTranspileOptions`. */
export type BuildTranspileProfile = 'browser-script' | 'hmr-runtime' | 'hmr-entrypoint';

/**
 * Resolved transpile settings for a given profile.
 *
 * @remarks
 * The three fields map 1:1 to the trio the HMR and browser-script
 * code paths look at: target platform, output format, and source-map
 * mode. Today the bundled adapter returns identical defaults for all
 * three profiles; the type is kept open so per-profile tuning can
 * land without breaking callers.
 */
export interface BuildTranspileOptions {
	target: string;
	format: string;
	sourcemap: string;
}

/**
 * Low-level build backend contract.
 *
 * @remarks
 * One instance is owned by each `EcoPagesAppConfig` (see
 * {@link getAppBuildAdapter}). Two implementations exist: the bundled
 * adapter does the work; {@link ViteHostBuildAdapter} is a host-owned
 * boundary marker that throws on direct use.
 */
export interface BuildAdapter {
	/** Which backend owns this adapter. Used for routing decisions in app helpers. */
	readonly ownership?: BuildOwnership;
	/**
	 * Run one build.
	 *
	 * @remarks
	 * Implementations are expected to be safe to call from any caller.
	 * Concurrent calls are not guaranteed to be serialized by the
	 * adapter itself; the dev-watch pipeline wraps the adapter in
	 * {@link SerializedBuildExecutor} when it needs FIFO ordering.
	 *
	 * Returns a `BuildResult` with `success: false` on failure; the
	 * thrown-error variant (`buildOrThrow`) is reserved for callers
	 * that need the original `Error` object.
	 */
	build(options: BuildOptions): Promise<BuildResult>;
	/**
	 * Resolve a module specifier against the project's `rootDir`.
	 *
	 * @remarks
	 * Used by the source-loading services when they need to know the
	 * absolute path of a specifier without performing a full build.
	 */
	resolve(importPath: string, rootDir: string): string;
	/**
	 * Resolve transpile settings for a known profile.
	 *
	 * @remarks
	 * Today the bundled adapter returns identical defaults for all
	 * profiles. The profile argument is kept so per-profile tuning
	 * can land without breaking callers.
	 */
	getTranspileOptions(profile: BuildTranspileProfile): BuildTranspileOptions;
}

/**
 * Runtime-facing facade for issuing builds.
 *
 * @remarks
 * Strictly narrower than {@link BuildAdapter}: it only exposes `build`.
 * This is the shape stored on `appConfig.runtime.buildExecutor` and
 * passed across the dev-watch and server-module-loading seams, so
 * callers cannot accidentally depend on `resolve` or
 * `getTranspileOptions`.
 *
 * In production and non-watch flows the executor is the adapter
 * itself. In development watch flows the executor is a
 * {@link SerializedBuildExecutor} wrapping the adapter so dev-watch
 * pipelines are FIFO-serialized.
 */
export interface BuildExecutor {
	build(options: BuildOptions): Promise<BuildResult>;
}

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
 * helper. Callers that issue builds against
 * `appConfig.runtime.buildExecutor` get the merged plugin set without
 * further ceremony.
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
		case 'rolldown-dev':
			return createRolldownDevBuildAdapter();
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
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		buildOwnership,
	};
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
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		buildOwnership: getBuildAdapterOwnership(buildAdapter),
		buildAdapter,
	};
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
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		buildManifest,
	};
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

/**
 * Collects the build-facing processor and integration contributions
 * that should be sealed into the app manifest during config
 * finalization.
 *
 * @remarks
 * Runs `prepareBuildContributions()` on every processor and
 * integration. Runtime-only side effects (HMR registration, cache
 * prewarming, runtime-origin wiring) belong to the startup path and
 * must not be triggered here; use {@link setupAppRuntimePlugins} for
 * those.
 *
 * @returns The new manifest's runtime / browser / browser-runtime-manifest
 * contribution buckets. Caller seals them into a manifest via
 * {@link updateAppBuildManifest}.
 */
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

/**
 * Runs runtime-only processor and integration setup against an already
 * sealed app manifest.
 *
 * @remarks
 * Startup paths call this after `ConfigBuilder.build` has finalized
 * the manifest. The manifest is reused as-is; this helper only performs
 * the runtime side effects that need live startup context (cache
 * prewarming, runtime-origin wiring, HMR manager attachment).
 *
 * Loaders, processors, and integrations are visited in that order;
 * each one's plugins are forwarded to the optional `onRuntimePlugin`
 * callback so callers can attach to every plugin discovered.
 */
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

		options.appConfig.runtime = {
			...(options.appConfig.runtime ?? {}),
			runtimeAssetsPrepared: true,
		};
	} finally {
		appLogger.debugTimeEnd('setupAppRuntimePlugins');
	}
}

/**
 * Returns the server-bundle plugin list for one app/runtime instance.
 *
 * @remarks
 * Reads from the app's sealed build manifest; the manifest itself is
 * the source of truth for which plugins participate in the server
 * bundle.
 */
export function getAppServerBuildPlugins(appConfig: EcoPagesAppConfig): EcoBuildPlugin[] {
	return getServerBuildPlugins(getAppBuildManifest(appConfig));
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
	return [...browserPlugins, ...getJsxOwnershipPlugins(appConfig)];
}

/**
 * Returns the executor owned by an app/runtime instance.
 *
 * @remarks
 * Falls back to {@link getAppBuildAdapter} when no executor is set
 * on the runtime yet. The dev-watch pipeline replaces this value with
 * a parallel route-module executor via
 * {@link installAppRuntimeBuildExecutor}.
 */
export function getAppBuildExecutor(appConfig: EcoPagesAppConfig): BuildExecutor {
	return (
		appConfig.runtime?.routeModuleBuildExecutor ?? appConfig.runtime?.buildExecutor ?? getAppBuildAdapter(appConfig)
	);
}

/** Returns the HMR browser-bundle executor when installed. */
export function getAppHmrBuildExecutor(appConfig: EcoPagesAppConfig): BuildExecutor {
	return appConfig.runtime?.hmrBuildExecutor ?? getAppBuildExecutor(appConfig);
}

/** Route-module executor (page imports, transpile). Falls back to {@link getAppBuildExecutor}. */
export function getAppRouteModuleBuildExecutor(appConfig: EcoPagesAppConfig): BuildExecutor {
	return appConfig.runtime?.routeModuleBuildExecutor ?? getAppBuildExecutor(appConfig);
}

/** Installs the default executor for one app instance (ConfigBuilder / tests). */
export function setAppBuildExecutor(appConfig: EcoPagesAppConfig, buildExecutor: BuildExecutor): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		buildExecutor,
	};
}

export function setAppHmrBuildExecutor(appConfig: EcoPagesAppConfig, buildExecutor: BuildExecutor): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		hmrBuildExecutor: buildExecutor,
	};
}

export function setAppRouteModuleBuildExecutor(appConfig: EcoPagesAppConfig, buildExecutor: BuildExecutor): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		routeModuleBuildExecutor: buildExecutor,
		buildExecutor,
	};
}

/**
 * Runs a build through the active pipeline.
 *
 * @remarks
 * `executor` defaults to the default-bundler adapter for non-app-aware
 * callsites. App-aware code should pass
 * `getAppBuildExecutor(appConfig)` (or read it directly) to honor the
 * per-app pipeline.
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
