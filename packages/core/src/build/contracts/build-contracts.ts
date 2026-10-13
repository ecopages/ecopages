import type { RolldownLog } from 'rolldown';
import type { EcoBuildPlugin } from './build-types.ts';

/** The bundler that owns the app's build pipeline. */
export type BuildOwnership = 'rolldown';

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
	/** Absolute filesystem paths recorded by plugin load hooks during this build. */
	loadedInputs?: string[];
	/**
	 * Filesystem inputs recorded by each plugin-loaded module in this build.
	 *
	 * @remarks
	 * Cache owners use module ownership to keep plugin inputs scoped to their
	 * own entry closure, including when one entry's plugin explicitly reads a
	 * file that another entry loads as a source module.
	 */
	loadedInputsByModule?: Record<string, string[]>;
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

/** Targets supported by the Ecopages build adapter. */
export type BuildTarget =
	| 'browser'
	| 'node'
	| 'es3'
	| 'es5'
	| 'esnext'
	| `es${number}`
	| `chrome${string}`
	| `edge${string}`
	| `firefox${string}`
	| `safari${string}`
	| `hermes${string}`
	| `deno${string}`
	| `ios${string}`;

/** Output formats normalized by the Ecopages build adapter. */
export type BuildFormat = 'esm' | 'cjs' | 'iife';

/** Source map modes accepted by the Ecopages build adapter. */
export type BuildSourcemap = 'none' | 'inline' | 'external' | 'linked' | 'hidden';

/**
 * Options accepted by every `BuildAdapter.build` call.
 *
 * @remarks
 * Fields that the adapter can forward are honored. `splitting: false` disables
 * Rolldown code splitting for single-entrypoint builds.
 */
export interface BuildOptions {
	environment: BuildEnvironment;
	entrypoints: string[] | Record<string, string>;
	outdir?: string;
	naming?: string;
	conditions?: string[];
	define?: Record<string, string>;
	minify?: boolean;
	treeshaking?: boolean;
	target?: BuildTarget;
	format?: BuildFormat;
	sourcemap?: BuildSourcemap;
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

/** Compilation environment, independent of the executor's scheduling profile. */
export type BuildEnvironment = 'server' | 'browser';

/** Resolved transpile settings for a compilation environment. */
export interface BuildTranspileOptions {
	target: BuildTarget;
	format: BuildFormat;
	sourcemap: BuildSourcemap;
}

/** Low-level build backend contract. */
export interface BuildAdapter {
	readonly ownership?: BuildOwnership;
	build(options: BuildOptions): Promise<BuildResult>;
	resolve(importPath: string, rootDir: string): string;
	getTranspileOptions(environment: BuildEnvironment): BuildTranspileOptions;
}

/** Runtime-facing facade for issuing builds. */
export interface BuildExecutor {
	build(options: BuildOptions): Promise<BuildResult>;
}
