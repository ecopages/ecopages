import path from 'node:path';
import type { ViteDevServer } from 'vite';
import type { EcopagesPluginApi } from './plugin-api.ts';
import { resolveEcopagesDevServerOrigin } from './resolve-vite-dev-origin.ts';

const IMAGE_VIRTUAL_MODULE_ID = 'virtual:ecopages/images.ts';

export type EcopagesEmbeddedApp = {
	fetch: (request: Request) => Promise<Response>;
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

async function preloadImageVirtualModule(server: ViteDevServer): Promise<void> {
	try {
		await server.ssrLoadModule(IMAGE_VIRTUAL_MODULE_ID);
	} catch {
		// Apps without the image processor integration can skip this preload.
	}
}

/**
 * Eagerly warms the Vite dev host before the first browser request.
 *
 * Compiles the SSR graph, caches the app module, and preloads image virtual
 * modules so Playwright navigations do not race cold-start work.
 */
export async function warmupDevServer(
	server: ViteDevServer,
	api: EcopagesPluginApi,
	appEntryPath: string,
): Promise<void> {
	await registerHostModuleLoader(server, api);

	const app = await loadApp(server, appEntryPath);
	api.setCachedApp(app);

	await preloadImageVirtualModule(server);

	const baseUrl = resolveEcopagesDevServerOrigin(api.getDevServerOrigin(), api.appConfig.baseUrl);
	await app.fetch(new Request(new URL('/', baseUrl)));
}

export function getAppEntryPath(rootDir: string): string {
	return path.join(rootDir, 'app');
}
