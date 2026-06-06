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
 *
 * The bridge plugin object's type is `BunPlugin` from the Bun runtime;
 * we type it structurally here so this module does not import the Bun
 * types directly (Bun is a peer-of-the-runtime, not a hard dependency).
 */

import path from 'node:path';
import { escapeRegExp } from './browser-runtime-plugin-helpers.ts';
import type {
	EcoBuildOnLoadResult,
	EcoBuildPlugin,
	EcoBuildPluginBuilder,
} from './build-types.ts';

type BunResolveResult = {
	path?: string;
	namespace?: string;
	external?: boolean;
};

type BunLoadResult = {
	contents?: string | Uint8Array;
	loader?: string;
	resolveDir?: string;
};

export type BunPluginBuilderLike = {
	config?: {
		external?: string[];
	};
	onResolve(
		options: { filter: RegExp; namespace?: string },
		callback: (args: { path: string; importer: string; namespace?: string }) =>
			| BunResolveResult
			| undefined
			| Promise<BunResolveResult | undefined>,
	): void;
	onLoad(
		options: { filter: RegExp; namespace?: string },
		callback: (args: { path: string; namespace?: string }) =>
			| BunLoadResult
			| undefined
			| Promise<BunLoadResult | undefined>,
	): void;
};

export type BunPluginObject = {
	name: string;
	setup: (build: BunPluginBuilderLike) => void | Promise<void>;
};

function normalizeBunLoader(loader: unknown): string | undefined {
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

function inferBunLoaderFromPath(filePath: string): string {
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

function convertPluginOnLoadResult(
	args: { path: string },
	result: unknown,
): BunLoadResult | undefined {
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
export function createBunPluginBridge(plugins: EcoBuildPlugin[], contextRoot: string): BunPluginObject {
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

						return {
							...(typeof result.path === 'string'
								? { path: resolvePluginPath(result.path, args.importer, contextRoot) }
								: {}),
							...(typeof result.namespace === 'string' ? { namespace: result.namespace } : {}),
							...(typeof result.external === 'boolean' ? { external: result.external } : {}),
						};
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
