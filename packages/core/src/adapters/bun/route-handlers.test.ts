import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { FIXTURE_APP_PROJECT_DIR } from '../../../__fixtures__/constants.js';
import { ConfigBuilder } from '../../config/config-builder.ts';
import type { Middleware } from '../../public-types.ts';
import { EcopagesApp } from './create-app.ts';

const appConfig = await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).build();

const TEST_PORT = 3010;

const authMiddleware: Middleware = async (context, next) => {
	const token = context.request.headers.get('Authorization');
	if (!token || token !== 'Bearer valid-token') {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}
	return next();
};

const loggingMiddleware: Middleware = async (context, next) => {
	const response = await next();
	response.headers.set('X-Logged', 'true');
	return response;
};

const timingMiddleware: Middleware = async (context, next) => {
	const start = Date.now();
	const response = await next();
	response.headers.set('X-Response-Time', `${Date.now() - start}ms`);
	return response;
};

describe('Route Handlers with Options', () => {
	let server: Server<undefined> | undefined;

	beforeAll(async () => {
		const app = new EcopagesApp({
			appConfig,
			serverOptions: {
				port: TEST_PORT,
				hostname: 'localhost',
			},
		});

		app.get('/api/public', async () => {
			return new Response(JSON.stringify({ message: 'public' }), {
				headers: { 'Content-Type': 'application/json' },
			});
		});

		app.get(
			'/api/protected',
			async () => {
				return new Response(JSON.stringify({ message: 'protected' }), {
					headers: { 'Content-Type': 'application/json' },
				});
			},
			{ middleware: [authMiddleware] },
		);

		app.post(
			'/api/create',
			async ({ request }) => {
				const body = await request.json();
				return new Response(JSON.stringify({ created: body }), {
					headers: { 'Content-Type': 'application/json' },
				});
			},
			{ middleware: [authMiddleware] },
		);

		app.get(
			'/api/logged',
			async () => {
				return new Response(JSON.stringify({ message: 'logged' }), {
					headers: { 'Content-Type': 'application/json' },
				});
			},
			{ middleware: [loggingMiddleware] },
		);

		app.get(
			'/api/timed',
			async () => {
				return new Response(JSON.stringify({ message: 'timed' }), {
					headers: { 'Content-Type': 'application/json' },
				});
			},
			{ middleware: [timingMiddleware] },
		);

		app.get(
			'/api/chained',
			async () => {
				return new Response(JSON.stringify({ message: 'chained' }), {
					headers: { 'Content-Type': 'application/json' },
				});
			},
			{ middleware: [loggingMiddleware, timingMiddleware] },
		);

		app.get(
			'/api/auth-and-logged',
			async () => {
				return new Response(JSON.stringify({ message: 'auth-and-logged' }), {
					headers: { 'Content-Type': 'application/json' },
				});
			},
			{ middleware: [authMiddleware, loggingMiddleware] },
		);

		const result = await app.start();
		if (result) server = result;
	});

	afterAll(() => {
		if (server) {
			server.stop(true);
		}
	});

	test('should handle route without middleware', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/public`);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ message: 'public' });
	});

	test('should block access when auth middleware fails', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/protected`);

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: 'Unauthorized' });
	});

	test('should allow access when auth middleware passes', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/protected`, {
			headers: { Authorization: 'Bearer valid-token' },
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ message: 'protected' });
	});

	test('should apply middleware to POST route', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/create`, {
			method: 'POST',
			headers: {
				Authorization: 'Bearer valid-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ name: 'test' }),
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ created: { name: 'test' } });
	});

	test('should block POST when auth fails', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'test' }),
		});

		expect(res.status).toBe(401);
	});

	test('should apply logging middleware and add header', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/logged`);

		expect(res.status).toBe(200);
		expect(res.headers.get('X-Logged')).toBe('true');
		expect(await res.json()).toEqual({ message: 'logged' });
	});

	test('should apply timing middleware and add header', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/timed`);

		expect(res.status).toBe(200);
		expect(res.headers.get('X-Response-Time')).toMatch(/^\d+ms$/);
		expect(await res.json()).toEqual({ message: 'timed' });
	});

	test('should execute multiple middleware in order', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/chained`);

		expect(res.status).toBe(200);
		expect(res.headers.get('X-Logged')).toBe('true');
		expect(res.headers.get('X-Response-Time')).toMatch(/^\d+ms$/);
		expect(await res.json()).toEqual({ message: 'chained' });
	});

	test('should combine auth and logging middleware', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/auth-and-logged`, {
			headers: { Authorization: 'Bearer valid-token' },
		});

		expect(res.status).toBe(200);
		expect(res.headers.get('X-Logged')).toBe('true');
		expect(await res.json()).toEqual({ message: 'auth-and-logged' });
	});

	test('should block when first middleware in chain fails', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/auth-and-logged`);

		expect(res.status).toBe(401);
		expect(res.headers.get('X-Logged')).toBeNull();
	});
});
