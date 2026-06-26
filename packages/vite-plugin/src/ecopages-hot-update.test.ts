import { afterEach, describe, expect, it, vi } from 'vitest';
import { ecopagesHotUpdate } from './ecopages-hot-update.ts';
import { createEcopagesPluginApi } from './plugin-api.ts';
import { callPluginHook } from './test/plugin-hook.ts';

function createApi() {
	return createEcopagesPluginApi({
		appConfig: {
			additionalWatchPaths: [],
			templatesExt: [],
			absolutePaths: {
				componentsDir: '/app/src/components',
				includesDir: '/app/src/includes',
				layoutsDir: '/app/src/layouts',
				pagesDir: '/app/src/pages',
				publicDir: '/app/public',
				srcDir: '/app/src',
			},
			sourceTransforms: new Map(),
			integrations: [],
		} as never,
	});
}

function createHotUpdateServer(send = vi.fn()) {
	const hot = { send };
	return {
		watcher: { add: vi.fn() },
		environments: {
			client: { hot },
			ssr: { moduleGraph: { getModulesByFile: () => undefined } },
		},
		hot,
	};
}

describe('ecopagesHotUpdate', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('registers Ecopages-owned directories with the Vite watcher', () => {
		const api = createApi();
		const plugin = ecopagesHotUpdate(api);
		const add = vi.fn();
		const server = {
			watcher: { add },
			environments: { client: {}, ssr: { moduleGraph: { getModulesByFile: () => undefined } } },
		};

		callPluginHook(plugin.configureServer, {} as never, server as never);

		expect(add).toHaveBeenCalledWith([
			'/app/src/includes',
			'/app/src/layouts',
			'/app/src/pages',
			'/app/src/components',
			'/app/src/views',
		]);
	});

	it('broadcasts a reload for public asset invalidations', async () => {
		const api = createApi();
		api.markDevHostReady();
		const broadcast = vi.fn();
		const { setAppDevClientBridge } = await import('@ecopages/core/dev/client-bridge-registry');
		setAppDevClientBridge(api.appConfig, { broadcast } as never);

		const plugin = ecopagesHotUpdate(api);
		const send = vi.fn();
		const server = createHotUpdateServer(send);

		const result = callPluginHook(
			plugin.hotUpdate,
			{
				environment: {
					name: 'client',
					moduleGraph: { invalidateModule: vi.fn() },
				},
			} as never,
			{
				file: '/app/public/favicon.ico',
				modules: [],
				server: server as never,
			},
		);

		expect(send).not.toHaveBeenCalled();
		expect(result).toEqual([]);

		await Promise.resolve();

		expect(broadcast).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'reload',
				path: '/app/public/favicon.ico',
			}),
		);
	});

	it('defers reload broadcasts until the dev host has finished loading', async () => {
		const api = createApi();
		const broadcast = vi.fn();
		const { setAppDevClientBridge } = await import('@ecopages/core/dev/client-bridge-registry');
		setAppDevClientBridge(api.appConfig, { broadcast } as never);

		const plugin = ecopagesHotUpdate(api);
		const send = vi.fn();
		const server = createHotUpdateServer(send);

		callPluginHook(
			plugin.hotUpdate,
			{
				environment: {
					name: 'client',
					moduleGraph: { invalidateModule: vi.fn() },
				},
			} as never,
			{
				file: '/app/public/favicon.ico',
				modules: [],
				server: server as never,
			},
		);

		expect(broadcast).not.toHaveBeenCalled();

		api.markDevHostReady();
		await Promise.resolve();

		expect(broadcast).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'reload',
				path: '/app/public/favicon.ico',
			}),
		);
	});

	it('clears the warmed app cache when server modules are invalidated', () => {
		const api = createApi();
		api.setCachedApp({
			fetch: async () => new Response('ok'),
		});
		const plugin = ecopagesHotUpdate(api);
		const send = vi.fn();
		const server = {
			watcher: { add: vi.fn() },
			environments: {
				client: { hot: { send } },
				ssr: {
					moduleGraph: {
						getModulesByFile: () => new Set([{ id: 'page' }]),
						invalidateModule: vi.fn(),
					},
				},
			},
			hot: { send },
		};

		callPluginHook(
			plugin.hotUpdate,
			{
				environment: {
					name: 'client',
					moduleGraph: { invalidateModule: vi.fn() },
				},
			} as never,
			{
				file: '/app/src/pages/index.kita.tsx',
				modules: [{ id: 'page' }],
				server: server as never,
			},
		);

		expect(api.getCachedApp()).toBeNull();
	});

	it('broadcasts a layout-update for explicit server view invalidations', async () => {
		const api = createApi();
		api.markDevHostReady();
		const broadcast = vi.fn();
		const { setAppDevClientBridge } = await import('@ecopages/core/dev/client-bridge-registry');
		setAppDevClientBridge(api.appConfig, { broadcast } as never);

		const plugin = ecopagesHotUpdate(api);
		const send = vi.fn();
		const server = createHotUpdateServer(send);

		const result = callPluginHook(
			plugin.hotUpdate,
			{
				environment: {
					name: 'client',
					moduleGraph: { invalidateModule: vi.fn() },
				},
			} as never,
			{
				file: '/app/src/views/explicit-team-view.kita.tsx',
				modules: [],
				server: server as never,
			},
		);

		expect(send).not.toHaveBeenCalled();
		expect(result).toEqual([]);

		await Promise.resolve();

		expect(broadcast).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'layout-update',
				path: '/app/src/views/explicit-team-view.kita.tsx',
			}),
		);
	});

	it('broadcasts a layout-update for include template invalidations', async () => {
		const api = createApi();
		api.markDevHostReady();
		const broadcast = vi.fn();
		const { setAppDevClientBridge } = await import('@ecopages/core/dev/client-bridge-registry');
		setAppDevClientBridge(api.appConfig, { broadcast } as never);

		const plugin = ecopagesHotUpdate(api);
		const send = vi.fn();
		const server = createHotUpdateServer(send);

		callPluginHook(
			plugin.hotUpdate,
			{
				environment: {
					name: 'client',
					moduleGraph: { invalidateModule: vi.fn() },
				},
			} as never,
			{
				file: '/app/src/includes/seo.kita.tsx',
				modules: [],
				server: server as never,
			},
		);

		await Promise.resolve();

		expect(send).not.toHaveBeenCalled();
		expect(broadcast).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'layout-update',
				path: '/app/src/includes/seo.kita.tsx',
			}),
		);
	});

	it('delegates route-source changes to Vite HMR without a full reload', async () => {
		const api = createApi();
		api.markDevHostReady();
		const plugin = ecopagesHotUpdate(api);
		const send = vi.fn();
		const invalidateModule = vi.fn();
		const modules = [{ id: 'page' }];
		const server = {
			watcher: { add: vi.fn() },
			environments: {
				client: { hot: { send } },
				ssr: {
					moduleGraph: {
						getModulesByFile: () => new Set(modules),
						invalidateModule: vi.fn(),
					},
				},
			},
			hot: { send },
		};

		const result = callPluginHook(
			plugin.hotUpdate,
			{
				environment: {
					name: 'client',
					moduleGraph: { invalidateModule },
				},
			} as never,
			{
				file: '/app/src/pages/index.kita.tsx',
				modules,
				server: server as never,
			},
		);

		expect(invalidateModule).toHaveBeenCalledWith(modules[0]);
		expect(result).toBe(modules);
		expect(send).not.toHaveBeenCalled();
	});

	it('handles include changes through the watcher when the host owns the dev client', async () => {
		const api = createApi();
		api.appConfig.runtime = { devClientOwner: 'host' };
		api.markDevHostReady();
		const broadcast = vi.fn();
		const { setAppDevClientBridge } = await import('@ecopages/core/dev/client-bridge-registry');
		setAppDevClientBridge(api.appConfig, { broadcast } as never);

		const plugin = ecopagesHotUpdate(api);
		const send = vi.fn();
		const listeners = new Map<string, Set<(file: string) => void>>();
		const server = {
			watcher: {
				add: vi.fn(),
				on(event: string, listener: (file: string) => void) {
					const bucket = listeners.get(event) ?? new Set();
					bucket.add(listener);
					listeners.set(event, bucket);
				},
				off(event: string, listener: (file: string) => void) {
					listeners.get(event)?.delete(listener);
				},
			},
			environments: {
				client: { hot: { send } },
				ssr: { moduleGraph: { getModulesByFile: () => undefined } },
			},
			hot: { send },
		};

		callPluginHook(plugin.configureServer, {} as never, server as never);

		for (const listener of listeners.get('change') ?? []) {
			listener('/app/src/includes/seo.kita.tsx');
		}

		await Promise.resolve();

		expect(broadcast).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'layout-update',
				path: '/app/src/includes/seo.kita.tsx',
			}),
		);
	});

	it('returns an empty hot-update result when the host owns the dev client', () => {
		const api = createApi();
		api.appConfig.runtime = { devClientOwner: 'host' };
		api.markDevHostReady();
		const plugin = ecopagesHotUpdate(api);
		const send = vi.fn();
		const modules = [{ id: 'page' }];
		const server = createHotUpdateServer(send);

		const result = callPluginHook(
			plugin.hotUpdate,
			{
				environment: {
					name: 'client',
					moduleGraph: { invalidateModule: vi.fn() },
				},
			} as never,
			{
				file: '/app/src/pages/index.kita.tsx',
				modules,
				server: server as never,
			},
		);

		expect(result).toEqual([]);
		expect(send).not.toHaveBeenCalled();
	});
});
