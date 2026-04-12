import type { EnvironmentModuleNode, HotUpdateOptions, ViteDevServer } from 'vite';
import { DevelopmentInvalidationService } from '@ecopages/core/services/invalidation/development-invalidation.service';
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

/**
 * Handles HMR hot-update events for Ecopages-owned directories.
 *
 * @param watchedPaths - Additional directories to watch beyond the standard
 *   Ecopages directories (pages, layouts, components, includes). Useful for
 *   host-specific directories like a local plugin folder.
 */
export function ecopagesHotUpdate(api: EcopagesPluginApi, options?: { watchedPaths?: string[] }): EcopagesVitePlugin {
	const invalidationService = new DevelopmentInvalidationService(api.appConfig);
	const extraWatchedPaths = options?.watchedPaths ?? [];

	return {
		name: 'ecopages:hot-update',
		configureServer(server: ViteDevServer) {
			assertWatcherServer(server);

			const watchedPaths = [
				api.appConfig.absolutePaths.includesDir,
				api.appConfig.absolutePaths.layoutsDir,
				api.appConfig.absolutePaths.pagesDir,
				api.appConfig.absolutePaths.componentsDir,
				...extraWatchedPaths,
			];

			server.watcher.add(watchedPaths);
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

			const plan = invalidationService.planFileChange(hotUpdateOptions.file);

			if (plan.invalidateServerModules) {
				invalidationService.invalidateServerModules([hotUpdateOptions.file]);
				invalidateFileInServerEnvironments(server, hotUpdateOptions.file);
			}

			if (plan.reloadBrowser) {
				hotUpdateOptions.server.hot.send({ type: 'full-reload', path: '*' });
				return [];
			}

			if (!plan.delegateToHmr) {
				return hotUpdateOptions.modules;
			}

			for (const mod of hotUpdateOptions.modules) {
				this.environment.moduleGraph.invalidateModule(mod);
			}

			hotUpdateOptions.server.hot.send({ type: 'full-reload', path: '*' });
			return [];
		},
	};
}
