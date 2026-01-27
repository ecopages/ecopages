import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { FIXTURE_APP_PROJECT_DIR } from '../../../__fixtures__/constants.js';
import { ConfigBuilder } from '../../config/config-builder.ts';
import type { Middleware, StandardSchema } from '../../public-types.ts';
import { EcopagesApp, type BunMiddleware } from './create-app.ts';
import { defineApiHandler, defineGroupHandler } from './define-api-handler.ts';

const appConfig = await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).build();

const TEST_PORT = 3020;

type AuthContext = { session: { userId: string; role: string } };

const authMiddleware: BunMiddleware<AuthContext> = async (ctx, next) => {
	const token = ctx.request.headers.get('Authorization');
	if (!token || token !== 'Bearer valid-token') {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}
	ctx.session = { userId: 'user-123', role: 'admin' };
	return next();
};

const loggingMiddleware: Middleware = async (context, next) => {
	const response = await next();
	response.headers.set('X-Logged', 'true');
	return response;
};

describe('defineApiHandler', () => {
	let server: Server<undefined> | undefined;

	const listHandler = defineApiHandler({
		path: '/api/posts',
		method: 'GET',
		handler: async ({ response }) => {
			return response.json({ posts: [{ id: 1, title: 'First' }] });
		},
	});

	const detailHandler = defineApiHandler({
		path: '/api/posts/:id',
		method: 'GET',
		handler: async ({ request, response }) => {
			const { id } = request.params;
			return response.json({ post: { id, title: `Post ${id}` } });
		},
	});

	const nestedParamsHandler = defineApiHandler({
		path: '/api/users/:userId/posts/:postId',
		method: 'GET',
		handler: async ({ request, response }) => {
			const { userId, postId } = request.params;
			return response.json({ userId, postId });
		},
	});

	const handlerWithMiddleware = defineApiHandler({
		path: '/api/protected',
		method: 'GET',
		middleware: [loggingMiddleware],
		handler: async ({ response }) => {
			return response.json({ protected: true });
		},
	});

	beforeAll(async () => {
		const app = new EcopagesApp({
			appConfig,
			serverOptions: {
				port: TEST_PORT,
				hostname: 'localhost',
			},
		});

		app.get(listHandler);
		app.get(detailHandler);
		app.get(nestedParamsHandler);
		app.get(handlerWithMiddleware);

		const result = await app.start();
		if (result) server = result;
	});

	afterAll(() => {
		if (server) {
			server.stop(true);
		}
	});

	test('should register handler and handle requests', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/posts`);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ posts: [{ id: 1, title: 'First' }] });
	});

	test('should infer path params from path literal', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/posts/42`);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ post: { id: '42', title: 'Post 42' } });
	});

	test('should handle multiple path params', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/users/user-1/posts/post-5`);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ userId: 'user-1', postId: 'post-5' });
	});

	test('should apply route middleware', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/protected`);

		expect(res.status).toBe(200);
		expect(res.headers.get('X-Logged')).toBe('true');
		expect(await res.json()).toEqual({ protected: true });
	});

	test('should return correct handler shape', () => {
		expect(listHandler.path).toBe('/api/posts');
		expect(listHandler.method).toBe('GET');
		expect(typeof listHandler.handler).toBe('function');
	});
});

describe('defineGroupHandler', () => {
	let server: Server<undefined> | undefined;

	const adminGroup = defineGroupHandler({
		prefix: '/admin',
		middleware: [authMiddleware],
		routes: (define) => [
			define({
				path: '/',
				method: 'GET',
				handler: async (ctx) => {
					return ctx.response.json({
						message: 'Admin dashboard',
						userId: ctx.session.userId,
					});
				},
			}),
			define({
				path: '/posts/:id',
				method: 'GET',
				handler: async (ctx) => {
					return ctx.response.json({
						postId: ctx.request.params.id,
						role: ctx.session.role,
					});
				},
			}),
			define({
				path: '/posts/:id',
				method: 'DELETE',
				handler: async (ctx) => {
					return ctx.response.status(204).text('');
				},
			}),
		],
	});

	const publicGroup = defineGroupHandler({
		prefix: '/public',
		routes: (define) => [
			define({
				path: '/info',
				method: 'GET',
				handler: async (ctx) => {
					return ctx.response.json({ info: 'public' });
				},
			}),
		],
	});

	beforeAll(async () => {
		const app = new EcopagesApp({
			appConfig,
			serverOptions: {
				port: TEST_PORT + 1,
				hostname: 'localhost',
			},
		});

		app.group(adminGroup);
		app.group(publicGroup);

		const result = await app.start();
		if (result) server = result;
	});

	afterAll(() => {
		if (server) {
			server.stop(true);
		}
	});

	test('should register group with prefix', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT + 1}/admin`, {
			headers: { Authorization: 'Bearer valid-token' },
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.message).toBe('Admin dashboard');
		expect(data.userId).toBe('user-123');
	});

	test('should apply group middleware to all routes', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT + 1}/admin`);

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: 'Unauthorized' });
	});

	test('should infer middleware context in handlers', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT + 1}/admin/posts/99`, {
			headers: { Authorization: 'Bearer valid-token' },
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ postId: '99', role: 'admin' });
	});

	test('should handle different methods on same path', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT + 1}/admin/posts/99`, {
			method: 'DELETE',
			headers: { Authorization: 'Bearer valid-token' },
		});

		expect(res.status).toBe(204);
	});

	test('should work without middleware', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT + 1}/public/info`);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ info: 'public' });
	});

	test('should return correct group shape', () => {
		expect(adminGroup.prefix).toBe('/admin');
		expect(adminGroup.middleware).toHaveLength(1);
		expect(adminGroup.routes).toHaveLength(3);
	});
});

describe('defineGroupHandler with schema', () => {
	let server: Server<undefined> | undefined;

	const createSchema = <T>(
		validator: (value: unknown) => { valid: boolean; data?: T; errors?: string[] },
	): StandardSchema<unknown, T> => ({
		'~standard': {
			version: 1,
			vendor: 'test',
			validate: (value: unknown) => {
				const result = validator(value);
				if (result.valid && result.data !== undefined) {
					return { value: result.data };
				}
				return { issues: (result.errors || ['Validation failed']).map((e) => ({ message: e })) };
			},
		},
	});

	const postBodySchema = createSchema<{ title: string; content: string }>((value) => {
		if (typeof value !== 'object' || value === null) {
			return { valid: false, errors: ['Must be an object'] };
		}
		const obj = value as Record<string, unknown>;
		if (typeof obj.title !== 'string' || typeof obj.content !== 'string') {
			return { valid: false, errors: ['title and content are required strings'] };
		}
		return { valid: true, data: { title: obj.title, content: obj.content } };
	});

	const apiGroup = defineGroupHandler({
		prefix: '/api',
		routes: (define) => [
			define({
				path: '/posts',
				method: 'POST',
				schema: { body: postBodySchema },
				handler: async (ctx) => {
					return ctx.response.status(201).json({
						created: ctx.body,
					});
				},
			}),
		],
	});

	beforeAll(async () => {
		const app = new EcopagesApp({
			appConfig,
			serverOptions: {
				port: TEST_PORT + 2,
				hostname: 'localhost',
			},
		});

		app.group(apiGroup);

		const result = await app.start();
		if (result) server = result;
	});

	afterAll(() => {
		if (server) {
			server.stop(true);
		}
	});

	test('should validate and parse request body with schema', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT + 2}/api/posts`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ title: 'Hello', content: 'World' }),
		});

		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({
			created: { title: 'Hello', content: 'World' },
		});
	});

	test('should reject invalid body', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT + 2}/api/posts`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ invalid: 'data' }),
		});

		expect(res.status).toBe(400);
	});
});

describe('HTTP method overloads with handler objects', () => {
	let server: Server<undefined> | undefined;

	const getHandler = defineApiHandler({
		path: '/test/get',
		method: 'GET',
		handler: async ({ response }) => response.json({ method: 'GET' }),
	});

	const postHandler = defineApiHandler({
		path: '/test/post',
		method: 'POST',
		handler: async ({ response }) => response.json({ method: 'POST' }),
	});

	const putHandler = defineApiHandler({
		path: '/test/put',
		method: 'PUT',
		handler: async ({ response }) => response.json({ method: 'PUT' }),
	});

	const deleteHandler = defineApiHandler({
		path: '/test/delete',
		method: 'DELETE',
		handler: async ({ response }) => response.json({ method: 'DELETE' }),
	});

	const patchHandler = defineApiHandler({
		path: '/test/patch',
		method: 'PATCH',
		handler: async ({ response }) => response.json({ method: 'PATCH' }),
	});

	beforeAll(async () => {
		const app = new EcopagesApp({
			appConfig,
			serverOptions: {
				port: TEST_PORT + 3,
				hostname: 'localhost',
			},
		});

		app.get(getHandler);
		app.post(postHandler);
		app.put(putHandler);
		app.delete(deleteHandler);
		app.patch(patchHandler);

		const result = await app.start();
		if (result) server = result;
	});

	afterAll(() => {
		if (server) {
			server.stop(true);
		}
	});

	test('app.get() accepts handler object', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT + 3}/test/get`);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ method: 'GET' });
	});

	test('app.post() accepts handler object', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT + 3}/test/post`, { method: 'POST' });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ method: 'POST' });
	});

	test('app.put() accepts handler object', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT + 3}/test/put`, { method: 'PUT' });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ method: 'PUT' });
	});

	test('app.delete() accepts handler object', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT + 3}/test/delete`, { method: 'DELETE' });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ method: 'DELETE' });
	});

	test('app.patch() accepts handler object', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT + 3}/test/patch`, { method: 'PATCH' });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ method: 'PATCH' });
	});
});
