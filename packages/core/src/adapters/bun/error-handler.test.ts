import { describe, expect, test } from 'bun:test';
import { FIXTURE_APP_PROJECT_DIR } from '../../../__fixtures__/constants.js';
import { ConfigBuilder } from '../../config/config-builder.ts';
import { HttpError } from '../../errors/http-error.ts';
import { defineApiHandler } from './define-api-handler.ts';
import { createBunServerAdapter } from './server-adapter.ts';

const appConfig = await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).build();

const TEST_PORT_BASE = 3100;

describe('Global Error Handler', () => {
	// Tests will create their own adapters to configure error handler differently

	test('should use default handling when no error handler is provided', async () => {
		const adapter = await createBunServerAdapter({
			appConfig,
			runtimeOrigin: appConfig.baseUrl,
			serveOptions: { port: TEST_PORT_BASE + 1, hostname: 'localhost' },
			options: { watch: false },
			apiHandlers: [
				defineApiHandler({
					path: '/api/error',
					method: 'GET',
					handler: async () => {
						throw new Error('Default error');
					},
				}),
				defineApiHandler({
					path: '/api/http-error',
					method: 'GET',
					handler: async () => {
						throw new HttpError(400, 'Bad Request');
					},
				}),
			],
		});

		const testServer = Bun.serve(adapter.getServerOptions() as Bun.Serve.Options<unknown>);
		await adapter.completeInitialization(testServer);

		const res1 = await fetch(`http://localhost:${TEST_PORT_BASE + 1}/api/error`);
		expect(res1.status).toBe(500);
		expect(await res1.text()).toBe('Internal Server Error');

		const res2 = await fetch(`http://localhost:${TEST_PORT_BASE + 1}/api/http-error`);
		expect(res2.status).toBe(400);
		const json = await res2.json();
		expect(json).toEqual({ error: 'Bad Request', status: 400 });

		testServer.stop(true);
	});

	test('should catch standard Error with custom handler', async () => {
		const adapter = await createBunServerAdapter({
			appConfig,
			runtimeOrigin: appConfig.baseUrl,
			serveOptions: { port: TEST_PORT_BASE + 2, hostname: 'localhost' },
			options: { watch: false },
			apiHandlers: [
				defineApiHandler({
					path: '/api/error',
					method: 'GET',
					handler: async () => {
						throw new Error('Something went wrong');
					},
				}),
			],
			errorHandler: async (error, context) => {
				const message = error instanceof Error ? error.message : 'Unknown error';
				// Use builder method chaining strictly
				return context.response.status(503).json({ error: message });
			},
		});

		const testServer = Bun.serve(adapter.getServerOptions() as Bun.Serve.Options<unknown>);
		await adapter.completeInitialization(testServer);

		const res = await fetch(`http://localhost:${TEST_PORT_BASE + 2}/api/error`);
		expect(res.status).toBe(503);
		const body = await res.json();
		expect(body).toEqual({ error: 'Something went wrong' });

		testServer.stop(true);
	});

	test('should catch HttpError with custom handler', async () => {
		const adapter = await createBunServerAdapter({
			appConfig,
			runtimeOrigin: appConfig.baseUrl,
			serveOptions: { port: TEST_PORT_BASE + 3, hostname: 'localhost' },
			options: { watch: false },
			apiHandlers: [
				defineApiHandler({
					path: '/api/http-error',
					method: 'GET',
					handler: async () => {
						throw new HttpError(404, 'Resource not found');
					},
				}),
			],
			errorHandler: async (error, context) => {
				if (error instanceof HttpError) {
					return context.response.status(200).json({
						status: error.status,
						message: error.message,
					}); // masking 404 as 200 with error body
				}
				return new Response('Error', { status: 500 });
			},
		});

		const testServer = Bun.serve(adapter.getServerOptions() as Bun.Serve.Options<unknown>);
		await adapter.completeInitialization(testServer);

		const res = await fetch(`http://localhost:${TEST_PORT_BASE + 3}/api/http-error`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ status: 404, message: 'Resource not found' });

		testServer.stop(true);
	});

	test('should fallback to default if custom handler passes execution', async () => {
		// Not strictly possible with current implementation unless handler rethrows or returns null?
		// Current implementation expects handler to return Response.
		// If handler throws, it catches it and logs, then falls back.

		const adapter = await createBunServerAdapter({
			appConfig,
			runtimeOrigin: appConfig.baseUrl,
			serveOptions: { port: TEST_PORT_BASE + 4, hostname: 'localhost' },
			options: { watch: false },
			apiHandlers: [
				defineApiHandler({
					path: '/api/error',
					method: 'GET',
					handler: async () => {
						throw new Error('Oops');
					},
				}),
			],
			errorHandler: async () => {
				throw new Error('Handler failed');
			},
		});

		const testServer = Bun.serve(adapter.getServerOptions() as Bun.Serve.Options<unknown>);
		await adapter.completeInitialization(testServer);

		const res = await fetch(`http://localhost:${TEST_PORT_BASE + 4}/api/error`);
		expect(res.status).toBe(500);
		expect(await res.text()).toBe('Internal Server Error');

		testServer.stop(true);
	});
});
