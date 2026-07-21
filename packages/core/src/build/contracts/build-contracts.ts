import type { EcoSourceTransform } from '../../plugins/source-transform.ts';
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

/** A single message emitted by the build backend. */
export interface BuildLog {
	message: string;
}

/** A single artifact emitted by the build backend. */
export interface BuildOutput {
	path: string;
}

/** Per-entrypoint dependency metadata surfaced alongside a build. */
export interface BuildDependencyGraph {
	entrypoints: Record<string, string[]>;
}

/** The full result of one `BuildAdapter.build` call. */
export interface BuildResult {
	success: boolean;
	logs: BuildLog[];
	outputs: BuildOutput[];
	dependencyGraph?: BuildDependencyGraph;
	entryOutputs?: Record<string, string>;
}

/**
 * Options accepted by every `BuildAdapter.build` call.
 *
 * @remarks
 * Fields that the adapter can forward are honored. `splitting: false` disables
 * Rolldown code splitting for single-entrypoint builds. `bundle` and `outbase`
 * are accepted for call-site compatibility but ignored.
 */
export interface BuildOptions {
	entrypoints: string[] | Record<string, string>;
	outdir?: string;
	/**
	 * Base directory for `[dir]` placeholders in `naming`. Currently
	 * the bundled adapter derives the base from `root` directly and
	 * ignores this field.
	 *
	 * @deprecated Accepted for call-site compatibility only. Use record-form
	 * `entrypoints` keys to preserve directory structure.
	 */
	outbase?: string;
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
	/** @deprecated Accepted for call-site compatibility only. */
	bundle?: boolean;
	externalPackages?: boolean;
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
	sourceTransforms?: EcoSourceTransform[];
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
