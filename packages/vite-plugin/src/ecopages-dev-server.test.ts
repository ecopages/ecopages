import { describe, expect, it } from 'vitest';
import { createEcopagesPluginApi } from './plugin-api.ts';
import { ecopagesDevServer } from './ecopages-dev-server.ts';

function setupDevServerMiddleware(fetchResponse: Response) {
	let middleware: ((req: unknown, res: unknown, next: (error?: unknown) => void) => Promise<void>) | undefined;

	const api = createEcopagesPluginApi({
		appConfig: {
			rootDir: '/app',
			runtime: {},
			integrations: [],
			sourceTransforms: new Map(),
			absolutePaths: {
				pagesDir: '/app/src/pages',
				layoutsDir: '/app/src/layouts',
			},
		} as never,
	});

	const plugin = ecopagesDevServer(api);
	(plugin.configureServer as Function)({
		middlewares: {
			use(handler: typeof middleware) {
				middleware = handler;
			},
		},
		async ssrLoadModule(id: string) {
			if (id === '@ecopages/core/host-module-loader') {
				return {
					setHostModuleLoader() {},
				};
			}

			return {
				app: {
					fetch: async () => fetchResponse,
				},
			};
		},
	} as never)?.();

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
});
