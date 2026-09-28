import { describe, expect, it, vi } from 'vitest';
import { createEcopagesPluginApi } from './plugin-api.ts';
import { ecopagesDevServer } from './ecopages-dev-server.ts';

type DevServerModule = {
	app?: {
		fetch?: (request: Request) => Promise<Response>;
		handleListening?: (origin: string) => void;
		attachWebSocketUpgrades?: (...args: unknown[]) => Promise<void>;
	};
};

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
		httpServer?: Record<string, unknown>;
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

	const server = {
		httpServer: options?.httpServer,
		hot: { send: vi.fn() },
		environments: {
			client: {
				hot: { send: vi.fn() },
				async waitForRequestsIdle() {},
				async warmupRequest() {},
			},
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
	await api.getDevHostReady();

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
		api,
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
			hot: { send: vi.fn() },
			environments: {
				client: {
					hot: { send: vi.fn() },
					async waitForRequestsIdle() {},
					async warmupRequest() {},
				},
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
		await api.getDevHostReady();

		expect(registeredLoader).toBeTypeOf('function');
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
		const attachWebSocketUpgrades = vi.fn(async () => undefined);
		let attachCompleted = false;
		let fetchCount = 0;

		const harness = await setupDevServerMiddleware(new Response('ok'), {
			httpServer: {},
			module: {
				app: {
					fetch: async () => {
						fetchCount += 1;
						if (fetchCount > 1) {
							expect(attachCompleted).toBe(true);
						}
						return new Response('ok');
					},
					handleListening: () => {},
					attachWebSocketUpgrades: async (...args: unknown[]) => {
						await (attachWebSocketUpgrades as (...spreadArgs: unknown[]) => Promise<void>)(...args);
						attachCompleted = true;
					},
				},
			},
		});

		await harness.middleware?.(
			{
				headers: {},
				method: 'GET',
				originalUrl: '/ws-chat',
			},
			harness.response,
			(error?: unknown) => {
				if (error) throw error;
			},
		);

		expect(attachWebSocketUpgrades).toHaveBeenCalledTimes(1);
		expect(harness.isEnded()).toBe(true);
	});

	it('surfaces a clear error when the app module does not export app.fetch()', async () => {
		await expect(setupDevServerMiddleware(new Response('unused'), { module: {} })).rejects.toThrow(
			'must export an app.fetch(request) handler',
		);
	});

	it('serves repeated middleware requests from the warmed app cache', async () => {
		const harness = await setupDevServerMiddleware(new Response('ok'), {
			module: {
				app: {
					fetch: async () => new Response('ok'),
					handleListening: () => {},
				},
			},
		});

		await harness.middleware?.({ headers: {}, method: 'GET', originalUrl: '/' }, harness.response, () => undefined);
		await harness.middleware?.(
			{ headers: {}, method: 'GET', originalUrl: '/images' },
			harness.response,
			() => undefined,
		);

		expect(harness.api.getCachedApp()).not.toBeNull();
		expect(harness.isEnded()).toBe(true);
	});
});
