import type { BunPlugin } from 'bun';
import type { EcoBuildPlugin } from './build-types.ts';
import { EsbuildBuildAdapter } from './esbuild-build-adapter.ts';
import { getRequiredBunRuntime } from '../utils/runtime.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';

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
	registerPlugin(plugin: EcoBuildPlugin): void;
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

	registerPlugin(plugin: EcoBuildPlugin): void {
		getRequiredBunRuntime().plugin(plugin as BunPlugin);
	}

	getTranspileOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
		return transpileProfileToOptions(profile);
	}
}

export const defaultBuildAdapter: BuildAdapter = new EsbuildBuildAdapter();

/**
 * Returns the executor owned by an app/runtime instance.
 *
 * @remarks
 * The config builder seeds this with the shared default adapter. Runtime
 * adapters may replace it with a coordinator that still delegates to the same
 * backend while adding development policy.
 */
export function getAppBuildExecutor(appConfig: EcoPagesAppConfig): BuildExecutor {
	return appConfig.runtime?.buildExecutor ?? defaultBuildAdapter;
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
