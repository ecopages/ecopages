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

	it('requests a debounced full reload for public asset invalidations', async () => {
		vi.useFakeTimers();

		const api = createApi();
		api.markDevHostReady();
		const plugin = ecopagesHotUpdate(api);
		const send = vi.fn();
		const server = {
			watcher: { add: vi.fn() },
			environments: { client: {}, ssr: { moduleGraph: { getModulesByFile: () => undefined } } },
			hot: { send },
		};

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

		await vi.advanceTimersByTimeAsync(200);

		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith({ type: 'full-reload', path: '*' });
	});

	it('coalesces multiple rapid full reload requests into one send', async () => {
		vi.useFakeTimers();

		const api = createApi();
		api.markDevHostReady();
		const plugin = ecopagesHotUpdate(api);
		const send = vi.fn();
		const server = {
			watcher: { add: vi.fn() },
			environments: { client: {}, ssr: { moduleGraph: { getModulesByFile: () => undefined } } },
			hot: { send },
		};
		const context = {
			environment: {
				name: 'client',
				moduleGraph: { invalidateModule: vi.fn() },
			},
		} as never;

		callPluginHook(plugin.hotUpdate, context, {
			file: '/app/public/a.ico',
			modules: [],
			server: server as never,
		});
		callPluginHook(plugin.hotUpdate, context, {
			file: '/app/public/b.ico',
			modules: [],
			server: server as never,
		});

		await vi.advanceTimersByTimeAsync(200);

		expect(send).toHaveBeenCalledTimes(1);
	});

	it('defers full reload until the dev host warmup has completed', async () => {
		vi.useFakeTimers();

		const api = createApi();
		const plugin = ecopagesHotUpdate(api);
		const send = vi.fn();
		const server = {
			watcher: { add: vi.fn() },
			environments: { client: {}, ssr: { moduleGraph: { getModulesByFile: () => undefined } } },
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
				file: '/app/public/favicon.ico',
				modules: [],
				server: server as never,
			},
		);

		await vi.advanceTimersByTimeAsync(500);
		expect(send).not.toHaveBeenCalled();

		api.markDevHostReady();
		await Promise.resolve();

		await vi.advanceTimersByTimeAsync(200);

		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith({ type: 'full-reload', path: '*' });
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
				client: {},
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

	it('requests a debounced full reload for explicit server view invalidations', async () => {
		vi.useFakeTimers();

		const api = createApi();
		api.markDevHostReady();
		const plugin = ecopagesHotUpdate(api);
		const send = vi.fn();
		const server = {
			watcher: { add: vi.fn() },
			environments: { client: {}, ssr: { moduleGraph: { getModulesByFile: () => undefined } } },
			hot: { send },
		};

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

		await vi.advanceTimersByTimeAsync(200);

		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith({ type: 'full-reload', path: '*' });
	});

	it('delegates route-source changes to Vite HMR without a full reload', async () => {
		vi.useFakeTimers();

		const api = createApi();
		api.markDevHostReady();
		const plugin = ecopagesHotUpdate(api);
		const send = vi.fn();
		const invalidateModule = vi.fn();
		const modules = [{ id: 'page' }];
		const server = {
			watcher: { add: vi.fn() },
			environments: {
				client: {},
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

		await vi.advanceTimersByTimeAsync(500);

		expect(send).not.toHaveBeenCalled();
	});
});
