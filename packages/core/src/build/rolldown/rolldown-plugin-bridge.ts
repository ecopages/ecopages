/**
 * Bundler plugin bridge.
 *
 * @remarks
 * Translates an array of `EcoBuildPlugin` instances (the runtime-agnostic
 * plugin contract used by Ecopages processors and integrations) into
 * the bundler's native `Plugin` array. The bridge exposes the same
 * three hooks (`onResolve`, `onLoad`, `module`) the `EcoBuildPlugin`
 * contract uses, but maps them to the bundler's `resolveId`/`load`
 * hooks, and maps a plugin's `transform` to a `transform` hook.
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
 * order, and the first non-null result wins, so the position of each
 * plugin in the array determines its priority:
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
	SourceDescription,
	SourceMapInput,
	TransformResult,
} from 'rolldown';
import { exclude, id as idFilter, include } from 'rolldown/filter';
import { escapeRegExp } from '../browser/browser-runtime-plugin-helpers.ts';
import { normalizeTransformId } from '../../plugins/source-transform.ts';
import type {
	EcoBuildOnLoadArgs,
	EcoBuildOnLoadResult,
	EcoBuildOnResolveArgs,
	EcoBuildOnResolveResult,
	EcoBuildPlugin,
	EcoBuildPluginBuilder,
	EcoBuildTransform,
} from '../contracts/build-types.ts';

const NAMESPACE_SEPARATOR = ':';

/** Matches an id in a bridge namespace, but not a drive letter or a `scheme://` URL. */
const NAMESPACED_ID = /^[\w-]{2,}:(?!\/\/)/;

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

type ResolveCallback = (
	args: EcoBuildOnResolveArgs,
) => EcoBuildOnResolveResult | undefined | Promise<EcoBuildOnResolveResult | undefined>;

type LoadCallback = (
	args: EcoBuildOnLoadArgs,
) => EcoBuildOnLoadResult | undefined | Promise<EcoBuildOnLoadResult | undefined>;

interface Registration<Callback> {
	matches: (id: string) => boolean;
	/** Superset of `matches` that Rolldown tests natively before it calls into JavaScript. */
	hookFilter: RegExp;
	callback: Callback;
}

function createRegistration<Callback>(
	filter: RegExp,
	namespace: string | undefined,
	callback: Callback,
): Registration<Callback> {
	return {
		matches: buildIdMatcher(filter, namespace),
		hookFilter: namespace ? new RegExp(`^${escapeRegExp(`${namespace}${NAMESPACE_SEPARATOR}`)}`) : filter,
		callback,
	};
}

/**
 * Creates the Rolldown plugins that drive the supplied `EcoBuildPlugin`
 * instances: one merged plugin for `onResolve`, `onLoad` and `module`,
 * followed by one plugin per `EcoBuildPlugin` that declares `transform`.
 *
 * The `onResolve`, `onLoad` and `module` registrations of all eco plugins
 * share one Rolldown plugin. Its `resolveId`
 * and `load` hooks check the registrations in `plugins` array order, so
 * registrations from earlier eco plugins win over later ones.
 *
 * @remarks
 * Every `setup` runs here, before the plugin object exists, because
 * Rolldown reads hook filters when the plugin is registered. Each hook
 * declares the union of its registrations as a hook filter, so Rolldown
 * calls into JavaScript only for ids that at least one registration may
 * match. A namespaced registration contributes only `^<namespace>:`; its
 * exact filter is tested in JavaScript against the path after the prefix.
 * Rolldown tests filters against ids with `/` separators, so a filter
 * written for backslash separators does not match on Windows.
 *
 * Each plugin `transform` becomes a Rolldown plugin of its own after the
 * merged one, so Rolldown chains every matching transform and its source
 * map. See {@link createRolldownTransformPlugin}.
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

	const builder: EcoBuildPluginBuilder = {
		onResolve: (options, callback) => {
			assertOpen('onResolve');
			resolveRegistrations.push(createRegistration(options.filter, options.namespace, callback));
		},
		onLoad: (options, callback) => {
			assertOpen('onLoad');
			loadRegistrations.push(createRegistration(options.filter, options.namespace, callback));
		},
		module: (specifier, callback) => {
			assertOpen('module');
			const namespace = `ecopages-module-${moduleCount}`;
			moduleCount += 1;
			resolveRegistrations.push(
				createRegistration(new RegExp(`^${escapeRegExp(specifier)}$`), undefined, async () => ({
					path: joinNamespace(namespace, specifier),
				})),
			);
			loadRegistrations.push(createRegistration(/.*/, namespace, async () => callback()));
		},
	};

	for (const ecoPlugin of plugins) {
		await ecoPlugin.setup(builder);
	}
	registrationClosed = true;

	const resolveIdHandler = async (source: string, importer: string | undefined) => {
		for (const { matches, callback } of resolveRegistrations) {
			if (!matches(source)) {
				continue;
			}
			const { namespace, path: sourcePath } = splitNamespace(source);
			const result = await callback({ path: sourcePath, importer, namespace });
			const converted = convertPluginOnResolveResult(result, importer, contextRoot);
			if (converted !== undefined) {
				return converted;
			}
		}
		return undefined;
	};

	const loadHandler = async (id: string): Promise<LoadResult | undefined> => {
		for (const { matches, callback } of loadRegistrations) {
			if (!matches(id)) {
				continue;
			}
			const { namespace, path: sourcePath } = splitNamespace(id);
			const result = await callback({ path: sourcePath, namespace });
			const converted = convertPluginOnLoadResult({ id }, result);
			if (converted !== undefined) {
				return converted;
			}
		}
		return undefined;
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

	const transformPlugins = plugins.flatMap(({ name, transform }) =>
		transform ? [createRolldownTransformPlugin(name, transform)] : [],
	);

	return [plugin, ...transformPlugins];
}

/**
 * Maps one {@link EcoBuildTransform} to a Rolldown `transform` hook.
 *
 * @remarks
 * A result without `map` returns `map: null`, which tells Rolldown the
 * edit moved no code. Rolldown would otherwise drop the module's source
 * map entirely.
 *
 * Virtual modules never reach a transform: ids that start with `\0`
 * (Rolldown's runtime, plugin-owned virtual modules) and ids in a
 * namespace such as `ecopages-content:`. A drive letter (`C:/`) or a
 * URL scheme followed by `//` is not a namespace.
 */
function createRolldownTransformPlugin(name: string, transform: EcoBuildTransform): Plugin {
	return {
		name: `ecopages-transform:${name}`,
		transform: {
			order: transform.order,
			filter: [
				exclude(idFilter(/^\0/)),
				exclude(idFilter(NAMESPACED_ID)),
				include(idFilter(transform.filter, { cleanUrl: true })),
			],
			handler(code, id): TransformResult {
				const result = transform.handler(code, normalizeTransformId(id));
				if (result === undefined) {
					return undefined;
				}
				if (typeof result === 'string') {
					return { code: result, map: null };
				}
				return { code: result.code, map: (result.map ?? null) as SourceMapInput };
			},
		},
	};
}
