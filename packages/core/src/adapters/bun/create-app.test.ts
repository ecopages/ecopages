import { beforeEach, describe, expect, test } from 'bun:test';
import { EcopagesApp } from './create-app';

describe('EcopagesApp', () => {
	let app: EcopagesApp;

	beforeEach(() => {
		app = new EcopagesApp({
			appConfig: {} as any,
		});
	});

	describe('HTTP Method Handlers', () => {
		const testPath = '/test';
		const testHandler = async () => {
			return new Response('OK');
		};

		test('get() adds GET route handler', () => {
			app.get(testPath, testHandler);
			const apiHandlers = app.getApiHandlers();
			expect(apiHandlers).toHaveLength(1);
			expect(apiHandlers[0].method).toBe('GET');
		});

		test('post() adds POST route handler', () => {
			app.post(testPath, testHandler);
			const apiHandlers = app.getApiHandlers();
			expect(apiHandlers).toHaveLength(1);
			expect(apiHandlers[0].method).toBe('POST');
		});

		test('put() adds PUT route handler', () => {
			app.put(testPath, testHandler);
			const apiHandlers = app.getApiHandlers();
			expect(apiHandlers).toHaveLength(1);
			expect(apiHandlers[0].method).toBe('PUT');
		});

		test('delete() adds DELETE route handler', () => {
			app.delete(testPath, testHandler);
			const apiHandlers = app.getApiHandlers();
			expect(apiHandlers).toHaveLength(1);
			expect(apiHandlers[0].method).toBe('DELETE');
		});

		test('patch() adds PATCH route handler', () => {
			app.patch(testPath, testHandler);
			const apiHandlers = app.getApiHandlers();
			expect(apiHandlers).toHaveLength(1);
			expect(apiHandlers[0].method).toBe('PATCH');
		});

		test('options() adds OPTIONS route handler', () => {
			app.options(testPath, testHandler);
			const apiHandlers = app.getApiHandlers();
			expect(apiHandlers).toHaveLength(1);
			expect(apiHandlers[0].method).toBe('OPTIONS');
		});

		test('head() adds HEAD route handler', () => {
			app.head(testPath, testHandler);
			const apiHandlers = app.getApiHandlers();
			expect(apiHandlers).toHaveLength(1);
			expect(apiHandlers[0].method).toBe('HEAD');
		});

		test('route() adds route with specified method', () => {
			app.route('/custom', 'GET', testHandler);
			const apiHandlers = app.getApiHandlers();
			expect(apiHandlers).toHaveLength(1);
			expect(apiHandlers[0].path).toBe('/custom');
			expect(apiHandlers[0].method).toBe('GET');
		});
	});

	describe('request()', () => {
		test('should throw error when server not started', async () => {
			expect(app.request('/test')).rejects.toThrow('Server not started');
		});
	});

	describe('completeInitialization()', () => {
		test('should throw error when server adapter not initialized', async () => {
			expect(app.completeInitialization({} as any)).rejects.toThrow('Server adapter not initialized');
		});
	});
});
