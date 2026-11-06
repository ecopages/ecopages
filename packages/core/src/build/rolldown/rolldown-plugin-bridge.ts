/**
 * Bundler plugin bridge.
 *
 * @remarks
 * Translates `EcoBuildPlugin` instances (the runtime-agnostic plugin contract used by Ecopages
 * processors and integrations) into Rolldown plugins. Every handler a plugin registers becomes its
 * own Rolldown plugin, named after the `EcoBuildPlugin` and carrying the handler's filter as a native
 * hook filter: `onResolve` maps to `resolveId`, `onLoad` to `load`, `transform` to `transform`,
 * `onEnd` to `buildEnd`, and `module` to a `resolveId` and `load` pair for a `\0` virtual id.
 *
 * **Plugin ordering is semantically significant.**
 *
 * The Rolldown plugins keep the order of the `plugins` array, and of the handlers inside each
 * plugin. Rolldown gives the first non-null `resolveId` and `load` result precedence, and runs every
 * matching `transform` in order, chaining their source maps. Index 0 has the highest priority, so
 * security-critical plugins (e.g. `ecopages-client-graph-boundary`) go **before** general-purpose
 * loaders, to get first refusal on every source file.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import type {
	LoadResult,
	PartialResolvedId,
	Plugin,
	PluginContext,
	RolldownLog,
	SourceDescription,
	SourceMapInput,
} from 'rolldown';
import { exclude, id as idFilter, include, type TopLevelFilterExpression } from 'rolldown/filter';
import { escapeRegExp } from '../../utils/regex-escaping.ts';
import { isUsableSourceMap } from '../source-maps.ts';
import type {
	EcoBuildFilter,
	EcoBuildOnLoadResult,
	EcoBuildOnResolveResult,
	EcoBuildOnTransformResult,
	EcoBuildPlugin,
	EcoBuildPluginBuilder,
	EcoBuildResolvedId,
} from '../contracts/build-types.ts';

/** Files each module's plugins declared with `addWatchFile`, keyed by Rolldown module id. */
export type WatchFilesByModule = Map<string, Set<string>>;

const VIRTUAL_MODULE_ID = /^\0/;

const ROLLDOWN_MODULE_LOADERS = new Set(['js', 'jsx', 'ts', 'tsx']);

function inferModuleType(filePath: string): SourceDescription['moduleType'] {
	switch (path.extname(filePath).toLowerCase()) {
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

function resolvePluginPath(value: string, importer: string | undefined, contextRoot: string): string {
	if (path.isAbsolute(value) || !value.startsWith('.')) {
		return value;
	}
	return path.resolve(importer ? path.dirname(importer) : contextRoot, value);
}

function toResolveResult(
	result: EcoBuildOnResolveResult | undefined,
	source: string,
	importer: string | undefined,
	contextRoot: string,
): PartialResolvedId | null {
	if (!result || (typeof result.path !== 'string' && typeof result.external !== 'boolean')) {
		return null;
	}
	return {
		id: typeof result.path === 'string' ? resolvePluginPath(result.path, importer, contextRoot) : source,
		...(typeof result.external === 'boolean' ? { external: result.external } : {}),
	};
}

/**
 * Narrows a bundler-agnostic map to Rolldown's `SourceMapInput`.
 *
 * @remarks
 * `map` is `unknown` so plugin authors stay free of Rolldown types. Only usable maps (see
 * {@link isUsableSourceMap}) and `null` (keep the incoming map) pass; anything else is `undefined`.
 */
function toSourceMapInput(value: unknown): SourceMapInput | null | undefined {
	if (value === null) return null;
	return isUsableSourceMap(value) ? (value as SourceMapInput) : undefined;
}

function toLoadResult(result: EcoBuildOnLoadResult | undefined, id: string): LoadResult {
	if (!result || (typeof result.contents !== 'string' && !(result.contents instanceof Uint8Array))) {
		return null;
	}
	const map = toSourceMapInput(result.map);
	return {
		code: typeof result.contents === 'string' ? result.contents : new TextDecoder().decode(result.contents),
		moduleType:
			typeof result.loader === 'string' && ROLLDOWN_MODULE_LOADERS.has(result.loader)
				? result.loader
				: inferModuleType(id),
		...(map !== undefined ? { map } : {}),
	};
}

/**
 * Converts a transform result to Rolldown's shape.
 *
 * @remarks
 * A rewrite without a usable map gets empty `mappings`, so Rolldown does not emit SOURCEMAP_BROKEN
 * and the chained map does not point at stale source positions. An unchanged result is `null`.
 */
function toTransformResult(
	result: EcoBuildOnTransformResult | string | undefined,
	code: string,
): SourceDescription | null {
	if (result === undefined) return null;
	const transformed = typeof result === 'string' ? result : result.code;
	const map = typeof result === 'string' ? undefined : toSourceMapInput(result.map);
	if (map === undefined && transformed === code) return null;
	return { code: transformed, map: map === undefined ? { mappings: '' } : map };
}

/**
 * Copies an error an `EcoBuildPlugin` threw, adding the module id it failed on.
 *
 * @remarks
 * Rolldown writes `code`, `plugin` and `hook` onto a thrown error and leaves `id` unset, so a plugin
 * that throws one shared or frozen error for several modules would lose its attribution. The copy
 * keeps the thrown value unchanged as `cause`. `plugin` is set only for a `setup` error, which is
 * thrown before Rolldown runs.
 */
function toPluginError(thrown: unknown, id: string | undefined, plugin?: string): Error {
	const source: Partial<RolldownLog> = typeof thrown === 'object' && thrown !== null ? thrown : {};
	const error: Error & Partial<RolldownLog> = new Error(
		typeof source.message === 'string' ? source.message : String(thrown),
		{ cause: thrown },
	);
	if (typeof source.stack === 'string') error.stack = source.stack;
	const errorId = typeof source.id === 'string' ? source.id : id;
	if (errorId) error.id = errorId;
	if (source.loc) error.loc = source.loc;
	if (typeof source.frame === 'string') error.frame = source.frame;
	if (plugin) error.plugin = plugin;
	return error;
}

async function attribute<T>(id: string | undefined, run: () => T | Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (thrown) {
		throw toPluginError(thrown, id);
	}
}

function toHookFilter(options: EcoBuildFilter, cleanUrl = false): TopLevelFilterExpression[] {
	return [
		...(options.exclude ? [exclude(idFilter(options.exclude, { cleanUrl }))] : []),
		include(idFilter(options.filter, { cleanUrl })),
	];
}

function exactIdFilter(value: string): TopLevelFilterExpression[] {
	return [include(idFilter(new RegExp(`^${escapeRegExp(value)}$`)))];
}

type HookScope = {
	addWatchFile(filePath: string): void;
	resolve(specifier: string, importer: string): Promise<EcoBuildResolvedId | undefined>;
};

/**
 * The `onLoad` or `transform` call a builder's `addWatchFile` and `resolve` belong to.
 *
 * @remarks
 * Rolldown runs hooks for many modules at once, so the module a call is for travels with its async
 * context instead of living on the builder.
 */
const hookScope = new AsyncLocalStorage<HookScope>();

/**
 * Creates the Rolldown plugins that drive the supplied `EcoBuildPlugin` instances.
 *
 * @remarks
 * Every `setup` runs here, in order, before any Rolldown plugin exists, because Rolldown reads hook
 * filters when a plugin is registered; a handler registered later throws. Every builder shares one
 * `entrypoints` object, so a plugin can key state on it for one build. Transform filters are tested
 * with the query and hash stripped and never see a `\0` virtual id. Rolldown tests filters against
 * ids with `/` separators, so a filter written for backslash separators does not match on Windows.
 *
 * @param plugins - `EcoBuildPlugin` instances registered for this build.
 * @param contextRoot - Project root used to resolve a relative path an `onResolve` callback returns.
 * @param options.watchFiles - Receives each file a callback declares with `addWatchFile`, under the module it ran for.
 */
export async function createRolldownPluginBridge(
	plugins: EcoBuildPlugin[],
	contextRoot: string,
	options: { entrypoints?: Readonly<Record<string, string>>; watchFiles?: WatchFilesByModule } = {},
): Promise<Plugin[]> {
	const rolldownPlugins: Plugin[] = [];
	let registrationClosed = false;
	const assertOpen = (method: string): void => {
		if (registrationClosed) {
			throw new Error(
				`[ecopages] build.${method}() was called after the plugin setup finished. Register build plugin handlers before setup returns or its promise resolves.`,
			);
		}
	};
	const inModule = <T>(context: Pick<PluginContext, 'addWatchFile' | 'resolve'>, moduleId: string, run: () => T): T =>
		hookScope.run(
			{
				addWatchFile(filePath) {
					const resolved = path.resolve(contextRoot, filePath);
					context.addWatchFile(resolved);
					if (!options.watchFiles) return;
					const files = options.watchFiles.get(moduleId) ?? new Set<string>();
					files.add(resolved);
					options.watchFiles.set(moduleId, files);
				},
				async resolve(specifier, importer) {
					const resolved = await context.resolve(specifier, importer, { skipSelf: true });
					return resolved ? { id: resolved.id, external: Boolean(resolved.external) } : undefined;
				},
			},
			run,
		);
	const currentScope = (method: string, name: string): HookScope => {
		const scope = hookScope.getStore();
		if (!scope) {
			throw new Error(
				`[ecopages] build.${method}() was called outside an onLoad or transform callback of "${name}".`,
			);
		}
		return scope;
	};

	for (const ecoPlugin of plugins) {
		const name = ecoPlugin.name;
		const builder: EcoBuildPluginBuilder = {
			...(options.entrypoints ? { entrypoints: options.entrypoints } : {}),
			onResolve(filter, callback) {
				assertOpen('onResolve');
				rolldownPlugins.push({
					name,
					resolveId: {
						filter: toHookFilter(filter),
						handler: async (source, importer) =>
							toResolveResult(
								await attribute(importer, () => callback({ path: source, importer })),
								source,
								importer,
								contextRoot,
							),
					},
				});
			},
			onLoad(filter, callback) {
				assertOpen('onLoad');
				rolldownPlugins.push({
					name,
					load: {
						filter: toHookFilter(filter),
						async handler(id) {
							return toLoadResult(
								await attribute(id, () => inModule(this, id, () => callback({ path: id }))),
								id,
							);
						},
					},
				});
			},
			module(specifier, callback) {
				assertOpen('module');
				const virtualId = `\0${specifier}`;
				rolldownPlugins.push({
					name,
					resolveId: { filter: exactIdFilter(specifier), handler: () => virtualId },
					load: {
						filter: exactIdFilter(virtualId),
						handler: async () => toLoadResult(await attribute(specifier, callback), specifier),
					},
				});
			},
			transform(filter, callback) {
				assertOpen('transform');
				rolldownPlugins.push({
					name,
					transform: {
						filter: [exclude(idFilter(VIRTUAL_MODULE_ID)), ...toHookFilter(filter, true)],
						async handler(code, id) {
							return toTransformResult(
								await attribute(id, () => inModule(this, id, () => callback(code, id))),
								code,
							);
						},
					},
				});
			},
			onEnd(callback) {
				assertOpen('onEnd');
				rolldownPlugins.push({
					name,
					async buildEnd(error) {
						if (!error) await attribute(undefined, callback);
					},
				});
			},
			addWatchFile(filePath) {
				currentScope('addWatchFile', name).addWatchFile(filePath);
			},
			resolve(specifier, importer) {
				return currentScope('resolve', name).resolve(specifier, importer);
			},
		};

		try {
			await ecoPlugin.setup(builder);
		} catch (thrown) {
			throw toPluginError(thrown, undefined, name);
		}
	}
	registrationClosed = true;

	return rolldownPlugins;
}
