import type { EcoBuildPlugin } from './build-types.ts';

/** A single artifact emitted by the build backend. */
export interface BuildOutput {
	path: string;
	/** Output bytes returned by a memory-only build request. */
	content?: string | Uint8Array;
	/** Whether the emitted filename is content-addressed according to the output naming policy. */
	contentHashed?: boolean;
}

/** Per-entrypoint dependency metadata surfaced alongside a build. */
export interface BuildDependencyGraph {
	/**
	 * Each entry's resolved absolute path, mapped to its static and dynamic source
	 * module closure, including inlined and tree-shaken imports and the entry itself,
	 * plus the files a plugin declared with `addWatchFile` for a module in it.
	 *
	 * @remarks
	 * Production caches hash these files to decide reuse, so an omitted module leaves stale output after it
	 * changes.
	 */
	entrypoints: Record<string, string[]>;
	/**
	 * Resolved paths of the entries whose own module the bundler detected as CommonJS.
	 *
	 * @remarks
	 * Such an entry's output has a default export, `module.exports`, and no named exports. The development vendor
	 * graph reads it so importers can take named bindings from the default export.
	 */
	commonJsEntrypoints?: string[];
}

/**
 * One error or warning of a build.
 *
 * @remarks
 * `plugin` names the `EcoBuildPlugin` that threw, not the bridge plugin that hosts it. Terminal colour codes
 * are stripped from `message` and `frame`.
 */
export interface BuildLog {
	message: string;
	code?: string;
	plugin?: string;
	hook?: string;
	id?: string;
	loc?: { file?: string; line: number; column: number };
	frame?: string;
	stack?: string;
}

/** The result of a build that produced its outputs. */
export interface BuildSuccess {
	success: true;
	outputs: BuildOutput[];
	/** Warnings reported by the bundler. */
	warnings: BuildLog[];
	dependencyGraph: BuildDependencyGraph;
	/**
	 * Emitted absolute output paths keyed by the entry path or name the caller
	 * passed, plus the bundler's facade path when that spelling differs.
	 */
	entryOutputs: Record<string, string>;
	/** All emitted chunks keyed by absolute output path; local external edges remain leaves. */
	outputGraph: Record<string, BuildChunk>;
}

/** The result of a build that failed: it emitted nothing and says why. */
export interface BuildFailure {
	success: false;
	/** The errors of the build. */
	logs: BuildLog[];
}

/** The full result of one `BuildAdapter.build` call. */
export type BuildResult = BuildSuccess | BuildFailure;

export interface BuildChunk {
	fileName: string;
	imports: string[];
	dynamicImports: string[];
	isEntry: boolean;
	facadeModuleId: string | null;
	/** Absolute source paths of the modules bundled into this chunk; virtual modules are left out. */
	modules: string[];
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
	/** Emits one output module per source module so separate server emits can share module identity. */
	preserveModules?: boolean;
	preserveModulesRoot?: string;
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
	/** Keep generated outputs in the returned result instead of writing files to disk. */
	writeToDisk?: boolean;
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
	/**
	 * How the build compiles the stylesheets its modules import; defaults to `.css` files exported as written.
	 *
	 * @remarks
	 * Server and browser requests set it from the app: the extensions of the registered stylesheet Processor (see
	 * `StylesheetKinds`) and core's `compileStylesheetModule`, so both environments give an import the same CSS.
	 */
	stylesheets?: BuildStylesheets;
	/**
	 * Builds each `new Worker(new URL('./x.ts', import.meta.url), { type: 'module' })`, and the same with
	 * `SharedWorker`, as its own entry and points the URL at the emitted file. Browser builds only; defaults to `true`.
	 *
	 * @remarks
	 * The dev transform server sets `false`: it compiles one module at a time and points the URL at its own module URL.
	 */
	workerEntries?: boolean;
}

/**
 * The stylesheets of one build request and the compiler of the module a binding import of one receives.
 *
 * @remarks
 * Only `extensions` is part of the request identity: `compileModule` is the app's one stylesheet compiler, the same
 * for every request of the app.
 */
export interface BuildStylesheets {
	/** The lowercase, dotted stylesheet extensions. */
	readonly extensions: readonly string[];
	/** Compiles the stylesheet at `file` into ES module code whose default export is its processed CSS. */
	compileModule(file: string): Promise<string>;
	/**
	 * Receives the error for a package module's own side-effect stylesheet import in a browser build, which then loads
	 * an empty module. Without it, that error fails the build.
	 *
	 * @remarks
	 * Development requests set it, so `ecopages dev` warns about such a package instead of stopping.
	 */
	reportUndeliverable?(error: Error): void;
}

/** Compilation environment, independent of the build queue's scheduling lane. */
export type BuildEnvironment = 'server' | 'browser';

/** Resolved transpile settings for a compilation environment. */
export interface BuildTranspileOptions {
	target: BuildTarget;
	format: BuildFormat;
	sourcemap: BuildSourcemap;
}

/** Low-level build backend contract. */
export interface BuildAdapter {
	build(options: BuildOptions): Promise<BuildResult>;
	resolve(importPath: string, rootDir: string): string;
}

/** Runtime-facing facade for issuing builds. */
export interface BuildExecutor {
	build(options: BuildOptions): Promise<BuildResult>;
}
