/**
 * Bundler-backed build adapter.
 *
 * @remarks
 * Implements {@link BuildAdapter} on top of the bundler. This is the
 * default adapter installed by `ConfigBuilder` and the only adapter
 * that issues real builds in production.
 *
 * Responsibilities:
 *
 * - Map {@link BuildOptions} to the bundler's native options and
 *   return a {@link BuildResult} (outputs + dependency graph).
 * - Translate the runtime-agnostic `EcoBuildPlugin[]` via the bundled
 *   plugin bridge, preserving plugin-priority order by giving each
 *   plugin its own slot.
 * - Run the browser-runtime-import rewriter against the emitted
 *   JavaScript outputs when the manifest declares a rewrite map.
 *
 * Module graph extraction: the bundler groups modules per chunk, so
 * the per-chunk module list is read directly. The
 * `BuildDependencyGraph.entrypoints` shape is preserved so HMR
 * invalidation and the build manifest keep working without changes.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { rolldown } from 'rolldown';
import type { OutputChunk } from 'rolldown';
import type { EcoBuildPlugin } from './build-types.ts';
import type {
	BuildAdapter,
	BuildDependencyGraph,
	BuildLog,
	BuildOptions,
	BuildResult,
	BuildTranspileOptions,
	BuildTranspileProfile,
} from './build-adapter.ts';
import {
	collectBrowserRuntimeImportRewriteMap,
	rewriteBrowserRuntimeImports,
} from './browser-runtime-plugin.ts';
import { createRolldownPluginBridge } from './rolldown-plugin-bridge.ts';
import { createServerSideCssShimPlugin } from './server-side-css-shim-plugin.ts';

const moduleRequire = createRequire(import.meta.url);

/**
 * Provides common transpile output defaults shared across build profiles.
 */
function transpileProfileToOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
	switch (profile) {
		case 'browser-script':
		case 'hmr-runtime':
		case 'hmr-entrypoint':
			return {
				target: 'browser',
				format: 'esm',
				sourcemap: 'none',
			};
	}
}

function mapRolldownFormat(value: string | undefined): 'esm' | 'cjs' | 'iife' | undefined {
	switch (value) {
		case 'cjs':
			return 'cjs';
		case 'iife':
			return 'iife';
		case 'esm':
		default:
			return 'esm';
	}
}

function mapRolldownPlatform(value: string | undefined): 'browser' | 'node' | 'neutral' {
	return value === 'browser' ? 'browser' : value === 'node' ? 'node' : 'neutral';
}

function mapRolldownSourcemap(value: string | undefined): boolean | 'inline' | 'hidden' {
	switch (value) {
		case 'none':
			return false;
		case 'inline':
			return 'inline';
		case 'external':
		case 'linked':
			return 'hidden';
		default:
			return true;
	}
}

function mapRolldownJsx(jsx: NonNullable<BuildOptions['jsx']>): Record<string, unknown> {
	const { factory, fragment, ...rest } = jsx;
	const out: Record<string, unknown> = { ...rest };
	if (factory !== undefined) {
		out.pragma = factory;
	}
	if (fragment !== undefined) {
		out.pragmaFrag = fragment;
	}
	return out;
}

function toEntryFileNamesPattern(value: string | undefined): { pattern: string; literal: boolean } | undefined {
	if (!value) {
		return undefined;
	}
	const literal = !/\[[^\]]+\]/u.test(value);
	const stripped = value.replaceAll(/\.?\[ext\]/g, '');
	if (stripped.length === 0) {
		return undefined;
	}
	return { pattern: stripped, literal };
}

function getJavaScriptOutExtension(options: BuildOptions, literal: boolean): string | undefined {
	if (literal) {
		return undefined;
	}
	if (options.target === 'browser') {
		return '.js';
	}
	if (options.format === 'cjs') {
		return '.cjs';
	}
	return '.mjs';
}

function normalizeOutputPath(outputPath: string, outdir: string): string {
	return path.isAbsolute(outputPath) ? path.normalize(outputPath) : path.normalize(path.join(outdir, outputPath));
}

function normalizeModulePath(modulePath: string, contextRoot: string): string {
	return path.isAbsolute(modulePath) ? path.normalize(modulePath) : path.normalize(path.resolve(contextRoot, modulePath));
}

function extractDependencyGraph(
	chunks: Array<{ facadeModuleId: string | null; moduleIds: string[] }>,
	contextRoot: string,
): BuildDependencyGraph {
	const entrypoints: Record<string, string[]> = {};

	for (const chunk of chunks) {
		if (!chunk.facadeModuleId) {
			continue;
		}
		const entrypointPath = normalizeModulePath(chunk.facadeModuleId, contextRoot);
		entrypoints[entrypointPath] = Array.from(
			new Set([entrypointPath, ...chunk.moduleIds.map((id) => normalizeModulePath(id, contextRoot))]),
		);
	}

	return { entrypoints };
}

function toBuildLogs(error: unknown): BuildLog[] {
	if (error instanceof Error) {
		return [{ message: error.message }];
	}
	return [{ message: 'Unknown build error' }];
}

function rewriteBrowserRuntimeImportsInOutputs(
	result: BuildResult,
	contextRoot: string,
	plugins: EcoBuildPlugin[],
): BuildResult {
	if (!result.success || result.outputs.length === 0) {
		return result;
	}

	const specifierMap = collectBrowserRuntimeImportRewriteMap(plugins);
	if (specifierMap.size === 0) {
		return result;
	}

	const moduleRequireFromContext = createRequire(path.join(contextRoot, 'package.json'));

	for (const output of result.outputs) {
		if (!/\.(?:[cm]?js)$/u.test(output.path)) {
			continue;
		}
		const code = moduleRequireFromContext('node:fs').readFileSync(output.path, 'utf-8') as string;
		const rewritten = rewriteBrowserRuntimeImports(code, specifierMap, output.path);
		if (rewritten !== code) {
			moduleRequireFromContext('node:fs').writeFileSync(output.path, rewritten);
		}
	}

	return result;
}

export class RolldownBuildAdapter implements BuildAdapter {
	readonly ownership = 'rolldown' as const;

	async buildOrThrow(options: BuildOptions): Promise<BuildResult> {
		const contextRoot = options.root ? path.resolve(options.root) : process.cwd();
		const outdir = path.resolve(options.outdir ?? 'dist/assets');
		const plugins = options.plugins ?? [];

		const transformOptions: Record<string, unknown> = {};
		if (options.define) {
			transformOptions.define = options.define;
		}
		if (options.jsx) {
			transformOptions.jsx = mapRolldownJsx(options.jsx);
		}
		if (options.target && /^(?:es|chrome|edge|firefox|safari|hermes|deno|ios)/.test(options.target)) {
			transformOptions.target = options.target;
		}

		const bundle = await rolldown({
			input: options.entrypoints,
			cwd: contextRoot,
			external: options.external,
			platform: mapRolldownPlatform(options.target),
			transform: Object.keys(transformOptions).length > 0 ? transformOptions : undefined,
			resolve: options.conditions ? { conditionNames: options.conditions } : undefined,
			treeshake: typeof options.treeshaking === 'boolean' ? options.treeshaking : true,
			plugins: [
				createServerSideCssShimPlugin(),
				...createRolldownPluginBridge(plugins, contextRoot),
			],
		});

		const entryFileNames = toEntryFileNamesPattern(options.naming);
		const jsExtension = getJavaScriptOutExtension(options, entryFileNames?.literal ?? false);
		const finalEntryFileNames = entryFileNames
			? jsExtension
				? `${entryFileNames.pattern}${jsExtension}`
				: entryFileNames.pattern
			: jsExtension
				? `[name]${jsExtension}`
				: '[name]';

		const output = await bundle.write({
			dir: outdir,
			format: mapRolldownFormat(options.format),
			minify: !!options.minify,
			entryFileNames: finalEntryFileNames,
			chunkFileNames: '[name]-[hash].js',
			assetFileNames: '[name]-[hash][extname]',
			sourcemap: mapRolldownSourcemap(options.sourcemap),
		});

		await bundle.close();

		const outputs = output.output.map((entry) => ({ path: normalizeOutputPath(entry.fileName, outdir) }));
		const entryChunks = output.output.filter((entry): entry is OutputChunk => entry.type === 'chunk' && entry.isEntry);
		const dependencyGraph = extractDependencyGraph(
			entryChunks.map((chunk) => ({ facadeModuleId: chunk.facadeModuleId, moduleIds: chunk.moduleIds })),
			contextRoot,
		);

		const baseResult: BuildResult = {
			success: true,
			logs: [],
			outputs,
			dependencyGraph,
		};

		return rewriteBrowserRuntimeImportsInOutputs(baseResult, contextRoot, plugins);
	}

	async build(options: BuildOptions): Promise<BuildResult> {
		try {
			return await this.buildOrThrow(options);
		} catch (error) {
			return {
				success: false,
				logs: toBuildLogs(error),
				outputs: [],
			};
		}
	}

	resolve(importPath: string, rootDir: string): string {
		return moduleRequire.resolve(importPath, { paths: [rootDir] });
	}

	getTranspileOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
		return transpileProfileToOptions(profile);
	}
}

export function createRolldownBuildAdapter(): BuildAdapter {
	return new RolldownBuildAdapter();
}
