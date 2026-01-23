import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { FIXTURE_APP_PROJECT_DIR } from '../../../__fixtures__/constants.js';
import { ConfigBuilder } from '../../config/config-builder.ts';
import type { StandardSchema } from '../../public-types.ts';
import { defineApiHandler } from './define-api-handler.ts';
import { createBunServerAdapter } from './server-adapter.ts';

const appConfig = await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).build();

const TEST_PORT = 3200;

const createSimpleSchema = <T>(
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
			return {
				issues: result.errors?.map((message) => ({ message })) || [{ message: 'Validation failed' }],
			};
		},
	},
});

describe('Schema Validation', () => {
	let server: Server<unknown>;

	beforeAll(async () => {
		const bodySchema = createSimpleSchema<{ name: string; age: number }>((value) => {
			if (typeof value !== 'object' || value === null) {
				return { valid: false, errors: ['Expected an object'] };
			}
			const obj = value as Record<string, unknown>;
			if (typeof obj.name !== 'string') {
				return { valid: false, errors: ['name must be a string'] };
			}
			if (typeof obj.age !== 'number') {
				return { valid: false, errors: ['age must be a number'] };
			}
			return { valid: true, data: { name: obj.name, age: obj.age } };
		});

		const querySchema = createSimpleSchema<{ page: string }>((value) => {
			if (typeof value !== 'object' || value === null) {
				return { valid: false, errors: ['Expected an object'] };
			}
			const obj = value as Record<string, unknown>;
			if (typeof obj.page !== 'string') {
				return { valid: false, errors: ['page must be a string'] };
			}
			return { valid: true, data: { page: obj.page } };
		});

		const headerSchema = createSimpleSchema<{ 'x-api-key': string }>((value) => {
			if (typeof value !== 'object' || value === null) {
				return { valid: false, errors: ['Expected an object'] };
			}
			const obj = value as Record<string, unknown>;
			if (typeof obj['x-api-key'] !== 'string') {
				return { valid: false, errors: ['x-api-key header is required'] };
			}
			return { valid: true, data: { 'x-api-key': obj['x-api-key'] } };
		});

		const adapter = await createBunServerAdapter({
			appConfig,
			runtimeOrigin: appConfig.baseUrl,
			serveOptions: { port: TEST_PORT, hostname: 'localhost' },
			options: { watch: false },
			apiHandlers: [
				defineApiHandler({
					path: '/api/validate-body',
					method: 'POST',
					schema: { body: bodySchema },
					handler: async ({ body }) => {
						return new Response(JSON.stringify({ validated: body }), {
							headers: { 'Content-Type': 'application/json' },
						});
					},
				}),
				defineApiHandler({
					path: '/api/validate-query',
					method: 'GET',
					schema: { query: querySchema },
					handler: async ({ query }) => {
						return new Response(JSON.stringify({ validated: query }), {
							headers: { 'Content-Type': 'application/json' },
						});
					},
				}),
				defineApiHandler({
					path: '/api/validate-headers',
					method: 'GET',
					schema: { headers: headerSchema },
					handler: async ({ headers }) => {
						return new Response(JSON.stringify({ validated: headers }), {
							headers: { 'Content-Type': 'application/json' },
						});
					},
				}),
				defineApiHandler({
					path: '/api/validate-all',
					method: 'POST',
					schema: {
						body: bodySchema,
						query: querySchema,
						headers: headerSchema,
					},
					handler: async ({ body, query, headers }) => {
						return new Response(JSON.stringify({ validated: { body, query, headers } }), {
							headers: { 'Content-Type': 'application/json' },
						});
					},
				}),
				defineApiHandler({
					path: '/api/no-validation',
					method: 'POST',
					handler: async () => {
						return new Response(JSON.stringify({ message: 'no validation' }), {
							headers: { 'Content-Type': 'application/json' },
						});
					},
				}),
			],
		});

		server = Bun.serve(adapter.getServerOptions() as Bun.Serve.Options<unknown>);
		await adapter.completeInitialization(server);
	});

	afterAll(() => {
		server.stop(true);
	});

	test('should validate request body successfully', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/validate-body`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'John', age: 30 }),
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.validated).toEqual({ name: 'John', age: 30 });
	});

	test('should reject invalid request body', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/validate-body`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'John', age: 'thirty' }),
		});

		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.error).toBe('Validation failed');
		expect(data.issues).toBeDefined();
	});

	test('should reject malformed JSON body', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/validate-body`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: 'not json',
		});

		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.error).toBe('Invalid JSON body');
	});

	test('should validate query parameters successfully', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/validate-query?page=1`);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.validated).toEqual({ page: '1' });
	});

	test('should reject invalid query parameters', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/validate-query`);

		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.error).toBe('Validation failed');
	});

	test('should validate headers successfully', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/validate-headers`, {
			headers: { 'x-api-key': 'secret' },
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.validated).toEqual({ 'x-api-key': 'secret' });
	});

	test('should reject invalid headers', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/validate-headers`);

		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.error).toBe('Validation failed');
	});

	test('should validate all sources together', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/validate-all?page=2`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': 'secret',
			},
			body: JSON.stringify({ name: 'Jane', age: 25 }),
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.validated.body).toEqual({ name: 'Jane', age: 25 });
		expect(data.validated.query).toEqual({ page: '2' });
		expect(data.validated.headers).toEqual({ 'x-api-key': 'secret' });
	});

	test('should work without validation schema', async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/api/no-validation`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ anything: 'goes' }),
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.message).toBe('no validation');
	});
});
