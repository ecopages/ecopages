/**
 * Rolldown build adapter.
 *
 * @remarks
 * Implements {@link BuildAdapter} on top of the `rolldown` package. This
 * is the sole bundler adapter going forward per ADR-003: both the
 * previous `EsbuildBuildAdapter` and `BunBuildAdapter` are removed in
 * the same release.
 *
 * The adapter:
 *
 * - Wraps `rolldown.build()` with our `BuildOptions` shape and maps the
 *   Rolldown `BuildOutput` to `BuildResult` (outputs + dependency graph).
 * - Uses {@link createRolldownPluginBridge} so callers can keep
 *   registering the runtime-agnostic `EcoBuildPlugin[]` array.
 * - Surfaces a single `getTranspileOptions` profile table shared across
 *   the previous esbuild adapter, so HMR / browser-script profiles
 *   keep their existing shape.
 *
 * Module graph extraction: the previous esbuild adapter walked
 * `metafile.outputs[*].inputs`. Rolldown's `OutputChunk` already groups
 * modules per chunk, so we just read `OutputChunk.moduleIds`. The
 * `BuildDependencyGraph.entrypoints` shape is preserved so callers that
 * consume it (HMR invalidation, build manifest) do not change.
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
} from './browser-runtime-import-rewrite-plugin.ts';
import { createRolldownPluginBridge } from './rolldown-plugin-bridge.ts';

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

function hasTemplateTokens(value: string | undefined): boolean {
	return typeof value === 'string' && /\[[^\]]+\]/.test(value);
}

function toEntryFileNamesPattern(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}
	const pattern = value.replaceAll(/\.?\[ext\]/g, '');
	return pattern.length > 0 ? pattern : undefined;
}

function getJavaScriptOutExtension(options: BuildOptions): string | undefined {
	if (options.target === 'browser') {
		return undefined;
	}
	if (options.format === 'cjs') {
		return '.cjs';
	}
	if (options.format === 'esm') {
		return '.mjs';
	}
	return undefined;
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
	return [{ message: 'Unknown Rolldown build error' }];
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

		const bundle = await rolldown({
			input: options.entrypoints,
			cwd: contextRoot,
			external: options.external,
			platform: mapRolldownPlatform(options.target),
			transform: options.define ? { define: options.define } : undefined,
			resolve: options.conditions ? { conditionNames: options.conditions } : undefined,
			treeshake: typeof options.treeshaking === 'boolean' ? options.treeshaking : true,
			...(options.jsx ? { jsx: options.jsx } : {}),
			plugins: createRolldownPluginBridge(plugins, contextRoot),
		});

		const usesTemplatedNaming = hasTemplateTokens(options.naming);
		const entryFileNames = toEntryFileNamesPattern(options.naming);
		const jsExtension = getJavaScriptOutExtension(options);
		const finalEntryFileNames = jsExtension
			? `${entryFileNames ?? '[name]'}${jsExtension}`
			: entryFileNames;

		const output = await bundle.write({
			dir: outdir,
			format: mapRolldownFormat(options.format),
			minify: !!options.minify,
			...(finalEntryFileNames ? { entryFileNames: finalEntryFileNames } : {}),
			chunkFileNames: '[name]-[hash]',
			assetFileNames: '[name]-[hash]',
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
