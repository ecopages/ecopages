/**
 * Bun plugin bridge.
 *
 * @remarks
 * Translates an array of `EcoBuildPlugin` instances (the runtime-agnostic
 * plugin contract used by Ecopages processors and integrations) into a
 * single Bun `plugin` object. The bridge exposes the same three hooks
 * (`onResolve`, `onLoad`, `module`) the `EcoBuildPlugin` contract uses,
 * but maps them to Bun's `BunPluginBuilder` shape.
 *
 * Extracted from `BunBuildAdapter` per ADR-002 so the bridge can be
 * unit-tested without spinning up a real Bun runtime.
 */

import path from 'node:path';
import { escapeRegExp } from './browser-runtime-plugin-helpers.ts';
import type { EcoBuildOnLoadResult, EcoBuildPlugin, EcoBuildPluginBuilder } from './build-types.ts';

function normalizeBunLoader(loader: unknown): Bun.Loader | undefined {
	switch (loader) {
		case 'js':
		case 'jsx':
		case 'ts':
		case 'tsx':
		case 'json':
		case 'toml':
		case 'text':
		case 'file':
		case 'css':
			return loader;
		case 'global-css':
		case 'local-css':
			return 'css';
		default:
			return undefined;
	}
}

function inferBunLoaderFromPath(filePath: string): Bun.Loader {
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

function convertPluginOnLoadResult(args: { path: string }, result: unknown): Bun.OnLoadResult | undefined {
	if (!result || typeof result !== 'object') {
		return undefined;
	}

	const candidate = result as EcoBuildOnLoadResult;

	const sourceFromExports = convertLoadResultToModuleSource(candidate);

	if (sourceFromExports) {
		return {
			contents: sourceFromExports,
			loader: 'js',
			...(typeof candidate.resolveDir === 'string' ? { resolveDir: candidate.resolveDir } : {}),
		};
	}

	if (typeof candidate.contents === 'string' || candidate.contents instanceof Uint8Array) {
		return {
			contents: candidate.contents,
			loader: normalizeBunLoader(candidate.loader) ?? inferBunLoaderFromPath(args.path),
			...(typeof candidate.resolveDir === 'string' ? { resolveDir: candidate.resolveDir } : {}),
		};
	}

	return undefined;
}

function resolvePluginPath(value: string, importer: string, contextRoot: string): string {
	if (path.isAbsolute(value)) {
		return value;
	}

	if (value.startsWith('.') || value.startsWith('..')) {
		const baseDir = importer ? path.dirname(importer) : contextRoot;
		return path.resolve(baseDir, value);
	}

	return value;
}

/**
 * Creates a Bun `plugin` object that drives the supplied
 * `EcoBuildPlugin` instances. The returned plugin's `setup` is async
 * because Bun callbacks may be async.
 */
export function createBunPluginBridge(plugins: EcoBuildPlugin[], contextRoot: string): Bun.BunPlugin {
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
							return undefined as unknown as Bun.OnResolveResult;
						}

						const resolved: { path?: string; namespace?: string; external?: boolean } = {};
						if (typeof result.path === 'string') {
							resolved.path = resolvePluginPath(result.path, args.importer, contextRoot);
						}
						if (typeof result.namespace === 'string') {
							resolved.namespace = result.namespace;
						}
						if (typeof result.external === 'boolean') {
							resolved.external = result.external;
						}
						return resolved as Bun.OnResolveResult;
					});
				},
				onLoad: (options, callback) => {
					build.onLoad(options, async (args) =>
						convertPluginOnLoadResult(
							{ path: args.path },
							await callback({ path: args.path, namespace: args.namespace }),
						),
					);
				},
				module: (specifier, callback) => {
					const namespace = `ecopages-module-${moduleCounter}`;
					moduleCounter += 1;
					const filter = new RegExp(`^${escapeRegExp(specifier)}$`);

					build.onResolve({ filter }, async () => ({ path: specifier, namespace }));

					build.onLoad({ filter, namespace }, async () =>
						convertPluginOnLoadResult({ path: specifier }, await callback()),
					);
				},
			};

			for (const plugin of plugins) {
				await plugin.setup(bridge);
			}
		},
	};
}
