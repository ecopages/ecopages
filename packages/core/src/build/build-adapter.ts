import type { BunPlugin } from 'bun';
import type { EcoBuildPlugin } from './build-types.ts';
import {
	createAppBuildManifest,
	getBrowserBuildPlugins,
	getServerBuildPlugins,
	type AppBuildManifest,
} from './build-manifest.ts';
import { EsbuildBuildAdapter } from './esbuild-build-adapter.ts';
import { getRequiredBunRuntime } from '../utils/runtime.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { IHmrManager } from '../public-types.ts';

export { EsbuildBuildAdapter } from './esbuild-build-adapter.ts';

export interface BuildLog {
	message: string;
}

export interface BuildOutput {
	path: string;
}

/**
 * Dependency graph metadata produced by a build backend.
 *
 * @remarks
 * This structure is runtime-neutral at the type level, but current population
 * is Node/esbuild-only. Bun-backed builds may omit this metadata.
 */
export interface BuildDependencyGraph {
	/**
	 * Normalized absolute entrypoint path mapped to all normalized absolute
	 * source inputs that contributed to that entrypoint output.
	 */
	entrypoints: Record<string, string[]>;
}

export interface BuildResult {
	success: boolean;
	logs: BuildLog[];
	outputs: BuildOutput[];
	/**
	 * Optional build dependency metadata for selective invalidation.
	 *
	 * @remarks
	 * This is currently filled by the Node/esbuild adapter. Other runtimes should
	 * treat missing graph data as a valid state and fall back deterministically.
	 */
	dependencyGraph?: BuildDependencyGraph;
}

export interface BuildOptions {
	entrypoints: string[];
	outdir?: string;
	outbase?: string;
	naming?: string;
	conditions?: string[];
	define?: Record<string, string>;
	minify?: boolean;
	treeshaking?: boolean;
	target?: string;
	format?: string;
	sourcemap?: string;
	splitting?: boolean;
	root?: string;
	bundle?: boolean;
	externalPackages?: boolean;
	external?: string[];
	plugins?: EcoBuildPlugin[];
	[key: string]: unknown;
}

export type BuildTranspileProfile = 'browser-script' | 'hmr-runtime' | 'hmr-entrypoint';

export interface BuildTranspileOptions {
	target: string;
	format: string;
	sourcemap: string;
}

export interface BuildAdapter {
	/**
	 * Executes one concrete backend build.
	 *
	 * @remarks
	 * `BuildAdapter` is the low-level backend contract. The default adapter is
	 * `EsbuildBuildAdapter`, but alternate adapters may satisfy the same shape.
	 */
	build(options: BuildOptions): Promise<BuildResult>;
	resolve(importPath: string, rootDir: string): string;
	getTranspileOptions(profile: BuildTranspileProfile): BuildTranspileOptions;
}

/**
 * Runtime-owned facade for issuing builds.
 *
 * @remarks
 * This is intentionally narrower than `BuildAdapter`. A build executor answers
 * only the question "how should this app execute a build right now?".
 *
 * In production and non-watch flows the executor is usually the adapter itself,
 * which today means `EsbuildBuildAdapter`. In development watch flows the
 * executor is typically `DevBuildCoordinator`, which wraps the shared esbuild
 * adapter to serialize callers and recover from known worker faults.
 */
export interface BuildExecutor {
	build(options: BuildOptions): Promise<BuildResult>;
}

export function createBuildAdapter(): BuildAdapter {
	return new EsbuildBuildAdapter();
}

function transpileProfileToOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
	switch (profile) {
		case 'browser-script':
			return {
				target: 'browser',
				format: 'esm',
				sourcemap: 'none',
			};
		case 'hmr-runtime':
			return {
				target: 'browser',
				format: 'esm',
				sourcemap: 'none',
			};
		case 'hmr-entrypoint':
			return {
				target: 'browser',
				format: 'esm',
				sourcemap: 'none',
			};
	}
}

/**
 * @deprecated Use EsbuildBuildAdapter instead. Bun native build is missing some dependency graph features.
 */
export class BunBuildAdapter implements BuildAdapter {
	async build(options: BuildOptions): Promise<BuildResult> {
		const bun = getRequiredBunRuntime();
		const result = await bun.build({
			...options,
			plugins: options.plugins as BunPlugin[] | undefined,
		} as Bun.BuildConfig);

		return {
			success: result.success,
			logs: result.logs.map((log) => ({ message: log.message })),
			outputs: result.outputs.map((output) => ({ path: output.path })),
		};
	}

	resolve(importPath: string, rootDir: string): string {
		return getRequiredBunRuntime().resolveSync(importPath, rootDir);
	}

	getTranspileOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
		return transpileProfileToOptions(profile);
	}
}

export const defaultBuildAdapter: BuildAdapter = createBuildAdapter();

/**
 * Returns the adapter owned by an app/runtime instance.
 *
 * @remarks
 * The config builder installs a dedicated adapter per app. The shared default
 * adapter remains only as a compatibility fallback for older tests and helpers
 * that do not yet thread app runtime state explicitly.
 */
export function getAppBuildAdapter(appConfig: EcoPagesAppConfig): BuildAdapter {
	return appConfig.runtime?.buildAdapter ?? defaultBuildAdapter;
}

/**
 * Installs the adapter that should serve future builds for one app instance.
 */
export function setAppBuildAdapter(appConfig: EcoPagesAppConfig, buildAdapter: BuildAdapter): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		buildAdapter,
	};
}

/**
 * Returns the build manifest owned by an app/runtime instance.
 */
export function getAppBuildManifest(appConfig: EcoPagesAppConfig): AppBuildManifest {
	return (
		appConfig.runtime?.buildManifest ??
		createAppBuildManifest({
			loaderPlugins: Array.from(appConfig.loaders.values()),
		})
	);
}

/**
 * Installs the build manifest that should be visible to one app instance.
 */
export function setAppBuildManifest(appConfig: EcoPagesAppConfig, buildManifest: AppBuildManifest): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		buildManifest,
	};
}

/**
 * Rebuilds an app-owned manifest from config-owned loaders plus explicit
 * runtime/browser contribution input.
 *
 * @remarks
 * This keeps loader ownership with config finalization while still letting a
 * caller supply the non-loader plugin buckets that were discovered elsewhere.
 */
export function createConfiguredAppBuildManifest(
	appConfig: EcoPagesAppConfig,
	input?: Partial<AppBuildManifest>,
): AppBuildManifest {
	return createAppBuildManifest({
		loaderPlugins: input?.loaderPlugins ?? Array.from(appConfig.loaders.values()),
		runtimePlugins: input?.runtimePlugins,
		browserBundlePlugins: input?.browserBundlePlugins,
	});
}

/**
 * Replaces the app-owned manifest using config-owned loaders and explicit
 * contribution input.
 */
export function updateAppBuildManifest(appConfig: EcoPagesAppConfig, input?: Partial<AppBuildManifest>): void {
	setAppBuildManifest(appConfig, createConfiguredAppBuildManifest(appConfig, input));
}

/**
 * Collects the build-facing processor and integration contributions that should
 * be sealed into the app manifest during config finalization.
 *
 * @remarks
 * This runs `prepareBuildContributions()` only. Runtime-only side effects such
 * as HMR registration, cache prewarming, and runtime-origin wiring belong to
 * the startup path and must not be triggered here.
 */
export async function collectConfiguredAppBuildManifestContributions(
	appConfig: EcoPagesAppConfig,
): Promise<Pick<AppBuildManifest, 'runtimePlugins' | 'browserBundlePlugins'>> {
	const runtimePlugins: EcoBuildPlugin[] = [];
	const browserBundlePlugins: EcoBuildPlugin[] = [];

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
		runtimePlugins.push(...integration.plugins);
	}

	return {
		runtimePlugins,
		browserBundlePlugins,
	};
}

/**
 * Runs runtime-only processor and integration setup against an already sealed
 * app manifest.
 *
 * @remarks
 * Startup paths call this after config build has finalized manifest
 * contributions. The manifest is reused as-is; this helper only performs the
 * runtime side effects that still need live startup context.
 */
export async function setupAppRuntimePlugins(options: {
	appConfig: EcoPagesAppConfig;
	runtimeOrigin: string;
	hmrManager?: IHmrManager;
	onRuntimePlugin?: (plugin: EcoBuildPlugin) => void;
}): Promise<void> {
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
}

export function getAppServerBuildPlugins(appConfig: EcoPagesAppConfig): EcoBuildPlugin[] {
	return getServerBuildPlugins(getAppBuildManifest(appConfig));
}

export function getAppBrowserBuildPlugins(appConfig: EcoPagesAppConfig): EcoBuildPlugin[] {
	return getBrowserBuildPlugins(getAppBuildManifest(appConfig));
}

/**
 * Returns the executor owned by an app/runtime instance.
 *
 * @remarks
 * The config builder seeds this with the shared default adapter. Runtime
 * adapters may replace it with a coordinator that still delegates to the same
 * backend while adding development policy.
 */
export function getAppBuildExecutor(appConfig: EcoPagesAppConfig): BuildExecutor {
	return appConfig.runtime?.buildExecutor ?? getAppBuildAdapter(appConfig);
}

/**
 * Installs the executor that should serve future builds for one app instance.
 */
export function setAppBuildExecutor(appConfig: EcoPagesAppConfig, buildExecutor: BuildExecutor): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		buildExecutor,
	};
}

/**
 * Runs a build through the active pipeline.
 *
 * @remarks
 * Callers can pass an explicit executor when builds should be routed through an
 * app-owned development coordinator. Without one, the shared default adapter is
 * used directly.
 */
export function build(options: BuildOptions, executor: BuildExecutor = defaultBuildAdapter): Promise<BuildResult> {
	return executor.build(options);
}

export function getTranspileOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
	return defaultBuildAdapter.getTranspileOptions(profile);
}
