/**
 * esbuild plugin bridge.
 *
 * @remarks
 * Translates an array of `EcoBuildPlugin` instances (the runtime-agnostic
 * plugin contract used by Ecopages processors and integrations) into a
 * single esbuild `Plugin` object. The bridge exposes the same three
 * hooks (`onResolve`, `onLoad`, `module`) the `EcoBuildPlugin` contract
 * uses, but maps them to esbuild's `PluginBuild` shape.
 *
 * Extracted from `EsbuildBuildAdapter` per ADR-002 so the bridge can be
 * unit-tested without spinning up a real esbuild service.
 *
 * **Plugin ordering is semantically significant.**
 *
 * Esbuild applies `onResolve` and `onLoad` hooks in the order they are
 * registered: the first handler whose filter matches wins for `onResolve`,
 * and the first handler that returns a non-`undefined` result wins for
 * `onLoad`. Because we call `plugin.setup(bridge)` sequentially here, the
 * position of each plugin in the `plugins` array determines its priority:
 *
 * - **Index 0** has the highest priority (its hooks run first).
 * - **Last index** has the lowest priority (its hooks only run if no
 *   earlier plugin claimed the path).
 *
 * When adding new integrations or processors, ensure security-critical
 * plugins (e.g. `ecopages-client-graph-boundary`) are placed **before**
 * general-purpose loaders in the array so they always get first refusal
 * on every source file.
 */

import path from 'node:path';
import type {
	Loader as EsbuildLoader,
	OnLoadResult as EsbuildOnLoadResult,
	OnResolveResult as EsbuildOnResolveResult,
	Plugin as EsbuildPlugin,
} from 'esbuild';
import { escapeRegExp } from './browser-runtime-plugin-helpers.ts';
import type {
	EcoBuildOnLoadResult,
	EcoBuildPlugin,
	EcoBuildPluginBuilder,
	EcoBuildOnResolveResult,
} from './build-types.ts';

function normalizeEsbuildLoader(loader: unknown): EsbuildLoader | undefined {
	switch (loader) {
		case 'base64':
		case 'binary':
		case 'copy':
		case 'css':
		case 'dataurl':
		case 'empty':
		case 'file':
		case 'global-css':
		case 'js':
		case 'json':
		case 'jsx':
		case 'local-css':
		case 'text':
		case 'ts':
		case 'tsx':
			return loader as EsbuildLoader;
		default:
			return undefined;
	}
}

function inferEsbuildLoaderFromPath(filePath: string): EsbuildLoader {
	const extension = path.extname(filePath).toLowerCase();

	switch (extension) {
		case '.ts':
			return 'ts';
		case '.tsx':
			return 'tsx';
		case '.jsx':
			return 'jsx';
		case '.json':
			return 'json';
		case '.css':
			return 'css';
		default:
			return 'js';
	}
}

function convertLoadResultToModuleSource(result: EcoBuildOnLoadResult): string | undefined {
	if (result.loader === 'object' && result.exports && typeof result.exports === 'object') {
		return Object.entries(result.exports)
			.map(([key, value]) =>
				key === 'default'
					? `export default ${JSON.stringify(value)};`
					: `export const ${key} = ${JSON.stringify(value)};`,
			)
			.join('\n');
	}

	return undefined;
}

function convertPluginOnLoadResult(args: { path: string }, result: unknown): EsbuildOnLoadResult | undefined {
	if (!result || typeof result !== 'object') {
		return undefined;
	}

	const candidate = result as EcoBuildOnLoadResult;

	const sourceFromExports = convertLoadResultToModuleSource(candidate);

	if (sourceFromExports) {
		return {
			contents: sourceFromExports,
			loader: 'js',
			resolveDir: path.dirname(args.path),
		};
	}

	if (typeof candidate.contents === 'string' || candidate.contents instanceof Uint8Array) {
		return {
			contents: candidate.contents,
			loader: normalizeEsbuildLoader(candidate.loader) ?? inferEsbuildLoaderFromPath(args.path),
			resolveDir: typeof candidate.resolveDir === 'string' ? candidate.resolveDir : path.dirname(args.path),
		};
	}

	return undefined;
}

function resolvePluginPath(value: string, args: { importer: string }, contextRoot: string): string {
	if (path.isAbsolute(value)) {
		return value;
	}

	if (value.startsWith('.') || value.startsWith('..')) {
		const baseDir = args.importer ? path.dirname(args.importer) : contextRoot;
		return path.resolve(baseDir, value);
	}

	return value;
}

/**
 * Creates an esbuild `Plugin` that drives the supplied `EcoBuildPlugin`
 * instances. The returned plugin's `setup` is async because esbuild
 * callbacks may be async.
 */
export function createEsbuildPluginBridge(plugins: EcoBuildPlugin[], contextRoot: string): EsbuildPlugin {
	return {
		name: 'ecopages-plugin-bridge',
		setup: async (build) => {
			let moduleCounter = 0;

			const bridge: EcoBuildPluginBuilder = {
				onResolve: (options, callback) => {
					build.onResolve(options, async (args) => {
						const result = await callback({
							path: args.path,
							importer: args.importer,
							namespace: args.namespace,
						});

						if (!result || typeof result !== 'object') {
							return undefined;
						}

						const candidate = result as EcoBuildOnResolveResult;
						const resolveResult: EsbuildOnResolveResult = {};

						if (typeof candidate.path === 'string') {
							resolveResult.path = resolvePluginPath(candidate.path, args, contextRoot);
						}

						if (typeof candidate.namespace === 'string') {
							resolveResult.namespace = candidate.namespace;
						}

						if (typeof candidate.external === 'boolean') {
							resolveResult.external = candidate.external;
						}

						return Object.keys(resolveResult).length > 0 ? resolveResult : undefined;
					});
				},
				onLoad: (options, callback) => {
					build.onLoad(options, async (args) =>
						convertPluginOnLoadResult(args, await callback({ path: args.path, namespace: args.namespace })),
					);
				},
				module: (specifier, callback) => {
					const namespace = `ecopages-module-${moduleCounter}`;
					moduleCounter += 1;
					const filter = new RegExp(`^${escapeRegExp(specifier)}$`);

					build.onResolve({ filter }, () => ({ path: specifier, namespace }));

					build.onLoad({ filter, namespace }, async (args) =>
						convertPluginOnLoadResult(args, await callback()),
					);
				},
			};

			for (const plugin of plugins) {
				await plugin.setup(bridge);
			}
		},
	};
}
