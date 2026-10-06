/**
 * Bundler plugin bridge.
 *
 * @remarks
 * Translates an array of `EcoBuildPlugin` instances (the runtime-agnostic
 * plugin contract used by Ecopages processors and integrations) into
 * the bundler's native `Plugin` array. The bridge exposes the same
 * four hooks (`onResolve`, `onLoad`, `transform`, `module`) the
 * `EcoBuildPlugin` contract uses, but maps them to the bundler's
 * `resolveId`/`load`/`transform` hooks.
 *
 * The shared `EcoBuildPlugin` contract stays the boundary between
 * integrations and bundler backends.
 *
 * **Namespace handling.**
 *
 * The shared `EcoBuildPlugin` contract scopes `onResolve`/`onLoad`
 * handlers with a `namespace` string. The bundler encodes namespaces
 * into the module id (no separate field). The bridge prepends
 * `<namespace>:` to the resolved id when the result includes a
 * namespace. A namespaced `onLoad`/`onResolve` filter matches only ids
 * with that prefix, and is tested against the path after it. The bridge
 * strips the prefix before forwarding the id back
 * to the callback so plugin code keeps seeing the same `path` shape
 * it did on the historical contract.
 *
 * **Plugin ordering is semantically significant.**
 *
 * All `EcoBuildPlugin` instances are merged into one Rolldown plugin.
 * Its `resolveId` and `load` check the registrations in `plugins` array
 * order, and the first non-null result wins. `transform` runs every
 * matching registration in array order. The position of each plugin in
 * the array determines its priority:
 *
 * - **Index 0** has the highest priority.
 * - **Last index** has the lowest priority.
 *
 * When adding new integrations or processors, ensure security-critical
 * plugins (e.g. `ecopages-client-graph-boundary`) are placed **before**
 * general-purpose loaders in the array so they always get first refusal
 * on every source file.
 */

import path from 'node:path';
import type {
	LoadResult,
	PartialResolvedId,
	Plugin,
	ResolveIdResult,
	RolldownLog,
	SourceDescription,
	SourceMapInput,
} from 'rolldown';
import { id as idFilter, include } from 'rolldown/filter';
import { escapeRegExp } from '../browser/browser-runtime-plugin-helpers.ts';
import type {
	EcoBuildOnLoadArgs,
	EcoBuildOnLoadResult,
	EcoBuildOnResolveArgs,
	EcoBuildOnResolveResult,
	EcoBuildOnTransformResult,
	EcoBuildPlugin,
	EcoBuildPluginBuilder,
} from '../contracts/build-types.ts';

const NAMESPACE_SEPARATOR = ':';

function joinNamespace(namespace: string | undefined, value: string): string {
	return namespace ? `${namespace}${NAMESPACE_SEPARATOR}${value}` : value;
}

function splitNamespace(id: string): { namespace: string | undefined; path: string } {
	const separatorIndex = id.indexOf(NAMESPACE_SEPARATOR);
	if (separatorIndex <= 0) {
		return { namespace: undefined, path: id };
	}
	return {
		namespace: id.slice(0, separatorIndex),
		path: id.slice(separatorIndex + 1),
	};
}

function inferRolldownModuleTypeFromPath(filePath: string): string {
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

const DIRECT_ROLLDOWN_MODULE_LOADERS = new Set([
	'js',
	'jsx',
	'ts',
	'tsx',
	'json',
	'css',
	'text',
	'base64',
	'dataurl',
	'binary',
	'empty',
]);

const ROLLDOWN_LOADER_ALIASES: Record<string, string> = {
	'global-css': 'css',
	'local-css': 'css',
	file: 'asset',
	copy: 'asset',
};

function normalizeRolldownModuleType(loader: unknown): string | undefined {
	if (typeof loader === 'string' && DIRECT_ROLLDOWN_MODULE_LOADERS.has(loader)) {
		return loader;
	}
	if (typeof loader === 'string' && Object.prototype.hasOwnProperty.call(ROLLDOWN_LOADER_ALIASES, loader)) {
		return ROLLDOWN_LOADER_ALIASES[loader];
	}
	return undefined;
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

function buildIdMatcher(filter: RegExp, namespace: string | undefined): (id: string) => boolean {
	if (!namespace) {
		return (id) => filter.test(id);
	}
	const prefix = `${namespace}${NAMESPACE_SEPARATOR}`;
	return (id) => id.startsWith(prefix) && filter.test(id.slice(prefix.length));
}

function resolvePluginPath(value: string, importer: string | undefined, contextRoot: string): string {
	if (path.isAbsolute(value)) {
		return value;
	}

	if (value.startsWith('.') || value.startsWith('..')) {
		const baseDir = importer ? path.dirname(importer) : contextRoot;
		return path.resolve(baseDir, value);
	}

	return value;
}

function convertPluginOnLoadResult(args: { id: string }, result: unknown): LoadResult | undefined {
	if (!result || typeof result !== 'object') {
		return undefined;
	}

	const candidate = result as EcoBuildOnLoadResult;
	const { path: sourcePath } = splitNamespace(args.id);

	const sourceFromExports = convertLoadResultToModuleSource(candidate);

	if (sourceFromExports) {
		const description: SourceDescription = {
			code: sourceFromExports,
			moduleType: 'js',
		};
		return description;
	}

	if (typeof candidate.contents === 'string' || candidate.contents instanceof Uint8Array) {
		const code =
			typeof candidate.contents === 'string' ? candidate.contents : new TextDecoder().decode(candidate.contents);
		const description: SourceDescription = {
			code,
			moduleType: (normalizeRolldownModuleType(candidate.loader) ??
				inferRolldownModuleTypeFromPath(sourcePath)) as SourceDescription['moduleType'],
		};
		return description;
	}

	return undefined;
}

function convertPluginOnResolveResult(
	result: unknown,
	importer: string | undefined,
	contextRoot: string,
): ResolveIdResult | undefined {
	if (!result || typeof result !== 'object') {
		return undefined;
	}

	const candidate = result as EcoBuildOnResolveResult;

	if (typeof candidate.path !== 'string' && typeof candidate.namespace !== 'string') {
		if (typeof candidate.external !== 'boolean') {
			return undefined;
		}
	}

	const partial: PartialResolvedId = { id: '' };

	if (typeof candidate.path === 'string') {
		partial.id = joinNamespace(candidate.namespace, resolvePluginPath(candidate.path, importer, contextRoot));
	} else if (typeof candidate.namespace === 'string') {
		partial.id = joinNamespace(candidate.namespace, '');
	}

	if (typeof candidate.external === 'boolean') {
		partial.external = candidate.external;
	}

	return partial;
}

/**
 * Narrows a bundler-agnostic transform map to Rolldown's `SourceMapInput`.
 *
 * @remarks
 * `EcoBuildOnTransformResult.map` is `unknown` so plugin authors stay free of
 * Rolldown types. Only string maps, `null` (keep the existing map), and objects
 * with `mappings` are forwarded. The object branch asserts `SourceMapInput`
 * after that check so the original map object is returned without a copy.
 */
function toRolldownSourceMapInput(value: unknown): SourceMapInput | undefined {
	if (value === null || typeof value === 'string') {
		return value;
	}
	if (typeof value === 'object' && 'mappings' in value && typeof value.mappings === 'string') {
		return value as SourceMapInput;
	}
	return undefined;
}

type ResolveCallback = (
	args: EcoBuildOnResolveArgs,
) => EcoBuildOnResolveResult | undefined | Promise<EcoBuildOnResolveResult | undefined>;

type LoadCallback = (
	args: EcoBuildOnLoadArgs,
) => EcoBuildOnLoadResult | undefined | Promise<EcoBuildOnLoadResult | undefined>;

type TransformCallback = (
	code: string,
	id: string,
) => EcoBuildOnTransformResult | string | undefined | Promise<EcoBuildOnTransformResult | string | undefined>;

interface Registration<Callback> {
	matches: (id: string) => boolean;
	/** Superset of `matches` that Rolldown tests natively before it calls into JavaScript. */
	hookFilter: RegExp;
	callback: Callback;
	pluginName: string;
}

function createRegistration<Callback>(
	filter: RegExp,
	namespace: string | undefined,
	callback: Callback,
	pluginName: string,
): Registration<Callback> {
	return {
		matches: buildIdMatcher(filter, namespace),
		hookFilter: namespace ? new RegExp(`^${escapeRegExp(`${namespace}${NAMESPACE_SEPARATOR}`)}`) : filter,
		callback,
		pluginName,
	};
}

/**
 * Error thrown by the bridge for an error an `EcoBuildPlugin` threw.
 *
 * @remarks
 * Rolldown overwrites `plugin` on a thrown error with the name of the Rolldown plugin that hosts the hook,
 * which is the bridge, so the `EcoBuildPlugin` name is kept in `ecoBuildPlugin` and read back by
 * {@link getEcoBuildPluginName}. A new error is thrown for every attribution so the thrown value, which a
 * plugin may share across files or freeze, is never changed; it stays available as `cause`.
 */
class EcoBuildPluginError extends Error {
	readonly ecoBuildPlugin: string;
	id?: string;
	loc?: RolldownLog['loc'];
	frame?: string;

	constructor(thrown: unknown, pluginName: string, id: string | undefined) {
		const source: Partial<RolldownLog> = typeof thrown === 'object' && thrown !== null ? thrown : {};
		super(typeof source.message === 'string' ? source.message : String(thrown), { cause: thrown });
		this.ecoBuildPlugin = pluginName;
		if (typeof source.stack === 'string') {
			this.stack = source.stack;
		}
		const thrownId = typeof source.id === 'string' ? source.id : undefined;
		if (thrownId ?? id) {
			this.id = thrownId ?? id;
		}
		if (source.loc) {
			this.loc = source.loc;
		}
		if (typeof source.frame === 'string') {
			this.frame = source.frame;
		}
	}
}

/** Returns the name of the `EcoBuildPlugin` that threw `error` inside the bridge, if any. */
export function getEcoBuildPluginName(error: unknown): string | undefined {
	return error instanceof EcoBuildPluginError ? error.ecoBuildPlugin : undefined;
}

/**
 * Creates the single Rolldown `Plugin` that drives the supplied
 * `EcoBuildPlugin` instances.
 *
 * All eco plugins are merged into one Rolldown plugin. Its `resolveId`
 * and `load` hooks check the registrations in `plugins` array order, so
 * registrations from earlier eco plugins win over later ones. `transform`
 * runs every matching registration in that same order.
 *
 * @remarks
 * Every `setup` runs here, before the plugin object exists, because
 * Rolldown reads hook filters when the plugin is registered. Each hook
 * declares the union of its registrations as a hook filter, so Rolldown
 * calls into JavaScript only for ids that at least one registration may
 * match. A namespaced registration contributes only `^<namespace>:`; its
 * exact filter is tested in JavaScript against the path after the prefix.
 * Transform filters are tested with the query and hash stripped. Rolldown
 * tests filters against ids with `/` separators, so a filter written for
 * backslash separators does not match on Windows.
 *
 * Every build creates a new bridge, so registrations and the
 * virtual-module counter never carry over between builds.
 *
 * @param plugins - `EcoBuildPlugin` instances registered for this build.
 * @param contextRoot - Project root used to resolve relative load paths.
 */
export async function createRolldownPluginBridge(plugins: EcoBuildPlugin[], contextRoot: string): Promise<Plugin[]> {
	if (plugins.length === 0) {
		return [];
	}

	let moduleCount = 0;
	let registrationClosed = false;
	const assertOpen = (method: string): void => {
		if (registrationClosed) {
			throw new Error(
				`[ecopages] build.${method}() was called after the plugin setup finished. Register build plugin handlers before setup returns or its promise resolves.`,
			);
		}
	};
	const resolveRegistrations: Registration<ResolveCallback>[] = [];
	const loadRegistrations: Registration<LoadCallback>[] = [];
	const transformRegistrations: Registration<TransformCallback>[] = [];

	for (const ecoPlugin of plugins) {
		const pluginName = ecoPlugin.name;
		const builder: EcoBuildPluginBuilder = {
			onResolve: (options, callback) => {
				assertOpen('onResolve');
				resolveRegistrations.push(createRegistration(options.filter, options.namespace, callback, pluginName));
			},
			onLoad: (options, callback) => {
				assertOpen('onLoad');
				loadRegistrations.push(createRegistration(options.filter, options.namespace, callback, pluginName));
			},
			module: (specifier, callback) => {
				assertOpen('module');
				const namespace = `ecopages-module-${moduleCount}`;
				moduleCount += 1;
				resolveRegistrations.push(
					createRegistration(
						new RegExp(`^${escapeRegExp(specifier)}$`),
						undefined,
						async () => ({ path: joinNamespace(namespace, specifier) }),
						pluginName,
					),
				);
				loadRegistrations.push(createRegistration(/.*/, namespace, async () => callback(), pluginName));
			},
			transform: (options, callback) => {
				assertOpen('transform');
				transformRegistrations.push(createRegistration(options.filter, undefined, callback, pluginName));
			},
		};

		try {
			await ecoPlugin.setup(builder);
		} catch (error) {
			throw new EcoBuildPluginError(error, pluginName, undefined);
		}
	}
	registrationClosed = true;

	const resolveIdHandler = async (source: string, importer: string | undefined) => {
		for (const { matches, callback, pluginName } of resolveRegistrations) {
			if (!matches(source)) {
				continue;
			}
			const { namespace, path: sourcePath } = splitNamespace(source);
			let result: EcoBuildOnResolveResult | undefined;
			try {
				result = await callback({ path: sourcePath, importer, namespace });
			} catch (error) {
				throw new EcoBuildPluginError(error, pluginName, importer);
			}
			const converted = convertPluginOnResolveResult(result, importer, contextRoot);
			if (converted !== undefined) {
				return converted;
			}
		}
		return undefined;
	};

	const loadHandler = async (id: string): Promise<LoadResult | undefined> => {
		for (const { matches, callback, pluginName } of loadRegistrations) {
			if (!matches(id)) {
				continue;
			}
			const { namespace, path: sourcePath } = splitNamespace(id);
			let result: EcoBuildOnLoadResult | undefined;
			try {
				result = await callback({ path: sourcePath, namespace });
			} catch (error) {
				throw new EcoBuildPluginError(error, pluginName, sourcePath);
			}
			const converted = convertPluginOnLoadResult({ id }, result);
			if (converted !== undefined) {
				return converted;
			}
		}
		return undefined;
	};

	const transformHandler = async (code: string, id: string): Promise<SourceDescription | undefined> => {
		const { namespace, path: sourcePath } = splitNamespace(id);
		if (namespace !== undefined) {
			return undefined;
		}

		let current = code;
		let map: unknown;
		for (const { matches, callback, pluginName } of transformRegistrations) {
			if (!matches(sourcePath) && !matches(id)) {
				continue;
			}
			let result: EcoBuildOnTransformResult | string | undefined;
			try {
				result = await callback(current, sourcePath);
			} catch (error) {
				throw new EcoBuildPluginError(error, pluginName, sourcePath);
			}
			if (!result) {
				continue;
			}
			if (typeof result === 'string') {
				current = result;
				continue;
			}
			current = result.code;
			if (result.map !== undefined) {
				map = result.map;
			}
		}

		const sourceMap = toRolldownSourceMapInput(map);
		if (current === code && sourceMap === undefined) {
			return undefined;
		}

		return sourceMap === undefined ? { code: current } : { code: current, map: sourceMap };
	};

	const plugin: Plugin = { name: 'ecopages-plugin-bridge' };
	if (resolveRegistrations.length > 0) {
		plugin.resolveId = {
			filter: resolveRegistrations.map(({ hookFilter }) => include(idFilter(hookFilter))),
			handler: resolveIdHandler,
		};
	}
	if (loadRegistrations.length > 0) {
		plugin.load = {
			filter: loadRegistrations.map(({ hookFilter }) => include(idFilter(hookFilter))),
			handler: loadHandler,
		};
	}
	if (transformRegistrations.length > 0) {
		plugin.transform = {
			filter: transformRegistrations.map(({ hookFilter }) => include(idFilter(hookFilter, { cleanUrl: true }))),
			handler: transformHandler,
		};
	}

	return [plugin];
}
