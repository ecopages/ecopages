import {
	registerHooks,
	type LoadFnOutput,
	type LoadHookContext,
	type ResolveHookContext,
	type ResolveFnOutput,
} from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';
import type {
	EcoBuildOnLoadArgs,
	EcoBuildOnLoadResult,
	EcoBuildOnResolveArgs,
	EcoBuildOnResolveResult,
	EcoBuildPlugin,
	EcoBuildPluginBuilder,
} from '../../build/build-types.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import { createAliasResolverPlugin } from '../../plugins/alias-resolver-plugin.ts';
type NodePluginOnLoadCallback = (args: EcoBuildOnLoadArgs) => Promise<EcoBuildOnLoadResult> | EcoBuildOnLoadResult;
type NodePluginOnResolveCallback = (args: EcoBuildOnResolveArgs) => EcoBuildOnResolveResult;

type NodePluginOnLoadRegistration = {
	filter: RegExp;
	namespace?: string;
	callback: NodePluginOnLoadCallback;
};

type NodePluginOnResolveRegistration = {
	filter: RegExp;
	namespace?: string;
	callback: NodePluginOnResolveCallback;
};

type NodePluginRegistry = {
	onLoad: NodePluginOnLoadRegistration[];
	onResolve: NodePluginOnResolveRegistration[];
	pluginNames: Set<string>;
	jsxImportSource?: string;
};

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type NodeProcessWithPluginRegistry = NodeJS.Process & {
	__ECOPAGES_NODE_PLUGIN_REGISTRY__?: NodePluginRegistry;
};

function getOrCreateNodePluginRegistry(): NodePluginRegistry {
	const processWithRegistry = process as NodeProcessWithPluginRegistry;

	if (!processWithRegistry.__ECOPAGES_NODE_PLUGIN_REGISTRY__) {
		processWithRegistry.__ECOPAGES_NODE_PLUGIN_REGISTRY__ = {
			onLoad: [],
			onResolve: [],
			pluginNames: new Set<string>(),
		};
	}

	return processWithRegistry.__ECOPAGES_NODE_PLUGIN_REGISTRY__;
}

function collectRuntimePlugins(appConfig: EcoPagesAppConfig): EcoBuildPlugin[] {
	const runtimePlugins: EcoBuildPlugin[] = [];

	runtimePlugins.push(createAliasResolverPlugin(appConfig.absolutePaths.srcDir));

	runtimePlugins.push(...appConfig.loaders.values());

	for (const processor of appConfig.processors.values()) {
		if (processor.plugins) {
			runtimePlugins.push(...processor.plugins);
		}

		if (processor.buildPlugins) {
			runtimePlugins.push(...processor.buildPlugins);
		}
	}

	for (const integration of appConfig.integrations) {
		if (integration.plugins.length > 0) {
			runtimePlugins.push(...integration.plugins);
		}
	}

	return runtimePlugins;
}

function readJsxImportSource(projectDir: string): string | undefined {
	try {
		const tsconfigPath = path.join(projectDir, 'tsconfig.json');
		const raw = readFileSync(tsconfigPath, 'utf-8');
		const stripped = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
		const parsed = JSON.parse(stripped);
		return parsed?.compilerOptions?.jsxImportSource;
	} catch {
		return undefined;
	}
}

export async function registerNodeRuntimePlugins(appConfig: EcoPagesAppConfig): Promise<void> {
	const registry = getOrCreateNodePluginRegistry();
	const plugins = collectRuntimePlugins(appConfig);

	if (!registry.jsxImportSource) {
		registry.jsxImportSource = readJsxImportSource(appConfig.absolutePaths.projectDir);
	}

	for (const plugin of plugins) {
		if (registry.pluginNames.has(plugin.name)) {
			continue;
		}

		const build: EcoBuildPluginBuilder = {
			onLoad: (options: { filter: RegExp; namespace?: string }, callback: NodePluginOnLoadCallback): void => {
				registry.onLoad.push({
					filter: options.filter,
					namespace: options.namespace,
					callback,
				});
			},
			onResolve: (
				options: { filter: RegExp; namespace?: string },
				callback: NodePluginOnResolveCallback,
			): void => {
				registry.onResolve.push({
					filter: options.filter,
					namespace: options.namespace,
					callback,
				});
			},
			module: (
				specifier: string,
				callback: () => Promise<NodePluginOnLoadResult> | NodePluginOnLoadResult,
			): void => {
				const namespace = `ecopages-module-${registry.onLoad.length}`;
				const filter = new RegExp(`^${escapeRegExp(specifier)}$`);

				registry.onResolve.push({
					filter,
					callback: () => ({
						path: specifier,
						namespace,
					}),
				});

				registry.onLoad.push({
					filter,
					namespace,
					callback: () => callback() as NodePluginOnLoadResult,
				});
			},
		};

		await plugin.setup(build);
		registry.pluginNames.add(plugin.name);
	}
}

type NodePluginOnLoadResult = EcoBuildOnLoadResult;

const NODE_PLUGIN_URL_PREFIX = 'ecopages-plugin://';

function createNodePluginUrl(namespace: string, pluginPath: string): string {
	return `${NODE_PLUGIN_URL_PREFIX}${namespace}/${encodeURIComponent(pluginPath)}`;
}

function parseNodePluginUrl(url: string): { namespace: string; path: string } | undefined {
	if (!url.startsWith(NODE_PLUGIN_URL_PREFIX)) return undefined;
	const parsedUrl = new URL(url);
	const namespace = parsedUrl.hostname;
	const encodedPath = parsedUrl.pathname.startsWith('/') ? parsedUrl.pathname.slice(1) : parsedUrl.pathname;
	return { namespace, path: decodeURIComponent(encodedPath) };
}

function isValidExportIdentifier(value: string): boolean {
	return /^[A-Za-z_$][\w$]*$/.test(value);
}

function createModuleSourceFromExports(exportsObject: Record<string, unknown>): string | undefined {
	if (!exportsObject || typeof exportsObject !== 'object') return undefined;

	const namedExports = Object.entries(exportsObject)
		.filter(([key]) => key !== 'default' && isValidExportIdentifier(key))
		.map(([key, value]) => `export const ${key} = ${JSON.stringify(value)};`)
		.join('\n');

	const defaultExport = Object.prototype.hasOwnProperty.call(exportsObject, 'default')
		? `\nexport default ${JSON.stringify(exportsObject.default)};`
		: '';

	return `${namedExports}${defaultExport}`;
}

const ESBUILD_LOADERS = new Set(['ts', 'tsx', 'jsx']);

function transpileIfNeeded(source: string, loader?: string, filePath?: string, jsxImportSource?: string): string {
	if (!loader || !ESBUILD_LOADERS.has(loader)) return source;
	const result = transformSync(source, {
		loader: loader as 'ts' | 'tsx' | 'jsx',
		format: 'esm',
		sourcefile: filePath,
		jsx: 'automatic',
		...(jsxImportSource ? { jsxImportSource } : {}),
	});
	return result.code;
}

function convertPluginLoadResultToModuleSource(
	result: NodePluginOnLoadResult | undefined,
	filePath?: string,
	jsxImportSource?: string,
): string | undefined {
	if (!result) return undefined;

	if (typeof result.contents === 'string') {
		if (result.loader === 'object' && result.exports) {
			return createModuleSourceFromExports(result.exports);
		}
		return transpileIfNeeded(result.contents, result.loader, filePath, jsxImportSource);
	}

	if (result.loader === 'object' && result.exports) {
		return createModuleSourceFromExports(result.exports);
	}

	return undefined;
}

type LoaderResolveResult = { url: string; shortCircuit: true };
type LoaderLoadResult = { format: string; source: string; shortCircuit: true };

function handlePluginResolve(
	registry: NodePluginRegistry,
	specifier: string,
	parentURL?: string,
): LoaderResolveResult | undefined {
	if (!registry.onResolve.length) return undefined;

	for (const handler of registry.onResolve) {
		if (!handler.filter.test(specifier)) continue;

		const result = handler.callback({
			path: specifier,
			importer: parentURL ?? '',
			namespace: handler.namespace,
		});

		if (!result?.path) continue;

		if (result.namespace) {
			return {
				url: createNodePluginUrl(result.namespace, result.path),
				shortCircuit: true,
			};
		}

		let resolvedPath = result.path;

		if (!resolvedPath.startsWith('file://') && !path.isAbsolute(resolvedPath) && parentURL?.startsWith('file://')) {
			const importerPath = fileURLToPath(parentURL);
			resolvedPath = path.resolve(path.dirname(importerPath), resolvedPath);
		}

		return {
			url: resolvedPath.startsWith('file://') ? resolvedPath : pathToFileURL(resolvedPath).href,
			shortCircuit: true,
		};
	}

	return undefined;
}

function handlePluginLoad(registry: NodePluginRegistry, url: string): LoaderLoadResult | undefined {
	let targetPath: string;
	let namespace = 'file';

	const pluginUrl = parseNodePluginUrl(url);
	if (pluginUrl) {
		targetPath = pluginUrl.path;
		namespace = pluginUrl.namespace;
	} else {
		try {
			const parsedUrl = new URL(url);
			if (parsedUrl.protocol !== 'file:') return undefined;
			targetPath = fileURLToPath(parsedUrl);
		} catch {
			return undefined;
		}
	}

	for (const handler of registry.onLoad) {
		if ((handler.namespace || 'file') !== namespace) continue;
		if (!handler.filter.test(targetPath)) continue;

		const result = handler.callback({ path: targetPath, namespace });

		if (result && typeof (result as Record<string, unknown>).then === 'function') {
			throw new Error(
				`[ecopages] Plugin onLoad callback for "${targetPath}" returned a Promise. ` +
					`Node.js registerHooks requires synchronous callbacks. ` +
					`Make the plugin callback return a synchronous result.`,
			);
		}

		const source = convertPluginLoadResultToModuleSource(
			result as NodePluginOnLoadResult,
			targetPath,
			registry.jsxImportSource,
		);
		if (!source) continue;

		return {
			format: 'module',
			source,
			shortCircuit: true,
		};
	}

	return undefined;
}

export function registerRuntimeHooks(): void {
	const registry = getOrCreateNodePluginRegistry();

	registerHooks({
		resolve(
			specifier: string,
			context: ResolveHookContext,
			nextResolve: (specifier: string, context?: Partial<ResolveHookContext>) => ResolveFnOutput,
		) {
			const result = handlePluginResolve(registry, specifier, context.parentURL);
			if (result) return result;
			return nextResolve(specifier, context);
		},
		load(
			url: string,
			context: LoadHookContext,
			nextLoad: (url: string, context?: Partial<LoadHookContext>) => LoadFnOutput,
		) {
			const result = handlePluginLoad(registry, url);
			if (result) return result;
			return nextLoad(url, context);
		},
	});
}
