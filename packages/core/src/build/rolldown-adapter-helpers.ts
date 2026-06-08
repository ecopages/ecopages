/**
 * Shared helpers for the Rolldown-backed build adapters.
 *
 * @remarks
 * Both {@link RolldownBuildAdapter} (one-shot production builds) and
 * {@link RolldownDevBuildAdapter} (DevEngine-backed incremental rebuilds)
 * need the same {@link BuildOptions} → Rolldown options mapping, the same
 * output normalization, and the same external/package resolution
 * helpers. To keep the two adapters semantically identical and avoid
 * the maintenance trap of two diverging copies, this module hosts the
 * shared helpers.
 *
 * Both adapters import from this module instead of redefining their
 * own copies. The only thing the adapters add is the bundler entry
 * point (`rolldown()` vs `dev()`) and the result-handling pipeline.
 *
 * @module
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import type { InputOptions, OutputOptions } from 'rolldown';
import type { EcoBuildPlugin } from './build-types.ts';
import { collectBrowserRuntimeImportRewriteMap, rewriteBrowserRuntimeImports } from './browser-runtime-plugin.ts';
import { createServerSideCssShimPlugin } from './server-side-css-shim-plugin.ts';
import { createRolldownPluginBridge } from './rolldown-plugin-bridge.ts';
import { isDeclaredAppPackageImport, normalizeNodeRuntimeBuildOutputs } from './runtime-build-output-normalizer.ts';
import type {
	BuildDependencyGraph,
	BuildLog,
	BuildOptions,
	BuildOutput,
	BuildResult,
	BuildTranspileOptions,
	BuildTranspileProfile,
} from './build-adapter.ts';

const corePackageRequire = createRequire(new URL('../../package.json', import.meta.url));

/**
 * Resolved transpile settings for each stable profile.
 *
 * @remarks
 * All three profiles (`'browser-script'`, `'hmr-runtime'`,
 * `'hmr-entrypoint'`) share the same defaults today. The profile
 * argument is kept so per-profile tuning can land without breaking
 * callers.
 */
export function transpileProfileToOptions(profile: BuildTranspileProfile): BuildTranspileOptions {
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

export function mapRolldownFormat(value: string | undefined): 'esm' | 'cjs' | 'iife' | undefined {
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

export function mapRolldownPlatform(value: string | undefined): 'browser' | 'node' | 'neutral' {
	if (value === 'browser') return 'browser';
	if (value === 'node') return 'node';
	if (value && /^(?:es\d+|chrome\d+|edge\d+|firefox\d+|safari\d+|hermes|deno\d+|ios\d+)$/.test(value)) {
		return 'node';
	}
	return 'neutral';
}

export function mapRolldownSourcemap(value: string | undefined): boolean | 'inline' | 'hidden' {
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

export function mapRolldownJsx(jsx: NonNullable<BuildOptions['jsx']>): Record<string, unknown> {
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

export function toEntryFileNamesPattern(value: string | undefined): { pattern: string; literal: boolean } | undefined {
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

export function getJavaScriptOutExtension(options: BuildOptions, literal: boolean): string | undefined {
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

export function normalizeOutputPath(outputPath: string, outdir: string): string {
	return path.isAbsolute(outputPath) ? path.normalize(outputPath) : path.normalize(path.join(outdir, outputPath));
}

function normalizeModulePath(modulePath: string, contextRoot: string): string {
	return path.isAbsolute(modulePath)
		? path.normalize(modulePath)
		: path.normalize(path.resolve(contextRoot, modulePath));
}

export function extractDependencyGraph(
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

export function toBuildLogs(error: unknown): BuildLog[] {
	if (error instanceof Error) {
		return [{ message: error.message }];
	}
	return [{ message: 'Unknown build error' }];
}

export function isPackageImport(id: string): boolean {
	return (
		!id.startsWith('.') &&
		!path.isAbsolute(id) &&
		!id.startsWith('/') &&
		!id.startsWith('node:') &&
		!id.startsWith('@/') &&
		!id.startsWith('~/') &&
		!id.startsWith('#') &&
		!id.includes(':')
	);
}

function tryResolveModule(id: string, resolver: NodeJS.Require): string | undefined {
	try {
		return resolver.resolve(id);
	} catch {
		return undefined;
	}
}

/**
 * Returns a `createRequire` instance anchored at `<contextRoot>/package.json`,
 * caching the result so repeated calls with the same context root reuse
 * the same require.
 */
export function getAppRootRequire(cache: Map<string, NodeJS.Require>, contextRoot: string): NodeJS.Require {
	const cacheKey = path.resolve(contextRoot);
	let req = cache.get(cacheKey);
	if (!req) {
		req = createRequire(path.join(cacheKey, 'package.json'));
		cache.set(cacheKey, req);
	}
	return req;
}

function shouldBundlePackageImport(
	id: string,
	contextRoot: string,
	appRootRequireCache: Map<string, NodeJS.Require>,
): boolean {
	if (isDeclaredAppPackageImport(id, contextRoot)) {
		const appRootRequire = getAppRootRequire(appRootRequireCache, contextRoot);
		const appResolvedPath = tryResolveModule(id, appRootRequire);
		return Boolean(appResolvedPath && /\.(?:[cm]?ts|tsx|jsx)$/u.test(appResolvedPath));
	}

	const coreResolvedPath = tryResolveModule(id, corePackageRequire);
	return Boolean(coreResolvedPath && /\.(?:[cm]?ts|tsx|jsx)$/u.test(coreResolvedPath));
}

export function createExternalMatcher(
	options: BuildOptions,
	appRootRequireCache: Map<string, NodeJS.Require>,
): (id: string) => boolean {
	const explicitExternals = new Set(options.external ?? []);
	const externalPackages = options.externalPackages === true;
	const contextRoot = options.root ? path.resolve(options.root) : process.cwd();

	return (id: string): boolean => {
		if (explicitExternals.has(id)) {
			return true;
		}

		if (!externalPackages || !isPackageImport(id)) {
			return false;
		}

		return !shouldBundlePackageImport(id, contextRoot, appRootRequireCache);
	};
}

/**
 * Resolved Rolldown options for one `BuildOptions` request.
 */
export interface ResolvedRolldownOptions {
	inputOptions: InputOptions;
	outputOptions: OutputOptions;
}

/**
 * Translates a {@link BuildOptions} into Rolldown's `InputOptions` and
 * `OutputOptions`. Shared by both the standard and dev adapters.
 */
export function resolveRolldownOptions(
	options: BuildOptions,
	contextRoot: string,
	outdir: string,
	appRootRequireCache: Map<string, NodeJS.Require>,
): ResolvedRolldownOptions {
	const external = createExternalMatcher(options, appRootRequireCache);

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

	const bundlePlugins = options.plugins ?? [];
	const appPlugins = createRolldownPluginBridge(bundlePlugins, contextRoot);
	const allPlugins = [...(options.target !== 'browser' ? [createServerSideCssShimPlugin()] : []), ...appPlugins];

	const inputOptions: InputOptions = {
		input: options.entrypoints,
		cwd: contextRoot,
		external,
		platform: mapRolldownPlatform(options.target),
		transform: Object.keys(transformOptions).length > 0 ? transformOptions : undefined,
		resolve: options.conditions ? { conditionNames: options.conditions } : undefined,
		treeshake: typeof options.treeshaking === 'boolean' ? options.treeshaking : true,
		experimental: {
			nativeMagicString: true,
		},
		plugins: allPlugins,
	};

	const entryFileNames = toEntryFileNamesPattern(options.naming);
	const jsExtension = getJavaScriptOutExtension(options, entryFileNames?.literal ?? false);
	const finalEntryFileNames = entryFileNames
		? jsExtension
			? `${entryFileNames.pattern}${jsExtension}`
			: entryFileNames.pattern
		: jsExtension
			? `[name]${jsExtension}`
			: '[name]';

	const outputOptions: OutputOptions = {
		dir: outdir,
		format: mapRolldownFormat(options.format),
		minify: !!options.minify,
		entryFileNames: finalEntryFileNames,
		chunkFileNames: '[name]-[hash].js',
		assetFileNames: '[name]-[hash][extname]',
		sourcemap: mapRolldownSourcemap(options.sourcemap),
	};

	return { inputOptions, outputOptions };
}

/**
 * Rewrites manifest-owned runtime specifiers in emitted JS output files.
 *
 * @remarks
 * For each JS output, reads the file, applies the AST-based import/export
 * rewrite against the manifest's specifier map, and writes the result back
 * if it differs. A per-path content cache (keyed on the input bytes) skips
 * the parse+write round trip when the file's source content is identical
 * to the last rewrite — important for DevEngine-backed incremental
 * rebuilds where the same files are rewritten on every cached build.
 *
 * The cache is keyed on a fingerprint of `(specifierMap, outputPath,
 * sourceBytes)` so a manifest change correctly invalidates prior entries
 * and different content with the same length does not collide.
 */
export function rewriteBrowserRuntimeImportsInOutputs(
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
	const fs = moduleRequireFromContext('node:fs') as typeof import('node:fs');
	const cacheFingerprint = `${Array.from(specifierMap.entries()).sort().join('|')}`;

	for (const output of result.outputs) {
		if (!/\.(?:[cm]?js)$/u.test(output.path)) {
			continue;
		}

		const code = fs.readFileSync(output.path, 'utf-8') as string;
		const contentKey = `${cacheFingerprint}::${output.path}::${djb2(code)}`;
		if (rewriteCache.has(contentKey)) {
			continue;
		}

		const rewritten = rewriteBrowserRuntimeImports(code, specifierMap, output.path);
		if (rewritten !== code) {
			fs.writeFileSync(output.path, rewritten);
		}
		rewriteCache.add(contentKey);
	}

	return result;
}

const rewriteCache = new Set<string>();

function djb2(input: string): string {
	let hash = 5381;
	for (let i = 0; i < input.length; i++) {
		hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
	}
	return hash.toString(36);
}

/**
 * Clears the in-memory rewriter cache. Exposed for test teardown so
 * tests with different fixtures don't inherit cache state from
 * previous runs.
 */
export function clearRewriteCacheForTests(): void {
	rewriteCache.clear();
}

/**
 * Normalizes node-runtime import paths in emitted outputs.
 */
export function rewriteNodeRuntimeImportsInOutputs(result: BuildResult, contextRoot: string): BuildResult {
	if (!result.success || result.outputs.length === 0) {
		return result;
	}

	normalizeNodeRuntimeBuildOutputs(
		result.outputs.map((output) => output.path),
		contextRoot,
	);

	return result;
}

/**
 * Maps a `RolldownOutput` to a normalized `BuildResult`. Shared shape
 * for both the standard and dev adapters.
 */
export function buildResultFromRolldownOutput(
	output: {
		output: Array<{
			fileName: string;
			type?: string;
			isEntry?: boolean;
			facadeModuleId?: string | null;
			moduleIds?: string[];
		}>;
	},
	outdir: string,
	contextRoot: string,
): BuildResult {
	const outputs: BuildOutput[] = output.output.map((entry) => ({
		path: normalizeOutputPath(entry.fileName, outdir),
	}));

	const entryChunks = output.output.filter((entry) => entry.type === 'chunk' && entry.isEntry) as Array<{
		facadeModuleId: string | null;
		moduleIds: string[];
	}>;

	const dependencyGraph = entryChunks.length > 0 ? extractDependencyGraph(entryChunks, contextRoot) : undefined;

	return {
		success: true,
		logs: [],
		outputs,
		dependencyGraph,
	};
}
