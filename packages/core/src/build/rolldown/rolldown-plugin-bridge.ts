/**
 * Bundler plugin bridge.
 *
 * @remarks
 * Translates an array of `EcoBuildPlugin` instances (the runtime-agnostic
 * plugin contract used by Ecopages processors and integrations) into
 * the bundler's native `Plugin` array. The bridge exposes the same
 * three hooks (`onResolve`, `onLoad`, `module`) the `EcoBuildPlugin`
 * contract uses, but maps them to the bundler's `resolveId`/`load`
 * hooks.
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
 * namespace, and matches `onLoad`/`onResolve` filters against that
 * prefix. The bridge strips the prefix before forwarding the id back
 * to the callback so plugin code keeps seeing the same `path` shape
 * it did on the historical contract.
 *
 * **Plugin ordering is semantically significant.**
 *
 * The bundler's `resolveId` and `load` are "first" hooks: the first
 * plugin that returns a non-null value wins. Because the bridge
 * translates each `EcoBuildPlugin` into its own bundler plugin and
 * preserves the array order, the position of each plugin in the
 * `plugins` array determines its priority:
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
import type { LoadResult, PartialResolvedId, Plugin, ResolveIdResult, SourceDescription } from 'rolldown';
import { finalizeLoadResultWithSourceTransforms } from './rolldown-source-transform-pass.ts';
import type { EcoSourceTransform } from '../../plugins/source-transform.ts';
import { escapeRegExp } from '../browser/browser-runtime-plugin-helpers.ts';
import type {
	EcoBuildOnLoadArgs,
	EcoBuildOnLoadResult,
	EcoBuildOnResolveArgs,
	EcoBuildOnResolveResult,
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

function normalizeRolldownModuleType(loader: unknown): string | undefined {
	switch (loader) {
		case 'js':
		case 'jsx':
		case 'ts':
		case 'tsx':
		case 'json':
		case 'css':
		case 'text':
		case 'base64':
		case 'dataurl':
		case 'binary':
		case 'empty':
			return loader;
		case 'global-css':
		case 'local-css':
			return 'css';
		case 'file':
		case 'copy':
			return 'asset';
		default:
			return undefined;
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

function buildIdFilter(filter: RegExp, namespace: string | undefined): RegExp {
	if (!namespace) {
		return filter;
	}
	return new RegExp(`^${escapeRegExp(namespace)}${NAMESPACE_SEPARATOR}${filter.source.slice(1)}`);
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

interface ResolveRegistration {
	filter: RegExp;
	callback: ResolveCallback;
}

interface LoadRegistration {
	filter: RegExp;
	callback: LoadCallback;
}

/**
 * Creates a Rolldown `Plugin` array that drives the supplied
 * `EcoBuildPlugin` instances.
 *
 * All eco plugins are merged into a single Rolldown plugin to minimize
 * Rust→JS FFI overhead. Rolldown calls every hook for every module when
 * there is no static filter, so N separate plugins would cause N
 * `resolveId` + N `load` calls per module. Consolidating into one
 * plugin reduces that to 1 call each, with JavaScript-side filtering
 * routing to the correct eco plugin callback.
 *
 * Plugin ordering is preserved: registrations from earlier eco plugins
 * are checked before registrations from later ones, matching the
 * original per-plugin priority semantics.
 *
 * @remarks
 * Rolldown re-fires `buildStart` on each build, so registrations and the
 * virtual-module counter are cleared before every `setup` pass — otherwise
 * handlers accumulate when bridge plugins are reused.
 *
 * @param plugins - `EcoBuildPlugin` instances registered for this build.
 * @param contextRoot - Project root used to resolve relative load paths.
 * @param sourceTransforms - Optional app-owned transforms applied after a matching
 * `onLoad` handler returns module contents. Browser builds pass
 * {@link getAppSourceTransforms | app source transforms} here so metadata injection
 * still runs on output rewritten by boundary/runtime plugins. Virtual modules,
 * CSS, and asset loads are skipped.
 */
export function createRolldownPluginBridge(
	plugins: EcoBuildPlugin[],
	contextRoot: string,
	sourceTransforms: readonly EcoSourceTransform[] = [],
): Plugin[] {
	if (plugins.length === 0) {
		return [];
	}

	const moduleCounter = { value: 0 };
	const resolveRegistrations: ResolveRegistration[] = [];
	const loadRegistrations: LoadRegistration[] = [];

	const registerResolve = (filter: RegExp, callback: ResolveCallback): void => {
		resolveRegistrations.push({ filter, callback });
	};

	const registerLoad = (filter: RegExp, callback: LoadCallback): void => {
		loadRegistrations.push({ filter, callback });
	};

	const resolveIdHandler = async (source: string, importer: string | undefined, _extraOptions: unknown) => {
		for (const { filter, callback } of resolveRegistrations) {
			if (!filter.test(source)) {
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

	const loadHandler = async (id: string) => {
		let loadResult: LoadResult | undefined;

		for (const { filter, callback } of loadRegistrations) {
			if (!filter.test(id)) {
				continue;
			}
			const { namespace, path: sourcePath } = splitNamespace(id);
			const result = await callback({ path: sourcePath, namespace });
			const converted = convertPluginOnLoadResult({ id }, result);
			if (converted !== undefined) {
				loadResult = converted;
				break;
			}
		}

		const { namespace, path: sourcePath } = splitNamespace(id);
		return finalizeLoadResultWithSourceTransforms({
			id,
			namespace,
			sourcePath,
			loadResult,
			sourceTransforms,
			contextRoot,
			inferModuleTypeFromPath: (filePath) =>
				inferRolldownModuleTypeFromPath(filePath) as SourceDescription['moduleType'],
		});
	};

	const plugin: Plugin = {
		name: 'ecopages-plugin-bridge',
		buildStart: async (): Promise<void> => {
			resolveRegistrations.length = 0;
			loadRegistrations.length = 0;
			moduleCounter.value = 0;

			for (const ecoPlugin of plugins) {
				const bridge: EcoBuildPluginBuilder = {
					onResolve: (options, callback) => {
						registerResolve(buildIdFilter(options.filter, options.namespace), callback);
					},
					onLoad: (options, callback) => {
						registerLoad(buildIdFilter(options.filter, options.namespace), callback);
					},
					module: (specifier, callback) => {
						const namespace = `ecopages-module-${moduleCounter.value}`;
						moduleCounter.value += 1;
						const filter = new RegExp(`^${escapeRegExp(specifier)}$`);

						registerResolve(filter, async () => ({
							path: joinNamespace(namespace, specifier),
						}));

						registerLoad(buildIdFilter(/.*/, namespace), async () => callback());
					},
				};

				await ecoPlugin.setup(bridge);
			}
		},
		resolveId: resolveIdHandler,
		load: loadHandler,
	};

	return [plugin];
}
