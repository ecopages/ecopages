import { describe, expect, it } from 'vitest';
import { createEcopagesPluginApi } from './plugin-api.ts';
import { ecopagesDevServer } from './ecopages-dev-server.ts';

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

function setupDevServerMiddleware(
	fetchResponse: Response,
	options?: { module?: Record<string, unknown>; includeMiddlewares?: boolean },
) {
	let middleware: ((req: unknown, res: unknown, next: (error?: unknown) => void) => Promise<void>) | undefined;

	const api = createApi();

	const plugin = ecopagesDevServer(api);
	const server = {
		async ssrLoadModule(id: string) {
			if (id === '@ecopages/core/host-module-loader') {
				return {
					setHostModuleLoader() {},
				};
			}

			return (
				options?.module ?? {
					app: {
						fetch: async () => fetchResponse,
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
	it('removes stale body-derived headers after HTML rewriting', async () => {
		const harness = setupDevServerMiddleware(
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
				headers: {},
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
		expect(harness.getBody()).toContain('/@vite/client');
		expect(harness.isEnded()).toBe(true);
	});

	it('passes non-html responses through without rewriting them', async () => {
		const harness = setupDevServerMiddleware(
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
		const harness = setupDevServerMiddleware(
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

	it('surfaces a clear error when host-module-loader is missing setHostModuleLoader()', async () => {
		const api = createApi();
		const plugin = ecopagesDevServer(api);

		let middleware: Function | undefined;

		(plugin.configureServer as Function)({
			middlewares: {
				use(handler: Function) {
					middleware = handler;
				},
			},
			async ssrLoadModule() {
				return {};
			},
		})?.();

		let receivedError: unknown;

		await middleware?.(
			{ headers: {}, method: 'GET', originalUrl: '/' },
			{ statusCode: 0, statusMessage: '', setHeader() {}, write() {}, end() {} },
			(error?: unknown) => {
				receivedError = error;
			},
		);

		expect(receivedError).toBeInstanceOf(Error);
		expect((receivedError as Error).message).toContain(
			'@ecopages/core/host-module-loader must export setHostModuleLoader()',
		);
	});

	it('surfaces a clear error when the app module does not export app.fetch()', async () => {
		const harness = setupDevServerMiddleware(new Response('unused'), {
			module: {},
		});

		let receivedError: unknown;

		await harness.middleware?.(
			{
				headers: {},
				method: 'GET',
				originalUrl: '/',
			},
			harness.response,
			(error?: unknown) => {
				receivedError = error;
			},
		);

		expect(receivedError).toBeInstanceOf(Error);
		expect((receivedError as Error).message).toContain('must export an app.fetch(request) handler');
	});
});
