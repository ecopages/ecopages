import type { RolldownLog } from 'rolldown';
import type { EcoBuildPlugin } from './build-types.ts';

/**
 * Which backend owns the app's build pipeline.
 *
 * - `'rolldown'`: the default. Ecopages runs the build directly through
 *   its bundler-backed adapter.
 * - `'vite-host'`: a host runtime owns the build. {@link ViteHostBuildAdapter}
 *   is exposed as a boundary marker; any direct call into it throws.
 */
export type BuildOwnership = 'vite-host' | 'rolldown';

/** A single artifact emitted by the build backend. */
export interface BuildOutput {
	path: string;
}

/** Per-entrypoint dependency metadata surfaced alongside a build. */
export interface BuildDependencyGraph {
	/**
	 * Each entry's resolved absolute path, mapped to its static and dynamic source
	 * module closure, including inlined and tree-shaken imports and the entry itself.
	 *
	 * @remarks
	 * Production caches hash these files to decide reuse, so an omitted module leaves stale output after it
	 * changes.
	 */
	entrypoints: Record<string, string[]>;
}

/** The full result of one `BuildAdapter.build` call. */
export interface BuildResult {
	success: boolean;
	/**
	 * Errors of a failed build, in Rolldown's log shape (`code`, `plugin`, `hook`, `id`, `loc`, `frame`, `stack`).
	 *
	 * @remarks
	 * `plugin` names the `EcoBuildPlugin` that threw, not the bridge plugin that hosts it.
	 */
	logs: RolldownLog[];
	/** Warnings reported by the bundler during a successful build. */
	warnings?: RolldownLog[];
	outputs: BuildOutput[];
	dependencyGraph?: BuildDependencyGraph;
	/**
	 * Emitted absolute output paths keyed by the entry path or name the caller
	 * passed, plus the bundler's facade path when that spelling differs.
	 */
	entryOutputs?: Record<string, string>;
	/** All emitted chunks keyed by absolute output path; local external edges remain leaves. */
	outputGraph?: Record<string, BuildChunk>;
}

export interface BuildChunk {
	fileName: string;
	imports: string[];
	dynamicImports: string[];
	isEntry: boolean;
	facadeModuleId: string | null;
}

/**
 * Options accepted by every `BuildAdapter.build` call.
 *
 * @remarks
 * Fields that the adapter can forward are honored. `splitting: false` disables
 * Rolldown code splitting for single-entrypoint builds.
 */
export interface BuildOptions {
	entrypoints: string[] | Record<string, string>;
	outdir?: string;
	naming?: string;
	conditions?: string[];
	define?: Record<string, string>;
	minify?: boolean;
	treeshaking?: boolean;
	target?: string;
	format?: string;
	sourcemap?: string;
	/** When `false` with a single entrypoint, inlines dynamic imports into one output file. */
	splitting?: boolean;
	root?: string;
	externalPackages?: boolean;
	/**
	 * Logs the externalized packages that resolve outside `root`, one line per
	 * build, named by its entry files in `runtimeOutdir` (or `outdir`).
	 *
	 * @remarks
	 * Set by the `server-entry` profile only: the server entry and the emitted
	 * config are what gets deployed, while module builds that the running
	 * server makes on the deploy target stay silent.
	 */
	reportPackagesOutsideRoot?: boolean;
	/** Directory the output runs from when it is written to a staging `outdir` first. Defaults to `outdir`. */
	runtimeOutdir?: string;
	external?: string[];
	jsx?: {
		development?: boolean;
		factory?: string;
		fragment?: string;
		importSource?: string;
		runtime?: 'classic' | 'automatic';
		sideEffects?: boolean;
	};
	plugins?: EcoBuildPlugin[];
}

/** Stable profile identifiers for `BuildAdapter.getTranspileOptions`. */
export type BuildTranspileProfile = 'browser-script' | 'hmr-runtime' | 'hmr-entrypoint';

/** Resolved transpile settings for a given profile. */
export interface BuildTranspileOptions {
	target: string;
	format: string;
	sourcemap: string;
}

/** Low-level build backend contract. */
export interface BuildAdapter {
	readonly ownership?: BuildOwnership;
	build(options: BuildOptions): Promise<BuildResult>;
	resolve(importPath: string, rootDir: string): string;
	getTranspileOptions(profile: BuildTranspileProfile): BuildTranspileOptions;
}

/** Runtime-facing facade for issuing builds. */
export interface BuildExecutor {
	build(options: BuildOptions): Promise<BuildResult>;
}
