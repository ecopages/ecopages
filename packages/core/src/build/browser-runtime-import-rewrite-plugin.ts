import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import { parseSync } from 'oxc-parser';
import type { EcoBuildLoader, EcoBuildPlugin } from './build-types.ts';
import { getBrowserRuntimeSpecifierMap, type BrowserRuntimeManifest } from './browser-runtime-manifest.ts';

type Edit = {
	start: number;
	end: number;
	replacement: string;
};

const BROWSER_RUNTIME_IMPORT_REWRITE_MAP = Symbol.for('ecopages.browserRuntimeImportRewriteMap');

type BrowserRuntimeImportRewritePlugin = EcoBuildPlugin & {
	[BROWSER_RUNTIME_IMPORT_REWRITE_MAP]?: ReadonlyMap<string, string>;
};

export const DEFAULT_BROWSER_RUNTIME_IMPORT_REWRITE_PLUGIN_NAME = 'browser-runtime-import-rewrite';

export type CreateBrowserRuntimeImportRewritePluginOptions = {
	/** Stable build plugin name used for deduplication and selective exclusion. */
	name?: string;
	/** Manifest containing specifier-to-public-URL runtime asset mappings. */
	manifest: BrowserRuntimeManifest;
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

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
		const result = parseSync(filePath, code, {
			sourceType: 'module',
			lang: path.extname(filePath).endsWith('x') ? 'tsx' : 'ts',
		});

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
	return (plugin as BrowserRuntimeImportRewritePlugin)[BROWSER_RUNTIME_IMPORT_REWRITE_MAP];
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
 * Creates a build plugin that applies browser runtime manifest import rewrites
 * before the bundler resolves source modules.
 *
 * @remarks
 * This is the migration path away from browser import-map-style runtime aliases:
 * generated and authored browser modules can keep importing manifest-owned
 * specifiers, while the build turns those specifiers into concrete public URLs.
 */
export function createBrowserRuntimeImportRewritePlugin(
	options: CreateBrowserRuntimeImportRewritePluginOptions,
): EcoBuildPlugin | null {
	const specifierMap = getBrowserRuntimeSpecifierMap(options.manifest);
	const publicPathSet = new Set(specifierMap.values());
	const specifierFilter = new RegExp(`^(${Array.from(specifierMap.keys()).map(escapeRegExp).join('|')})$`);

	if (specifierMap.size === 0) {
		return null;
	}

	const plugin: BrowserRuntimeImportRewritePlugin = {
		name: options.name ?? DEFAULT_BROWSER_RUNTIME_IMPORT_REWRITE_PLUGIN_NAME,
		setup(build) {
			build.onResolve({ filter: specifierFilter }, (args) => {
				const mappedPath = specifierMap.get(args.path);
				if (!mappedPath) {
					return undefined;
				}

				return {
					path: mappedPath,
					external: true,
				};
			});

			build.onResolve({ filter: /^\// }, (args) => {
				if (!publicPathSet.has(args.path)) {
					return undefined;
				}

				return {
					path: args.path,
					external: true,
				};
			});

			build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, (args) => {
				if (!path.isAbsolute(args.path) || !existsSync(args.path)) {
					return undefined;
				}

				const code = readFileSync(args.path, 'utf-8');
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
		},
	};

	plugin[BROWSER_RUNTIME_IMPORT_REWRITE_MAP] = specifierMap;
	return plugin;
}
