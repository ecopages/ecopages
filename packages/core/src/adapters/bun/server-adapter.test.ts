import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { FIXTURE_APP_PROJECT_DIR } from '../../../__fixtures__/constants.js';
import { ConfigBuilder } from '../../config/config-builder.ts';
import { defineApiHandler } from './define-api-handler.ts';
import { createBunServerAdapter } from './server-adapter.ts';

const appConfig = await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).build();

let server: Server<unknown>;

describe('BunServerAdapter', () => {
	beforeAll(async () => {
		const adapter = await createBunServerAdapter({
			appConfig,
			runtimeOrigin: appConfig.baseUrl,
			options: { watch: false },
			serveOptions: {
				port: 3001,
				hostname: 'localhost',
			},
			apiHandlers: [
				defineApiHandler({
					path: '/api/test',
					method: 'GET',
					handler: async () => new Response('Hello World'),
				}),
				defineApiHandler({
					path: '/api/:id',
					method: 'GET',
					handler: async ({ request }) => {
						const { id } = request.params as { id: string };
						return new Response(id);
					},
				}),
				defineApiHandler({
					path: '/api/error',
					method: 'GET',
					handler: async () => {
						throw new Error('Test error');
					},
				}),
				defineApiHandler({
					path: '/api/post-test',
					method: 'POST',
					handler: async ({ request }) => {
						const body = await request.json();
						return new Response(JSON.stringify(body));
					},
				}),
				defineApiHandler({
					path: '/api/*',
					method: 'GET',
					handler: async () => new Response('Catch all'),
				}),
				defineApiHandler({
					path: '/api/multi-method',
					method: 'GET',
					handler: async () => new Response(JSON.stringify({ method: 'GET' })),
				}),
				defineApiHandler({
					path: '/api/multi-method',
					method: 'PUT',
					handler: async () => new Response(JSON.stringify({ method: 'PUT' })),
				}),
				defineApiHandler({
					path: '/api/multi-method',
					method: 'POST',
					handler: async () => new Response(JSON.stringify({ method: 'POST' })),
				}),
			],
		});

		server = Bun.serve(adapter.getServerOptions() as Bun.Serve.Options<unknown>);
		await adapter.completeInitialization(server);
	});

	afterAll(() => {
		server.stop(true);
	});

	test('server should be created and running', () => {
		expect(server).toBeDefined();
		expect(server.port).toBe(3001);
		expect(server.hostname).toBe('localhost');
	});

	test('GET /api/test should return Hello World', async () => {
		const res = await fetch('http://localhost:3001/api/test');

		expect(res.status).toBe(200);
		expect(await res.text()).toBe('Hello World');
	});

	test('GET /api/:id should return the id parameter', async () => {
		const res = await fetch('http://localhost:3001/api/123');

		expect(res.status).toBe(200);
		expect(await res.text()).toBe('123');
	});

	test('GET /api/* should handle catch-all routes', async () => {
		const res = await fetch('http://localhost:3001/api/hola-here/bye-bye');

		expect(res.status).toBe(200);
		expect(await res.text()).toBe('Catch all');
	});

	test('GET /api/error should handle errors gracefully', async () => {
		const res = await fetch('http://localhost:3001/api/error');

		expect(res.status).toBe(500);
		const body = await res.text();
		expect(body).toEqual('Internal Server Error');
	});

	test('POST /api/post-test should handle JSON body', async () => {
		const testData = { message: 'Hello' };
		const res = await fetch(
			new Request('http://localhost:3001/api/post-test', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(testData),
			}),
		);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(testData);
	});

	test('should handle multiple concurrent requests', async () => {
		const requests = Array(5)
			.fill(null)
			.map(() => fetch('http://localhost:3001/api/test'));

		const responses = await Promise.all(requests);

		for (const res of responses) {
			expect(res.status).toBe(200);
			expect(await res.text()).toBe('Hello World');
		}
	});

	test('should handle multiple HTTP methods on the same path', async () => {
		const getRes = await fetch('http://localhost:3001/api/multi-method', { method: 'GET' });
		expect(getRes.status).toBe(200);
		expect(await getRes.json()).toEqual({ method: 'GET' });

		const putRes = await fetch('http://localhost:3001/api/multi-method', { method: 'PUT' });
		expect(putRes.status).toBe(200);
		expect(await putRes.json()).toEqual({ method: 'PUT' });

		const postRes = await fetch('http://localhost:3001/api/multi-method', { method: 'POST' });
		expect(postRes.status).toBe(200);
		expect(await postRes.json()).toEqual({ method: 'POST' });
	});
});

describe('BunServerAdapter HMR Injection', () => {
	let hmrServer: Server<unknown>;
	const HMR_PORT = 3002;

	beforeAll(async () => {
		const adapter = await createBunServerAdapter({
			appConfig,
			runtimeOrigin: `http://localhost:${HMR_PORT}`,
			options: { watch: true },
			serveOptions: {
				port: HMR_PORT,
				hostname: 'localhost',
			},
			apiHandlers: [
				defineApiHandler({
					path: '/api/html-page',
					method: 'GET',
					handler: async ({ response }) => {
						return response.html(`<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body><h1>Hello</h1></body>
</html>`);
					},
				}),
				defineApiHandler({
					path: '/api/json-data',
					method: 'GET',
					handler: async ({ response }) => {
						return response.json({ data: 'test' });
					},
				}),
				defineApiHandler({
					path: '/api/text-content',
					method: 'GET',
					handler: async ({ response }) => {
						return response.text('Plain text content');
					},
				}),
				defineApiHandler({
					path: '/api/html-no-closing-tag',
					method: 'GET',
					handler: async ({ response }) => {
						return response.html('<div>Partial HTML without closing html tag</div>');
					},
				}),
			],
		});

		const serverOptions = adapter.getServerOptions({ enableHmr: true });
		hmrServer = Bun.serve(serverOptions as Bun.Serve.Options<unknown>);
		await adapter.completeInitialization(hmrServer);
	});

	afterAll(() => {
		hmrServer.stop(true);
	});

	test('should inject HMR script into HTML responses from API handlers', async () => {
		const res = await fetch(`http://localhost:${HMR_PORT}/api/html-page`);

		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain(`<script type="module">import '/_hmr_runtime.js';</script></html>`);
	});

	test('should NOT inject HMR script into JSON responses', async () => {
		const res = await fetch(`http://localhost:${HMR_PORT}/api/json-data`);

		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).not.toContain('_hmr_runtime.js');
		expect(JSON.parse(body)).toEqual({ data: 'test' });
	});

	test('should NOT inject HMR script into text responses', async () => {
		const res = await fetch(`http://localhost:${HMR_PORT}/api/text-content`);

		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toBe('Plain text content');
		expect(body).not.toContain('_hmr_runtime.js');
	});

	test('should NOT inject HMR script if HTML has no closing html tag', async () => {
		const res = await fetch(`http://localhost:${HMR_PORT}/api/html-no-closing-tag`);

		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toBe('<div>Partial HTML without closing html tag</div>');
		expect(body).not.toContain('_hmr_runtime.js');
	});
});

describe('BunServerAdapter without watch mode', () => {
	let noWatchServer: Server<unknown>;
	const NO_WATCH_PORT = 3003;

	beforeAll(async () => {
		const adapter = await createBunServerAdapter({
			appConfig,
			runtimeOrigin: `http://localhost:${NO_WATCH_PORT}`,
			options: { watch: false },
			serveOptions: {
				port: NO_WATCH_PORT,
				hostname: 'localhost',
			},
			apiHandlers: [
				defineApiHandler({
					path: '/api/html-page',
					method: 'GET',
					handler: async ({ response }) => {
						return response.html(`<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body><h1>Hello</h1></body>
</html>`);
					},
				}),
			],
		});

		noWatchServer = Bun.serve(adapter.getServerOptions() as Bun.Serve.Options<unknown>);
		await adapter.completeInitialization(noWatchServer);
	});

	afterAll(() => {
		noWatchServer.stop(true);
	});

	test('should NOT inject HMR script when watch mode is disabled', async () => {
		const res = await fetch(`http://localhost:${NO_WATCH_PORT}/api/html-page`);

		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).not.toContain('_hmr_runtime.js');
		expect(html).toContain('</html>');
	});
});
