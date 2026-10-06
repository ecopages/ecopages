import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createEcopagesPluginApi } from './plugin-api.ts';
import { ecopagesDevServer } from './ecopages-dev-server.ts';

type DevServerModule = {
	app?: {
		fetch?: (request: Request) => Promise<Response>;
		handleListening?: (origin: string) => void;
		attachWebSocketUpgrades?: (...args: unknown[]) => Promise<void>;
		stop?: () => Promise<void>;
	};
};

type FakeModuleNode = { file: string; importedModules: Set<FakeModuleNode> };

function moduleNode(file: string, ...importedModules: FakeModuleNode[]): FakeModuleNode {
	return { file, importedModules: new Set(importedModules) };
}

function createApi() {
	return createEcopagesPluginApi({
		appConfig: {
			rootDir: '/app',
			runtime: {},
			integrations: [],
			sourceTransforms: new Map(),
			absolutePaths: {
				componentsDir: '/app/src/components',
				distDir: '/app/dist',
				htmlTemplatePath: '/app/src/app.html',
				includesDir: '/app/src/includes',
				pagesDir: '/app/src/pages',
				layoutsDir: '/app/src/layouts',
			},
		} as never,
	});
}

async function setupDevServerMiddleware(
	fetchResponse: Response,
	options?: {
		module?: DevServerModule;
		includeMiddlewares?: boolean;
		appEntryModule?: FakeModuleNode;
		middlewareMode?: boolean;
		appLoadGate?: Promise<void>;
		devServerOrigin?: string;
		captureFetch?: (request: Request) => void;
	},
) {
	let middleware: ((req: unknown, res: unknown, next: (error?: unknown) => void) => Promise<void>) | undefined;

	const api = createApi();
	if (options?.devServerOrigin) {
		api.setDevServerOrigin(options.devServerOrigin);
	}

	const plugin = ecopagesDevServer(api);
	const fetchImpl =
		options?.module?.app?.fetch ??
		(async (request: Request) => {
			options?.captureFetch?.(request);
			return fetchResponse.clone();
		});

	const httpServer = options?.middlewareMode ? null : new EventEmitter();
	const watcher = new EventEmitter();
	const restart = vi.fn(async () => undefined);
	const getModuleByUrl = vi.fn(async () => options?.appEntryModule);
	const ssrEnvironment = { moduleGraph: { getModuleByUrl } };
	const logger = { info: vi.fn(), error: vi.fn() };
	let appLoads = 0;

	const server = {
		httpServer,
		watcher,
		restart,
		config: { root: '/app', logger },
		hot: { send: vi.fn() },
		environments: {
			client: {
				hot: { send: vi.fn() },
				async waitForRequestsIdle() {},
				async warmupRequest() {},
			},
			ssr: ssrEnvironment,
		},
		async transformIndexHtml(_url: string, html: string) {
			if (html.includes('/@vite/client')) {
				return html;
			}

			return html.replace('</head>', '<script type="module" src="/@vite/client"></script></head>');
		},
		async ssrLoadModule(id: string) {
			if (id === '@ecopages/core/dev/host-runtime') {
				return {
					createDevelopmentHostRuntime() {
						return {
							registerHostModuleLoader() {},
						};
					},
				};
			}

			if (id === 'virtual:ecopages/images.ts') {
				return { images: {} };
			}

			appLoads += 1;
			await options?.appLoadGate;
			return (
				options?.module ?? {
					app: {
						fetch: fetchImpl,
						handleListening: () => {},
					},
				}
			);
		},
	} as Record<string, unknown>;

	if (options?.includeMiddlewares !== false) {
		server.middlewares = {
			use(handler: typeof middleware) {
				middleware = handler;
			},
		};
	}

	(plugin.configureServer as Function)(server as never)?.();

	const headers = new Map<string, string>();
	const chunks: Uint8Array[] = [];
	let ended = false;
	const response = {
		statusCode: 0,
		statusMessage: '',
		setHeader(name: string, value: string) {
			headers.set(name, value);
		},
		write(chunk: Uint8Array) {
			chunks.push(chunk);
		},
		end() {
			ended = true;
		},
	};

	return {
		server,
		httpServer,
		logger,
		closeServer() {
			return (plugin.closeBundle as Function).call({ environment: ssrEnvironment });
		},
		watcher,
		restart,
		getModuleByUrl,
		getAppLoads() {
			return appLoads;
		},
		middleware,
		headers,
		chunks,
		response,
		getBody() {
			return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
		},
		isEnded() {
			return ended;
		},
	};
}

describe('ecopagesDevServer', () => {
	it('registers a host module loader that preserves awaited host modules', async () => {
		const api = createApi();
		const plugin = ecopagesDevServer(api);
		let registeredLoader: ((id: string) => Promise<unknown>) | undefined;

		const server = {
			watcher: new EventEmitter(),
			hot: { send: vi.fn() },
			environments: {
				client: {
					hot: { send: vi.fn() },
					async waitForRequestsIdle() {},
					async warmupRequest() {},
				},
				ssr: { moduleGraph: {} },
			},
			async ssrLoadModule(id: string) {
				if (id === '@ecopages/core/dev/host-runtime') {
					return {
						createDevelopmentHostRuntime() {
							return {
								registerHostModuleLoader(loader: (id: string) => Promise<unknown>) {
									registeredLoader = loader;
								},
							};
						},
					};
				}

				if (id === '/virtual:tla-module') {
					return {
						default: { ok: true },
						value: 42,
					};
				}

				return {
					app: {
						fetch: async () => new Response('ok'),
						handleListening: () => {},
					},
				};
			},
			middlewares: {
				use() {},
			},
		};

		(plugin.configureServer as Function)(server as never)?.();

		await vi.waitFor(() => expect(registeredLoader).toBeTypeOf('function'));
		await expect(registeredLoader?.('/virtual:tla-module')).resolves.toEqual({
			default: { ok: true },
			value: 42,
		});
	});

	it('builds middleware requests from the resolved Vite dev-server origin', async () => {
		let receivedRequest: Request | undefined;
		const harness = await setupDevServerMiddleware(new Response('ok'), {
			devServerOrigin: 'http://localhost:4012',
			captureFetch: (request) => {
				receivedRequest = request;
			},
		});

		await harness.middleware?.(
			{
				headers: {},
				method: 'GET',
				originalUrl: '/catalog/semantic-html',
			},
			harness.response,
			(error?: unknown) => {
				if (error) {
					throw error;
				}
			},
		);

		expect(receivedRequest?.url).toBe('http://localhost:4012/catalog/semantic-html');
	});

	it('removes stale body-derived headers after HTML rewriting', async () => {
		const harness = await setupDevServerMiddleware(
			new Response('<!DOCTYPE html><html><head></head><body></body></html>', {
				headers: {
					'content-length': '54',
					'content-type': 'text/html; charset=utf-8',
					etag: '"before"',
				},
			}),
		);

		await harness.middleware?.(
			{
				headers: {
					'sec-fetch-dest': 'document',
					'sec-fetch-mode': 'navigate',
				},
				method: 'GET',
				originalUrl: '/',
			},
			harness.response,
			(error?: unknown) => {
				if (error) {
					throw error;
				}
			},
		);

		expect(harness.headers.has('content-length')).toBe(false);
		expect(harness.headers.has('etag')).toBe(false);
		expect(harness.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(harness.getBody()).not.toContain('/@vite/client');
		expect(harness.getBody()).toContain("import '/_hmr_runtime.js'");
		expect(harness.isEnded()).toBe(true);
	});

	it('skips Vite index transforms for browser-router HTML fetches', async () => {
		const harness = await setupDevServerMiddleware(
			new Response('<!DOCTYPE html><html><head></head><body></body></html>', {
				headers: {
					'content-type': 'text/html; charset=utf-8',
				},
			}),
		);

		await harness.middleware?.(
			{
				headers: {
					'sec-fetch-dest': 'empty',
					'sec-fetch-mode': 'cors',
				},
				method: 'GET',
				originalUrl: '/images',
			},
			harness.response,
			(error?: unknown) => {
				if (error) {
					throw error;
				}
			},
		);

		expect(harness.getBody()).not.toContain('/@vite/client');
		expect(harness.getBody()).not.toContain("import '/_hmr_runtime.js'");
		expect(harness.isEnded()).toBe(true);
	});

	it('passes non-html responses through without rewriting them', async () => {
		const harness = await setupDevServerMiddleware(
			new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: {
					'content-type': 'application/json',
					'x-eco-response': 'passthrough',
				},
			}),
		);

		await harness.middleware?.(
			{
				headers: {},
				method: 'GET',
				originalUrl: '/api/data',
			},
			harness.response,
			(error?: unknown) => {
				if (error) throw error;
			},
		);

		expect(harness.headers.get('content-type')).toBe('application/json');
		expect(harness.headers.get('x-eco-response')).toBe('passthrough');
		expect(harness.getBody()).toBe('{"ok":true}');
		expect(harness.getBody()).not.toContain('/@vite/client');
	});

	it('forwards redirect responses without rewriting them', async () => {
		const harness = await setupDevServerMiddleware(
			new Response(null, {
				status: 302,
				headers: {
					location: '/login',
				},
			}),
		);

		await harness.middleware?.(
			{
				headers: {},
				method: 'GET',
				originalUrl: '/private',
			},
			harness.response,
			(error?: unknown) => {
				if (error) throw error;
			},
		);

		expect(harness.response.statusCode).toBe(302);
		expect(harness.headers.get('location')).toBe('/login');
		expect(harness.getBody()).toBe('');
	});

	it('fails fast when the Vite server does not expose Connect middlewares', () => {
		const api = createApi();
		const plugin = ecopagesDevServer(api);

		expect(() =>
			(plugin.configureServer as Function)({
				async ssrLoadModule() {
					return {};
				},
			}),
		).toThrow('[ecopages] ecopagesDevServer requires a Vite dev server with Connect-style middlewares.use()');
	});

	it('passes WebSocket upgrade requests through to the HTTP server upgrade handlers', async () => {
		const harness = await setupDevServerMiddleware(new Response('unused'), {
			module: {
				app: {
					fetch: async () => new Response('ok'),
					handleListening: () => {},
				},
			},
		});

		let forwarded = false;

		await harness.middleware?.(
			{
				headers: { upgrade: 'websocket', connection: 'Upgrade' },
				method: 'GET',
				originalUrl: '/ws/chat/lobby?username=test',
			},
			harness.response,
			(error?: unknown) => {
				if (error) throw error;
				forwarded = true;
			},
		);

		expect(forwarded).toBe(true);
		expect(harness.isEnded()).toBe(false);
	});

	it('attaches app websocket upgrades before serving HTTP', async () => {
		let attachCompleted = false;
		let attachCompletedAtFetch: boolean | undefined;

		const harness = await setupDevServerMiddleware(new Response('ok'), {
			module: {
				app: {
					fetch: async () => {
						attachCompletedAtFetch = attachCompleted;
						return new Response('ok');
					},
					handleListening: () => {},
					attachWebSocketUpgrades: async () => {
						await new Promise((resolve) => setImmediate(resolve));
						attachCompleted = true;
					},
				},
			},
		});

		await harness.middleware?.(
			{ headers: {}, method: 'GET', originalUrl: '/ws-chat' },
			harness.response,
			(error) => {
				if (error) throw error;
			},
		);

		expect(attachCompletedAtFetch).toBe(true);
	});

	it('attaches websocket upgrades to the HTTP server it was configured with', async () => {
		let releaseAppLoad = () => {};
		const attachWebSocketUpgrades = vi.fn(async (_httpServer: unknown) => undefined);
		const harness = await setupDevServerMiddleware(new Response('ok'), {
			appLoadGate: new Promise<void>((resolve) => {
				releaseAppLoad = resolve;
			}),
			module: {
				app: { fetch: async () => new Response('ok'), handleListening: () => {}, attachWebSocketUpgrades },
			},
		});

		harness.server.httpServer = new EventEmitter();
		releaseAppLoad();

		await vi.waitFor(() => expect(attachWebSocketUpgrades).toHaveBeenCalled());
		expect(attachWebSocketUpgrades.mock.calls[0]?.[0]).toBe(harness.httpServer);
	});

	it('surfaces a clear error when the app module does not export app.fetch()', async () => {
		const harness = await setupDevServerMiddleware(new Response('unused'), { module: {} });
		const next = vi.fn();

		await harness.middleware?.({ headers: {}, method: 'GET', originalUrl: '/' }, harness.response, next);

		expect(next).toHaveBeenCalledWith(
			expect.objectContaining({ message: expect.stringContaining('must export an app.fetch(request) handler') }),
		);
	});

	it('loads the app once for repeated middleware requests', async () => {
		const harness = await setupDevServerMiddleware(new Response('ok'));

		await harness.middleware?.({ headers: {}, method: 'GET', originalUrl: '/' }, harness.response, () => undefined);
		await harness.middleware?.(
			{ headers: {}, method: 'GET', originalUrl: '/images' },
			harness.response,
			() => undefined,
		);

		expect(harness.getAppLoads()).toBe(1);
	});

	it.each(['change', 'unlink'])('restarts Vite on a %s of a module the app entry imports', async (event) => {
		const harness = await setupDevServerMiddleware(new Response('ok'), {
			appEntryModule: moduleNode(
				'/app/app.ts',
				moduleNode('/app/src/handlers/api.ts', moduleNode('/app/src/data.ts')),
			),
		});

		harness.watcher.emit(event, '/app/src/data.ts');

		await vi.waitFor(() => expect(harness.restart).toHaveBeenCalledTimes(1));
	});

	it('does not restart Vite for a module outside the app entry imports', async () => {
		const harness = await setupDevServerMiddleware(new Response('ok'), {
			appEntryModule: moduleNode('/app/app.ts', moduleNode('/app/src/handlers/api.ts')),
		});

		harness.watcher.emit('change', '/app/src/pages/index.tsx');
		await vi.waitFor(() => expect(harness.getModuleByUrl).toHaveBeenCalled());
		await new Promise((resolve) => setImmediate(resolve));

		expect(harness.restart).not.toHaveBeenCalled();
	});

	it('logs the restart cause', async () => {
		const harness = await setupDevServerMiddleware(new Response('ok'), {
			appEntryModule: moduleNode('/app/app.ts'),
		});

		harness.watcher.emit('change', '/app/app.ts');

		await vi.waitFor(() => expect(harness.restart).toHaveBeenCalledTimes(1));
		expect(harness.logger.info).toHaveBeenCalledWith(expect.stringContaining('app.ts changed'), expect.anything());
	});

	it.each(['add', 'change'])('restarts Vite on any %s after the app failed to load', async (event) => {
		const harness = await setupDevServerMiddleware(new Response('unused'), { module: {} });

		harness.watcher.emit(event, '/app/src/handlers/missing.ts');

		await vi.waitFor(() => expect(harness.restart).toHaveBeenCalledTimes(1));
		expect(harness.logger.error).toHaveBeenCalledTimes(1);
		expect(harness.logger.error).toHaveBeenCalledWith(
			expect.stringContaining('must export an app.fetch(request) handler'),
			expect.anything(),
		);
	});

	it.each([
		['with an HTTP server', false],
		['in middleware mode', true],
	])('stops the app when its Vite server closes %s', async (_mode, middlewareMode) => {
		const stop = vi.fn(async () => undefined);
		const harness = await setupDevServerMiddleware(new Response('ok'), {
			middlewareMode,
			module: { app: { fetch: async () => new Response('ok'), handleListening: () => {}, stop } },
		});

		await harness.closeServer();

		expect(stop).toHaveBeenCalledTimes(1);
	});
});
