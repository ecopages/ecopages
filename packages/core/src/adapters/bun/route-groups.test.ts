import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { FIXTURE_APP_PROJECT_DIR } from '../../../__fixtures__/constants.js';
import { ConfigBuilder } from '../../config/config-builder.ts';
import type { Middleware, StandardSchema } from '../../public-types.ts';
import { EcopagesApp } from './create-app.ts';

const appConfig = await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).build();

let server: Server<undefined> | undefined;
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

		app.group('/api/v1', (r) => {
			r.get('/public', async () => new Response(JSON.stringify({ data: 'v1 public' })));
			r.post('/echo', async ({ request }) => {
				const body = await request.json();
				return new Response(JSON.stringify({ echo: body }));
			});
		});

		app.group(
			'/api/v2',
			(r) => {
				r.get('/data', async () => new Response(JSON.stringify({ version: 2 })));
				r.put('/update', async () => new Response(JSON.stringify({ updated: true })));
			},
			{ middleware: [corsMiddleware] },
		);

		app.group(
			'/api/protected',
			(r) => {
				r.get('/secret', async () => new Response(JSON.stringify({ secret: 'data' })));
				r.post('/admin', async () => new Response(JSON.stringify({ admin: true })));
			},
			{ middleware: [apiKeyMiddleware] },
		);

		app.group(
			'/api/combined',
			(r) => {
				r.get('/secure', async () => new Response(JSON.stringify({ secure: true })));
			},
			{ middleware: [corsMiddleware, apiKeyMiddleware] },
		);

		const result = await app.start();
		if (result) server = result;
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

		app.group('/api', (r) => {
			r.get('/first', async () => new Response('first'));
		});

		app.group('/api', (r) => {
			r.get('/second', async () => new Response('second'));
		});

		const testServer = await app.start();

		const res1 = await fetch('http://localhost:3007/api/first');
		const res2 = await fetch('http://localhost:3007/api/second');

		expect(res1.status).toBe(200);
		expect(await res1.text()).toBe('first');
		expect(res2.status).toBe(200);
		expect(await res2.text()).toBe('second');

		testServer?.stop(true);
	});

	test('should support schema validation in route groups', async () => {
		const createSchema = <T>(
			validator: (value: unknown) => { valid: boolean; data?: T; errors?: string[] },
		): StandardSchema<unknown, T> => ({
			'~standard': {
				version: 1,
				vendor: 'test',
				validate: (value: unknown) => {
					const result = validator(value);
					if (result.valid) {
						return { value: result.data };
					}
					return {
						issues: result.errors?.map((message) => ({ message })) || [{ message: 'Validation failed' }],
					};
				},
			},
		});

		const bodySchema = createSchema<{ name: string }>((value) => {
			if (typeof value !== 'object' || value === null) {
				return { valid: false, errors: ['Expected object'] };
			}
			const obj = value as Record<string, unknown>;
			if (typeof obj.name !== 'string' || obj.name.length < 2) {
				return { valid: false, errors: ['name must be at least 2 characters'] };
			}
			return { valid: true, data: { name: obj.name } };
		});

		const app = new EcopagesApp({
			appConfig,
			serverOptions: {
				port: 3008,
				hostname: 'localhost',
			},
		});

		app.group('/api/validated', (r) => {
			r.post(
				'/user',
				async (ctx) => {
					const { name } = ctx.validated!.body as { name: string };
					return new Response(JSON.stringify({ created: name }));
				},
				{
					schema: { body: bodySchema },
				},
			);
		});

		const testServer = await app.start();

		const validRes = await fetch('http://localhost:3008/api/validated/user', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'John' }),
		});
		expect(validRes.status).toBe(200);
		expect(await validRes.json()).toEqual({ created: 'John' });

		const invalidRes = await fetch('http://localhost:3008/api/validated/user', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'J' }),
		});
		expect(invalidRes.status).toBe(400);

		testServer?.stop(true);
	});

	test('should support per-route middleware within groups', async () => {
		const extraMiddleware: Middleware = async (_, next) => {
			const response = await next();
			response.headers.set('X-Extra', 'applied');
			return response;
		};

		const app = new EcopagesApp({
			appConfig,
			serverOptions: {
				port: 3009,
				hostname: 'localhost',
			},
		});

		app.group(
			'/api/mixed',
			(r) => {
				r.get('/base', async () => new Response('base'));
				r.get('/extra', async () => new Response('extra'), { middleware: [extraMiddleware] });
			},
			{ middleware: [corsMiddleware] },
		);

		const testServer = await app.start();

		const baseRes = await fetch('http://localhost:3009/api/mixed/base');
		expect(baseRes.status).toBe(200);
		expect(baseRes.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(baseRes.headers.get('X-Extra')).toBeNull();

		const extraRes = await fetch('http://localhost:3009/api/mixed/extra');
		expect(extraRes.status).toBe(200);
		expect(extraRes.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(extraRes.headers.get('X-Extra')).toBe('applied');

		testServer?.stop(true);
	});
});
