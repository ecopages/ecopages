import type { EcoBuildPlugin } from '../../build/build-types.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';

type NodePluginOnLoadArgs = {
	path: string;
	namespace?: string;
};

type NodePluginOnResolveArgs = {
	path: string;
	importer?: string;
	namespace?: string;
};

type NodePluginOnLoadResult = {
	contents?: string;
	loader?: string;
	exports?: Record<string, unknown>;
};

type NodePluginOnResolveResult = {
	path?: string;
	namespace?: string;
};

type NodePluginOnLoadCallback = (
	args: NodePluginOnLoadArgs,
) => Promise<NodePluginOnLoadResult> | NodePluginOnLoadResult;
type NodePluginOnResolveCallback = (
	args: NodePluginOnResolveArgs,
) => Promise<NodePluginOnResolveResult> | NodePluginOnResolveResult;

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

	runtimePlugins.push(...appConfig.loaders.values());

	for (const processor of appConfig.processors.values()) {
		if (processor.plugins) {
			runtimePlugins.push(...processor.plugins);
		}

		if (processor.buildPlugins) {
			runtimePlugins.push(...processor.buildPlugins);
		}
	}

	return runtimePlugins;
}

export async function registerNodeRuntimePlugins(appConfig: EcoPagesAppConfig): Promise<void> {
	const registry = getOrCreateNodePluginRegistry();
	const plugins = collectRuntimePlugins(appConfig);

	for (const plugin of plugins) {
		if (registry.pluginNames.has(plugin.name)) {
			continue;
		}

		const build = {
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
					callback: async () => await callback(),
				});
			},
		};

		await plugin.setup(build as never);
		registry.pluginNames.add(plugin.name);
	}
}
