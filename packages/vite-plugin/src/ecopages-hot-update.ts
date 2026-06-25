import path from 'node:path';
import type { EnvironmentModuleNode, HotUpdateOptions, ViteDevServer } from 'vite';
import { createDevelopmentHostRuntime } from '@ecopages/core/dev/host-runtime';
import type { EcopagesPluginApi } from './plugin-api.ts';
import type { EcopagesVitePlugin } from './types.ts';

const FULL_RELOAD_DEBOUNCE_MS = 200;

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

function createFullReloadScheduler() {
	let reloadTimer: ReturnType<typeof setTimeout> | undefined;

	return {
		schedule(server: ViteDevServer) {
			if (reloadTimer) {
				clearTimeout(reloadTimer);
			}

			reloadTimer = setTimeout(() => {
				reloadTimer = undefined;
				server.hot.send({ type: 'full-reload', path: '*' });
			}, FULL_RELOAD_DEBOUNCE_MS);
		},
		dispose() {
			if (reloadTimer) {
				clearTimeout(reloadTimer);
				reloadTimer = undefined;
			}
		},
	};
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
	const scheduleFullReload = createFullReloadScheduler();

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

			return () => {
				scheduleFullReload.dispose();
			};
		},
		hotUpdate(hotUpdateOptions: HotUpdateOptions) {
			if (this.environment.name !== 'client') return;
			const { server } = hotUpdateOptions;
			assertWatcherServer(server);

			for (const watchedPath of extraWatchedPaths) {
				if (hotUpdateOptions.file === watchedPath || hotUpdateOptions.file.startsWith(`${watchedPath}/`)) {
					void server.restart();
					return [];
				}
			}

			const plan = hostRuntime.planFileChange(hotUpdateOptions.file);

			if (plan.invalidateServerModules) {
				hostRuntime.invalidateServerModules([hotUpdateOptions.file]);
				invalidateFileInServerEnvironments(server, hotUpdateOptions.file);
				api.invalidateAppCache();
			}

			const scheduleReload = () => {
				void api.getDevHostReady().then(() => {
					scheduleFullReload.schedule(server);
				});
			};

			if (plan.reloadBrowser) {
				scheduleReload();
				return [];
			}

			if (!plan.delegateToHmr) {
				return hotUpdateOptions.modules;
			}

			for (const mod of hotUpdateOptions.modules) {
				this.environment.moduleGraph.invalidateModule(mod);
			}

			return hotUpdateOptions.modules;
		},
	};
}
