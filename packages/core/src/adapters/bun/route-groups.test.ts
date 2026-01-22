import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { FIXTURE_APP_PROJECT_DIR } from '../../../__fixtures__/constants.js';
import { ConfigBuilder } from '../../config/config-builder.ts';
import type { Middleware } from '../../public-types.ts';
import { EcopagesApp } from './create-app.ts';

const appConfig = await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).build();

let server: Server<unknown> | null = null;
const TEST_PORT = 3006;

const apiKeyMiddleware: Middleware = async (context, next) => {
	const apiKey = context.request.headers.get('X-API-Key');
	if (!apiKey || apiKey !== 'secret-key') {
		return new Response('Forbidden', { status: 403 });
	}
	return next();
};

const corsMiddleware: Middleware = async (context, next) => {
	const response = await next();
	response.headers.set('Access-Control-Allow-Origin', '*');
	return response;
};

describe('Route Groups', () => {
	beforeAll(async () => {
		const app = new EcopagesApp({
			appConfig,
			serverOptions: {
				port: TEST_PORT,
				hostname: 'localhost',
			},
		});

		app.group('/api/v1', [], (r) => {
			r.get('/public', async () => new Response(JSON.stringify({ data: 'v1 public' })));
			r.post('/echo', async ({ request }) => {
				const body = await request.json();
				return new Response(JSON.stringify({ echo: body }));
			});
		});

		app.group('/api/v2', [corsMiddleware], (r) => {
			r.get('/data', async () => new Response(JSON.stringify({ version: 2 })));
			r.put('/update', async () => new Response(JSON.stringify({ updated: true })));
		});

		app.group('/api/protected', [apiKeyMiddleware], (r) => {
			r.get('/secret', async () => new Response(JSON.stringify({ secret: 'data' })));
			r.post('/admin', async () => new Response(JSON.stringify({ admin: true })));
		});

		app.group('/api/combined', [corsMiddleware, apiKeyMiddleware], (r) => {
			r.get('/secure', async () => new Response(JSON.stringify({ secure: true })));
		});

		server = await app.start();
	});

	afterAll(() => {
		if (server) {
			server.stop(true);
		}
	});

	test('should handle route group with prefix', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/v1/public`);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ data: 'v1 public' });
	});

	test('should handle POST in route group', async () => {
		const testData = { message: 'hello' };
		const res = await fetch(`http://localhost:${TEST_PORT}/api/v1/echo`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(testData),
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ echo: testData });
	});

	test('should apply group middleware to all routes', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/v2/data`);

		expect(res.status).toBe(200);
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(await res.json()).toEqual({ version: 2 });
	});

	test('should apply group middleware to PUT route', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/v2/update`, {
			method: 'PUT',
		});

		expect(res.status).toBe(200);
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(await res.json()).toEqual({ updated: true });
	});

	test('should block access when group middleware fails', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/protected/secret`);

		expect(res.status).toBe(403);
		expect(await res.text()).toBe('Forbidden');
	});

	test('should allow access when group middleware passes', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/protected/secret`, {
			headers: { 'X-API-Key': 'secret-key' },
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ secret: 'data' });
	});

	test('should apply group middleware to POST route', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/protected/admin`, {
			method: 'POST',
			headers: { 'X-API-Key': 'secret-key' },
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ admin: true });
	});

	test('should execute multiple group middleware in order', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/combined/secure`);

		expect(res.status).toBe(403);
		expect(await res.text()).toBe('Forbidden');
	});

	test('should pass through all group middleware when valid', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/combined/secure`, {
			headers: { 'X-API-Key': 'secret-key' },
		});

		expect(res.status).toBe(200);
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(await res.json()).toEqual({ secure: true });
	});

	test('should handle multiple groups with same prefix', async () => {
		const app = new EcopagesApp({
			appConfig,
			serverOptions: {
				port: 3007,
				hostname: 'localhost',
			},
		});

		app.group('/api', [], (r) => {
			r.get('/first', async () => new Response('first'));
		});

		app.group('/api', [], (r) => {
			r.get('/second', async () => new Response('second'));
		});

		const testServer = await app.start();

		const res1 = await fetch('http://localhost:3007/api/first');
		const res2 = await fetch('http://localhost:3007/api/second');

		expect(res1.status).toBe(200);
		expect(await res1.text()).toBe('first');
		expect(res2.status).toBe(200);
		expect(await res2.text()).toBe('second');

		testServer.stop(true);
	});
});
