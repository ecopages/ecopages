import path from 'node:path';
import type { EnvironmentModuleNode, HotUpdateOptions, ViteDevServer } from 'vite';
import { hostOwnsDevClient } from '@ecopages/core/dev/dev-client-ownership';
import { getAppHmrManager } from '@ecopages/core/dev/hmr-manager-registry';
import { createDevelopmentHostRuntime } from '@ecopages/core/dev/host-runtime';
import type { DevelopmentHostRuntime } from '@ecopages/core/dev/host-runtime';
import { prepareHmrFileChange } from '@ecopages/core/hmr/hmr-file-change-prep';
import type { EcopagesPluginApi } from './plugin-api.ts';
import type { EcopagesVitePlugin } from './types.ts';

function assertWatcherServer(server: ViteDevServer): void {
	if (!server.watcher || typeof server.watcher.add !== 'function') {
		throw new Error('[ecopages] ecopagesHotUpdate requires a Vite dev server with watcher.add()');
	}

	if (!server.environments || typeof server.environments !== 'object') {
		throw new Error(
			'[ecopages] ecopagesHotUpdate requires Vite server environments for server module invalidation',
		);
	}
}

function invalidateFileInServerEnvironments(server: ViteDevServer, filePath: string): void {
	for (const [name, env] of Object.entries(server.environments)) {
		if (name === 'client') continue;
		const mods = env.moduleGraph.getModulesByFile(filePath) as Set<EnvironmentModuleNode> | undefined;
		if (mods) {
			for (const mod of mods) {
				env.moduleGraph.invalidateModule(mod);
			}
		}
	}
}

type ProcessFileChangeOptions = {
	server: ViteDevServer;
	api: EcopagesPluginApi;
	hostRuntime: DevelopmentHostRuntime;
	extraWatchedPaths: string[];
	hostOwnsClient: () => boolean;
	clientModules?: EnvironmentModuleNode[];
	invalidateClientModule?: (module: EnvironmentModuleNode) => void;
};

function shouldRestartForWatchedPath(file: string, extraWatchedPaths: string[]): boolean {
	for (const watchedPath of extraWatchedPaths) {
		if (file === watchedPath || file.startsWith(`${watchedPath}/`)) {
			return true;
		}
	}
	return false;
}

function dispatchHostOwnedHmr(
	api: EcopagesPluginApi,
	file: string,
	graphIdentities?: ReturnType<typeof prepareHmrFileChange>['affectedGraphIdentities'],
): void {
	void api.getDevHostReady().then(async () => {
		const hmrManager = getAppHmrManager(api.appConfig);
		if (!hmrManager?.isEnabled()) {
			return;
		}

		try {
			await hmrManager.handleFileChange(file, { graphIdentities });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			hmrManager.broadcast({ type: 'error', message });
		}
	});
}

function invalidateServerForPlan(
	file: string,
	plan: ReturnType<DevelopmentHostRuntime['planFileChange']>,
	options: ProcessFileChangeOptions,
	isRegisteredScriptEdit: boolean,
): void {
	if (!plan.invalidateServerModules || isRegisteredScriptEdit) {
		return;
	}

	options.hostRuntime.invalidateServerModules([file]);
	invalidateFileInServerEnvironments(options.server, file);
	options.api.invalidateAppCache();
}

function handleNonHmrPlan(
	file: string,
	plan: ReturnType<DevelopmentHostRuntime['planFileChange']>,
	hostRuntime: DevelopmentHostRuntime,
	api: EcopagesPluginApi,
): EnvironmentModuleNode[] | undefined {
	if (plan.reloadBrowser) {
		void api.getDevHostReady().then(() => {
			hostRuntime.broadcastClientEvent({
				type: 'reload',
				path: file,
				timestamp: Date.now(),
			});
		});
		return [];
	}

	if (plan.delegateToHmr && hostRuntime.isServerRenderedTemplatePlan(plan)) {
		void api.getDevHostReady().then(() => {
			hostRuntime.broadcastClientEvent({
				type: 'layout-update',
				path: file,
				timestamp: Date.now(),
			});
		});
		return [];
	}

	return undefined;
}

function dispatchClientHmr(
	file: string,
	api: EcopagesPluginApi,
	hostOwnsClient: () => boolean,
	graphIdentities?: ReturnType<typeof prepareHmrFileChange>['affectedGraphIdentities'],
): EnvironmentModuleNode[] | undefined {
	if (!hostOwnsClient()) {
		return undefined;
	}

	dispatchHostOwnedHmr(api, file, graphIdentities);
	return [];
}

function handleDelegatedHmrChange(
	file: string,
	options: ProcessFileChangeOptions,
	graphIdentities?: ReturnType<typeof prepareHmrFileChange>['affectedGraphIdentities'],
): EnvironmentModuleNode[] {
	const { clientModules = [], invalidateClientModule, hostOwnsClient, api } = options;

	if (invalidateClientModule) {
		for (const mod of clientModules) {
			invalidateClientModule(mod);
		}
	}

	const hostOwnedResult = dispatchClientHmr(file, api, hostOwnsClient, graphIdentities);
	if (hostOwnedResult !== undefined) {
		return hostOwnedResult;
	}

	return clientModules;
}

function processEcopagesFileChange(
	file: string,
	options: ProcessFileChangeOptions,
): EnvironmentModuleNode[] | undefined {
	const { server, api, hostRuntime, extraWatchedPaths, clientModules = [] } = options;

	if (shouldRestartForWatchedPath(file, extraWatchedPaths)) {
		void server.restart();
		return [];
	}

	const plan = hostRuntime.planFileChange(file);
	const hmrManager = getAppHmrManager(api.appConfig);
	const graphPreparation = hmrManager?.isEnabled() === true ? prepareHmrFileChange(api.appConfig, file) : undefined;
	const watchedFiles = hmrManager?.getWatchedFiles?.();
	const isRegisteredScriptEdit = hmrManager?.isEnabled() === true && watchedFiles?.has(path.resolve(file)) === true;

	invalidateServerForPlan(file, plan, options, isRegisteredScriptEdit);

	const nonHmrResult = handleNonHmrPlan(file, plan, hostRuntime, api);
	if (nonHmrResult !== undefined) {
		return nonHmrResult;
	}

	if (!plan.delegateToHmr) {
		return clientModules;
	}

	return handleDelegatedHmrChange(file, options, graphPreparation?.affectedGraphIdentities);
}

/**
 * Handles HMR hot-update events for Ecopages-owned directories.
 *
 * @param watchedPaths - Additional directories to watch beyond the standard
 *   Ecopages directories (pages, layouts, components, includes). Useful for
 *   host-specific directories like a local plugin folder.
 */
export function ecopagesHotUpdate(api: EcopagesPluginApi, options?: { watchedPaths?: string[] }): EcopagesVitePlugin {
	const hostRuntime = createDevelopmentHostRuntime(api.appConfig);
	const extraWatchedPaths = options?.watchedPaths ?? [];
	const hostOwnsClient = () => hostOwnsDevClient(api.appConfig.runtime);

	return {
		name: 'ecopages:hot-update',
		apply: 'serve',
		configureServer(server: ViteDevServer) {
			assertWatcherServer(server);

			const watchedPaths = [
				api.appConfig.absolutePaths.includesDir,
				api.appConfig.absolutePaths.layoutsDir,
				api.appConfig.absolutePaths.pagesDir,
				api.appConfig.absolutePaths.componentsDir,
				path.join(api.appConfig.absolutePaths.srcDir, 'views'),
				...extraWatchedPaths,
			];

			server.watcher.add(watchedPaths);

			if (!hostOwnsClient()) {
				return;
			}

			const onFileEvent = (file: string) => {
				processEcopagesFileChange(file, {
					server,
					api,
					hostRuntime,
					extraWatchedPaths,
					hostOwnsClient,
				});
			};

			server.watcher.on('change', onFileEvent);
			server.watcher.on('add', onFileEvent);

			return () => {
				server.watcher.off('change', onFileEvent);
				server.watcher.off('add', onFileEvent);
			};
		},
		hotUpdate(hotUpdateOptions: HotUpdateOptions) {
			if (hostOwnsClient()) {
				return [];
			}

			if (this.environment.name !== 'client') return;
			const { server } = hotUpdateOptions;
			assertWatcherServer(server);

			return processEcopagesFileChange(hotUpdateOptions.file, {
				server,
				api,
				hostRuntime,
				extraWatchedPaths,
				hostOwnsClient,
				clientModules: hotUpdateOptions.modules,
				invalidateClientModule: (module) => {
					this.environment.moduleGraph.invalidateModule(module);
				},
			});
		},
	};
}
