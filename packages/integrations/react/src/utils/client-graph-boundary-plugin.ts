/**
 * @module ClientGraphBoundaryPlugin
 *
 * Build plugin securing the Ecopages isomorphic compilation pipeline.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import { ClientGraphBoundaryCache, type CachedTransform } from './client-graph-boundary-cache.ts';
import type { RequestedExportRules } from './client-graph-boundary-cache.ts';
import {
	parseDeclaredModules,
	toModuleBaseSpecifier,
	mergeRequestedExportRules,
	snapshotRegistry,
	diffRequestedExportRules,
} from './client-graph-reachability.ts';
import { transformModuleImports } from './client-graph-ast-transform.ts';

const SOURCE_FILE_FILTER = /\.(tsx?|jsx?)$/;

/**
 * Configuration options for the Client Graph Boundary build plugin.
 *
 * This plugin serves as the primary security layer between server-only logic and the client-side JavaScript bundle.
 * It prevents Node.js built-ins (`node:fs`, `node:path`) and backend-exclusive dependencies (e.g. `pg`, `redis`)
 * from accidentally leaking into the browser compilation step, which would cause immediate crashes.
 */
type ClientGraphBoundaryOptions = {
	/** Absolute path to the app project root, used for tsconfig path alias classification. */
	projectRoot?: string;
	/** Absolute path to the current working directory, used as a root fallback for resolving inline file reads. */
	absWorkingDir?: string;
	/**
	 * Array of module specifiers that are explicitly whitelisted to be bundled in the client code.
	 * This is typically populated by parsing `modules: ["..."]` declarations in React/Lit components.
	 */
	declaredModules?: readonly string[];
	/** Array of emergency escape-hatch specifiers that always bypass the boundary checks regardless of component declarations. */
	alwaysAllowSpecifiers?: string[];
	/**
	 * Persistent per-app cache for transform results. Owned by the React
	 * plugin for the app's lifetime; survives across HMR rebuilds. When
	 * omitted, transforms are still memoized inside the plugin for the
	 * duration of a single build but not across builds.
	 */
	cache?: ClientGraphBoundaryCache;
};

/**
 * Instantiates the client graph boundary build plugin.
 *
 * @param options - Configuration options for the graph boundary.
 * @returns The resulting `EcoBuildPlugin`.
 */
export function createClientGraphBoundaryPlugin(options?: ClientGraphBoundaryOptions): EcoBuildPlugin {
	return {
		name: 'ecopages-client-graph-boundary',
		setup(build) {
			const absWorkingDir = options?.absWorkingDir ?? process.cwd();
			const cache = options?.cache;
			const globallyDeclaredSources = parseDeclaredModules(options?.declaredModules);
			const requestedExports = new Map<string, RequestedExportRules>();
			for (const alwaysAllow of options?.alwaysAllowSpecifiers ?? []) {
				globallyDeclaredSources.set(toModuleBaseSpecifier(alwaysAllow), '*');
			}

			/**
			 * Stable list of globally-allowed specifiers, used as part of
			 * the cache key. Sorted on construction so iteration order is
			 * deterministic for hashing.
			 */
			const allowListForCache = Array.from(globallyDeclaredSources.keys()).sort();

			build.onLoad({ filter: SOURCE_FILE_FILTER }, (args) => {
				let source: string;
				try {
					source = readFileSync(args.path, 'utf-8');
				} catch {
					return undefined;
				}

				/**
				 * Fast path: if the cache has a transform result for this
				 * exact (filePath, source, allowList) tuple, replay the
				 * captured `rulesAdded` into the live registry and return
				 * the cached transformed source. Skips the entire
				 * `parseSync` + AST walk on a no-op rebuild.
				 */
				if (cache) {
					const cached = cache.get(args.path, source, allowListForCache);
					if (cached) {
						for (const [moduleKey, rules] of cached.rulesAdded) {
							mergeRequestedExportRules(requestedExports, moduleKey, rules);
						}
						if (!cached.modified) return undefined;
						const ext = extname(args.path).slice(1) as 'ts' | 'tsx' | 'js' | 'jsx';
						return { contents: cached.transformed, loader: ext, resolveDir: dirname(args.path) };
					}
				}

				let transformed = source;
				let modified = false;

				if (source.includes('readFileSync')) {
					const readFileTransformed = transformed.replace(
						/\bfs\.readFileSync\s*\(\s*path\.resolve\s*\(\s*(['"`])([^'"`\n]+)\1\s*\)\s*,\s*['"`]utf-?8['"`]\s*\)/g,
						(_match, _q, relPath) => {
							modified = true;
							try {
								const sourceDir = dirname(args.path);
								const srcDirIndex = args.path.lastIndexOf('/src/');
								const inferredProjectRoot =
									srcDirIndex >= 0 ? args.path.slice(0, srcDirIndex) : undefined;
								const candidates = [
									resolve(absWorkingDir, relPath),
									resolve(process.cwd(), relPath),
									resolve(sourceDir, relPath),
									...(inferredProjectRoot ? [resolve(inferredProjectRoot, relPath)] : []),
								];

								const absolutePath = candidates.find((candidate) => existsSync(candidate));
								if (!absolutePath) return '""';

								const content = readFileSync(absolutePath, 'utf-8');
								return JSON.stringify(content);
							} catch {
								return '""';
							}
						},
					);
					transformed = readFileTransformed;
				}

				// Snapshot the live registry so we can diff per-key after
				// the transform. We must capture the **after-state** of
				// every key the transform touched — including keys that
				// already existed and grew via Set union or were promoted
				// to `'*'`. A snapshot keyed only on newly-added entries
				// would under-populate the registry on cache hit.
				const registryBefore = snapshotRegistry(requestedExports);
				const { transformed: oxcTransformed, modified: importsModified } = transformModuleImports(
					transformed,
					args.path,
					globallyDeclaredSources,
					requestedExports,
					options?.projectRoot,
				);

				if (importsModified) {
					modified = true;
					transformed = oxcTransformed;
				}

				// Build the rulesAdded diff for cache storage.
				if (cache) {
					const rulesAdded = new Map<string, RequestedExportRules>();
					for (const [key, afterRules] of requestedExports) {
						const beforeRules = registryBefore.get(key);
						const diff = diffRequestedExportRules(beforeRules, afterRules);
						if (!diff) continue;
						rulesAdded.set(key, diff);
					}
					const entry: Omit<CachedTransform, 'sourceHash' | 'allowListHash'> = {
						transformed,
						modified,
						rulesAdded,
					};
					cache.set(args.path, source, allowListForCache, entry);
				}

				if (!modified) return undefined;

				const ext = extname(args.path).slice(1) as 'ts' | 'tsx' | 'js' | 'jsx';
				return { contents: transformed, loader: ext, resolveDir: dirname(args.path) };
			});
		},
	};
}
