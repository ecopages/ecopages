import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { FIXTURE_APP_PROJECT_DIR } from '../../../__fixtures__/constants.js';
import { ConfigBuilder } from '../../config/config-builder.ts';
import type { Middleware } from '../../public-types.ts';
import { defineApiHandler } from './define-api-handler.ts';
import { createBunServerAdapter } from './server-adapter.ts';

const appConfig = await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).build();

let server: Server<unknown>;
const TEST_PORT = 3005;

const loggingMiddleware: Middleware = async (context, next) => {
	const response = await next();
	response.headers.set('X-Logged', 'true');
	return response;
};

const authMiddleware: Middleware = async (context, next) => {
	const authHeader = context.request.headers.get('Authorization');
	if (!authHeader || authHeader !== 'Bearer valid-token') {
		return new Response('Unauthorized', { status: 401 });
	}
	return next();
};

const timingMiddleware: Middleware = async (context, next) => {
	const start = Date.now();
	const response = await next();
	const duration = Date.now() - start;
	response.headers.set('X-Response-Time', `${duration}ms`);
	return response;
};

describe('Middleware', () => {
	beforeAll(async () => {
		const adapter = await createBunServerAdapter({
			appConfig,
			runtimeOrigin: appConfig.baseUrl,
			options: { watch: false },
			serveOptions: {
				port: TEST_PORT,
				hostname: 'localhost',
			},
			apiHandlers: [
				defineApiHandler({
					path: '/api/public',
					method: 'GET',
					handler: async () => new Response(JSON.stringify({ message: 'public' })),
				}),
				defineApiHandler({
					path: '/api/protected',
					method: 'GET',
					middleware: [authMiddleware],
					handler: async () => new Response(JSON.stringify({ message: 'protected' })),
				}),
				defineApiHandler({
					path: '/api/logged',
					method: 'GET',
					middleware: [loggingMiddleware],
					handler: async () => new Response(JSON.stringify({ message: 'logged' })),
				}),
				defineApiHandler({
					path: '/api/chained',
					method: 'GET',
					middleware: [loggingMiddleware, timingMiddleware],
					handler: async () => new Response(JSON.stringify({ message: 'chained' })),
				}),
				defineApiHandler({
					path: '/api/auth-logged',
					method: 'GET',
					middleware: [authMiddleware, loggingMiddleware],
					handler: async () => new Response(JSON.stringify({ message: 'auth-logged' })),
				}),
			],
		});

		server = Bun.serve(adapter.getServerOptions() as Bun.Serve.Options<unknown>);
		await adapter.completeInitialization(server);
	});

	afterAll(() => {
		server.stop(true);
	});

	test('should handle route without middleware', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/public`);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ message: 'public' });
		expect(res.headers.get('X-Logged')).toBeNull();
	});

	test('should execute single middleware', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/logged`);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ message: 'logged' });
		expect(res.headers.get('X-Logged')).toBe('true');
	});

	test('should short-circuit when middleware returns response', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/protected`);

		expect(res.status).toBe(401);
		expect(await res.text()).toBe('Unauthorized');
	});

	test('should allow request when auth middleware passes', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/protected`, {
			headers: { Authorization: 'Bearer valid-token' },
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ message: 'protected' });
	});

	test('should execute middleware chain in order', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/chained`);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ message: 'chained' });
		expect(res.headers.get('X-Logged')).toBe('true');
		expect(res.headers.get('X-Response-Time')).toMatch(/^\d+ms$/);
	});

	test('should short-circuit chain when middleware returns early', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/auth-logged`);

		expect(res.status).toBe(401);
		expect(await res.text()).toBe('Unauthorized');
		expect(res.headers.get('X-Logged')).toBeNull();
	});

	test('should pass through when all middleware call next()', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/auth-logged`, {
			headers: { Authorization: 'Bearer valid-token' },
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ message: 'auth-logged' });
		expect(res.headers.get('X-Logged')).toBe('true');
	});
});
