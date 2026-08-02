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
 * The plugin object carries the manifest's `specifier → publicPath` map
 * under `BROWSER_RUNTIME_IMPORT_REWRITE_MAP` so
 * `collectBrowserRuntimeImportRewriteMap` and the post-build rewriter can
 * read it without re-walking the manifest.
 *
 * This is the single source of truth for browser-runtime plugin behavior.
 * Per-bundler bridges can treat it as a single plugin.
 */

import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import { parseModuleSource } from '../../cache/module-parse-cache.ts';
import type { EcoBuildLoader, EcoBuildPlugin } from '../contracts/build-types.ts';
import { getBrowserRuntimeSpecifierMap, type BrowserRuntimeManifest } from './browser-runtime-manifest.ts';
import { buildSpecifierFilter } from './browser-runtime-plugin-helpers.ts';

type Edit = {
	start: number;
	end: number;
	replacement: string;
};

/**
 * Symbol used to attach the manifest's `specifier → publicPath` map to a
 * plugin instance. Consumers read it via `getBrowserRuntimeImportRewriteMap`
 * or `collectBrowserRuntimeImportRewriteMap`.
 */
export const BROWSER_RUNTIME_IMPORT_REWRITE_MAP = Symbol.for('ecopages.browserRuntimeImportRewriteMap');

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
	[BROWSER_RUNTIME_IMPORT_REWRITE_MAP]?: ReadonlyMap<string, string>;
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
	specifierMap: ReadonlyMap<string, string>;
	edits: Edit[];
}): void {
	if (!isRecord(options.source) || typeof options.source.value !== 'string') {
		return;
	}

	const mappedPath = options.specifierMap.get(options.source.value);
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
	specifierMap: ReadonlyMap<string, string>,
	filePath = 'browser-runtime-imports.js',
): string {
	if (specifierMap.size === 0) {
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
				queueReplacement({ code, source: node.source, specifierMap, edits });
			}

			if (node.type === 'ImportExpression' && isRecord(node.source)) {
				if (node.source.type === 'StringLiteral' || node.source.type === 'Literal') {
					queueReplacement({ code, source: node.source, specifierMap, edits });
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

export function getBrowserRuntimeImportRewriteMap(plugin: EcoBuildPlugin): ReadonlyMap<string, string> | undefined {
	return (plugin as BrowserRuntimePlugin)[BROWSER_RUNTIME_IMPORT_REWRITE_MAP];
}

export function collectBrowserRuntimeImportRewriteMap(
	plugins: EcoBuildPlugin[] | undefined,
): ReadonlyMap<string, string> {
	const merged = new Map<string, string>();

	for (const plugin of plugins ?? []) {
		const specifierMap = getBrowserRuntimeImportRewriteMap(plugin);
		if (!specifierMap) {
			continue;
		}

		for (const [specifier, publicPath] of specifierMap.entries()) {
			if (!merged.has(specifier)) {
				merged.set(specifier, publicPath);
			}
		}
	}

	return merged;
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

	const specifierKeys = Array.from(specifierMap.keys());

	const plugin: BrowserRuntimePlugin = {
		name: options.name ?? DEFAULT_BROWSER_RUNTIME_PLUGIN_NAME,
		setup(build) {
			build.onResolve({ filter: specifierFilter }, (args) => {
				const mappedPath = specifierMap.get(args.path);
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
					if (!specifierKeys.some((specifier) => code.includes(specifier))) {
						return undefined;
					}

					const rewritten = rewriteBrowserRuntimeImports(code, specifierMap, args.path);

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

	plugin[BROWSER_RUNTIME_IMPORT_REWRITE_MAP] = specifierMap;
	return plugin;
}
