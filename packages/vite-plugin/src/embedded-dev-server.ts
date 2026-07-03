import path from 'node:path';
import type { ViteDevServer } from 'vite';
import type { EcopagesPluginApi } from './plugin-api.ts';

export type EcopagesEmbeddedApp = {
	fetch: (request: Request) => Promise<Response>;
	handleListening: (origin: string) => void;
	attachWebSocketUpgrades?: (
		httpServer: NonNullable<ViteDevServer['httpServer']>,
		options?: { passthroughUnmatched?: boolean },
	) => Promise<void>;
};

export async function registerHostModuleLoader(server: ViteDevServer, api: EcopagesPluginApi): Promise<void> {
	const runtimeModule = (await server.ssrLoadModule('@ecopages/core/dev/host-runtime')) as {
		createDevelopmentHostRuntime?: (appConfig: EcopagesPluginApi['appConfig']) => {
			registerHostModuleLoader(loader: (id: string) => Promise<unknown>): void;
		};
	};

	if (typeof runtimeModule.createDevelopmentHostRuntime !== 'function') {
		throw new Error('[ecopages] @ecopages/core/dev/host-runtime must export createDevelopmentHostRuntime()');
	}

	const hostRuntime = runtimeModule.createDevelopmentHostRuntime(api.appConfig);
	hostRuntime.registerHostModuleLoader((id: string) => server.ssrLoadModule(id));
}

export async function loadApp(server: ViteDevServer, appEntryPath: string): Promise<EcopagesEmbeddedApp> {
	const module = await server.ssrLoadModule(appEntryPath);
	const app = module.app as EcopagesEmbeddedApp | undefined;

	if (!app?.fetch) {
		throw new Error(`[ecopages] App entry at '${appEntryPath}' must export an app.fetch(request) handler`);
	}

	return app;
}

export function getAppEntryPath(rootDir: string): string {
	return path.join(rootDir, 'app');
}
