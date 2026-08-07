/**
 * Unified browser-runtime plugin factory.
 *
 * @remarks
 * Single factory that exposes the union of behaviors for the browser
 * runtime:
 *
 * - `onResolve` for manifest specifiers → mapped public URL, marked external
 * - `onResolve` for paths starting with `/` whose target is in the manifest's
 *   public path set → marked external
 * - `onLoad` for JS/TS files → AST-walking import/export rewrite against the
 *   manifest specifier set, with a `code.includes(specifier)` fast path
 *
 * The plugin object carries the manifest under `BROWSER_RUNTIME_MANIFEST` so
 * post-build rewriters can resolve exact and subpath imports without rebuilding
 * the map by hand.
 */

import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import { parseModuleSource } from '../../cache/module-parse-cache.ts';
import type { EcoBuildLoader, EcoBuildPlugin } from '../contracts/build-types.ts';
import {
	getBrowserRuntimeSpecifierMap,
	mergeBrowserRuntimeManifests,
	resolveBrowserRuntimePublicPath,
	type BrowserRuntimeManifest,
} from './browser-runtime-manifest.ts';
import { buildSpecifierFilter } from './browser-runtime-plugin-helpers.ts';

type Edit = {
	start: number;
	end: number;
	replacement: string;
};

/**
 * Symbol used to attach the browser-runtime manifest to a plugin instance.
 */
export const BROWSER_RUNTIME_MANIFEST = Symbol.for('ecopages.browserRuntimeManifest');

/**
 * Default name used by `createBrowserRuntimePlugin` when the caller
 * does not provide one.
 */
export const DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME = 'browser-runtime-plugin';

export type CreateBrowserRuntimePluginOptions = {
	/** Manifest whose specifier → publicPath entries drive the plugin. */
	manifest: BrowserRuntimeManifest;
	/** Stable build plugin name used for deduplication and selective exclusion. */
	name?: string;
	/**
	 * Whether alias `onResolve` results should be marked `external`.
	 * Default `true`. Pass `false` to let the bundler try to bundle the
	 * mapped URL.
	 */
	external?: boolean;
	/**
	 * Enable source-level AST import/export rewrite via the `onLoad`
	 * hook. Default `true`. Set `false` for alias-only consumers
	 * (e.g. `react`/`react-dom` externals in vendor assets).
	 */
	rewriteImports?: boolean;
	/**
	 * Register an `onResolve` for paths starting with `/` whose target
	 * is in the manifest's public path set. Marks them external so the
	 * bundler does not try to resolve them as source modules. Default
	 * `true`.
	 */
	matchPublicPaths?: boolean;
};

type BrowserRuntimePlugin = EcoBuildPlugin & {
	[BROWSER_RUNTIME_MANIFEST]?: BrowserRuntimeManifest;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object';
}

function inferLoaderFromPath(filePath: string): EcoBuildLoader {
	const extension = path.extname(filePath).toLowerCase();

	switch (extension) {
		case '.mts':
		case '.cts':
		case '.ts':
			return 'ts';
		case '.tsx':
			return 'tsx';
		case '.jsx':
			return 'jsx';
		default:
			return 'js';
	}
}

function queueReplacement(options: {
	code: string;
	source: unknown;
	manifest: BrowserRuntimeManifest;
	edits: Edit[];
}): void {
	if (!isRecord(options.source) || typeof options.source.value !== 'string') {
		return;
	}

	const mappedPath = resolveBrowserRuntimePublicPath(options.source.value, options.manifest);
	if (!mappedPath || typeof options.source.start !== 'number' || typeof options.source.end !== 'number') {
		return;
	}

	const quote = options.code[options.source.start] === "'" ? "'" : '"';
	options.edits.push({
		start: options.source.start,
		end: options.source.end,
		replacement: `${quote}${mappedPath}${quote}`,
	});
}

/**
 * Rewrites static ESM import/export specifiers and string-literal dynamic imports
 * from manifest-owned runtime specifiers to concrete browser public URLs.
 *
 * Exposed for the post-build rewriter and for tests.
 */
export function rewriteBrowserRuntimeImports(
	code: string,
	manifest: BrowserRuntimeManifest,
	filePath = 'browser-runtime-imports.js',
): string {
	if (manifest.assets.length === 0) {
		return code;
	}

	const edits: Edit[] = [];

	try {
		const result = parseModuleSource(filePath, code);

		const walk = (node: unknown) => {
			if (!isRecord(node)) {
				return;
			}

			if (
				node.type === 'ImportDeclaration' ||
				node.type === 'ExportNamedDeclaration' ||
				node.type === 'ExportAllDeclaration'
			) {
				queueReplacement({ code, source: node.source, manifest, edits });
			}

			if (node.type === 'ImportExpression' && isRecord(node.source)) {
				if (node.source.type === 'StringLiteral' || node.source.type === 'Literal') {
					queueReplacement({ code, source: node.source, manifest, edits });
				}
			}

			for (const value of Object.values(node)) {
				if (Array.isArray(value)) {
					for (const child of value) {
						walk(child);
					}
				} else {
					walk(value);
				}
			}
		};

		walk(result.program);
	} catch {
		return code;
	}

	if (edits.length === 0) {
		return code;
	}

	edits.sort((left, right) => right.start - left.start);
	let rewritten = code;
	for (const edit of edits) {
		rewritten = rewritten.slice(0, edit.start) + edit.replacement + rewritten.slice(edit.end);
	}

	return rewritten;
}

function importMightReferenceRuntimeRoots(code: string, rootSpecifiers: readonly string[]): boolean {
	return rootSpecifiers.some((specifier) => code.includes(specifier));
}

export function getBrowserRuntimeManifestFromPlugin(plugin: EcoBuildPlugin): BrowserRuntimeManifest | undefined {
	return (plugin as BrowserRuntimePlugin)[BROWSER_RUNTIME_MANIFEST];
}

/**
 * Returns the exact specifier → publicPath map derived from the plugin manifest.
 */
export function getBrowserRuntimeImportRewriteMap(plugin: EcoBuildPlugin): ReadonlyMap<string, string> | undefined {
	const manifest = getBrowserRuntimeManifestFromPlugin(plugin);
	return manifest ? getBrowserRuntimeSpecifierMap(manifest) : undefined;
}

export function collectBrowserRuntimeManifests(plugins: EcoBuildPlugin[] | undefined): BrowserRuntimeManifest[] {
	const manifests: BrowserRuntimeManifest[] = [];

	for (const plugin of plugins ?? []) {
		const manifest = getBrowserRuntimeManifestFromPlugin(plugin);
		if (manifest) {
			manifests.push(manifest);
		}
	}

	return manifests;
}

export function collectBrowserRuntimeImportRewriteMap(
	plugins: EcoBuildPlugin[] | undefined,
): ReadonlyMap<string, string> {
	return getBrowserRuntimeSpecifierMap(mergeBrowserRuntimeManifests(...collectBrowserRuntimeManifests(plugins)));
}

/**
 * Creates a build plugin that exposes the union of browser-runtime
 * manifest behaviors (alias resolution, public-path matching, and source
 * import/export rewrite). See {@link CreateBrowserRuntimePluginOptions}
 * for per-behavior toggles.
 *
 * Returns `null` for an empty manifest so callers can short-circuit
 * registration without sprinkling `if (plugin)` everywhere.
 */
export function createBrowserRuntimePlugin(options: CreateBrowserRuntimePluginOptions): EcoBuildPlugin | null {
	const { manifest } = options;
	const specifierMap = getBrowserRuntimeSpecifierMap(manifest);
	const specifierFilter = buildSpecifierFilter(specifierMap);

	if (!specifierFilter) {
		return null;
	}

	const external = options.external ?? true;
	const rewriteImports = options.rewriteImports ?? true;
	const matchPublicPaths = options.matchPublicPaths ?? true;
	const publicPathSet = new Set(specifierMap.values());
	const rootSpecifiers = manifest.assets.map((asset) => asset.specifier);

	const plugin: BrowserRuntimePlugin = {
		name: options.name ?? DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME,
		setup(build) {
			build.onResolve({ filter: specifierFilter }, (args) => {
				const mappedPath = resolveBrowserRuntimePublicPath(args.path, manifest);
				if (!mappedPath) {
					return undefined;
				}

				return {
					path: mappedPath,
					external,
				};
			});

			if (matchPublicPaths) {
				build.onResolve({ filter: /^\// }, (args) => {
					if (!publicPathSet.has(args.path)) {
						return undefined;
					}

					return {
						path: args.path,
						external: true,
					};
				});
			}

			if (rewriteImports) {
				build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, (args) => {
					if (!path.isAbsolute(args.path) || !existsSync(args.path)) {
						return undefined;
					}

					const code = readFileSync(args.path, 'utf-8');

					/**
					 * Fast-path optimization: skip AST parsing for files that don't contain
					 * any manifest-owned specifiers. This avoids expensive oxc-parser calls
					 * on every JS/TS file in the dependency graph.
					 */
					if (!importMightReferenceRuntimeRoots(code, rootSpecifiers)) {
						return undefined;
					}

					const rewritten = rewriteBrowserRuntimeImports(code, manifest, args.path);

					if (rewritten === code) {
						return undefined;
					}

					return {
						contents: rewritten,
						loader: inferLoaderFromPath(args.path),
						resolveDir: path.dirname(args.path),
					};
				});
			}
		},
	};

	plugin[BROWSER_RUNTIME_MANIFEST] = manifest;
	return plugin;
}
