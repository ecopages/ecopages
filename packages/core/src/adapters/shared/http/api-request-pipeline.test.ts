import type { IncomingMessage } from 'node:http';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ApiHandler, RenderContext } from '../../../types/public-types.ts';
import { appLogger } from '../../../global/app-logger.ts';
import { NodeClientAbortError, NodeHttpRequestBridge } from '../../node/http-request-bridge.ts';
import { ApiRequestPipeline } from './api-request-pipeline.ts';

class ClientAbort extends Error {}

class NodeRequestFixture extends PassThrough {
	public url = '/api/posts';
	public method = 'POST';
	public headers: Record<string, string> = {};
}

function createPipeline() {
	return new ApiRequestPipeline({
		getRenderContext: () =>
			({
				render: vi.fn(),
			}) as unknown as RenderContext,
		getCacheService: () => null,
		isClientAbort: (error) => error instanceof ClientAbort || error instanceof NodeClientAbortError,
	});
}

function createEmptyNodeRequest(headers: Record<string, string>): Request {
	const incomingRequest = new NodeRequestFixture();
	incomingRequest.headers = headers;
	const request = new NodeHttpRequestBridge().createWebRequest(
		incomingRequest as unknown as IncomingMessage,
		'http://localhost',
	);
	incomingRequest.end();
	return request;
}

function throwingHandler(error: unknown): ApiHandler[] {
	return [
		{
			path: '/api/fail',
			method: 'POST',
			handler: () => {
				throw error;
			},
		},
	];
}

describe('ApiRequestPipeline', () => {
	it('returns null from tryHandle when no route matches', async () => {
		const pipeline = createPipeline();
		const response = await pipeline.tryHandle(new Request('http://localhost/api/missing'), [], undefined);
		expect(response).toBeNull();
	});

	it('returns null when method does not match', async () => {
		const pipeline = createPipeline();
		const handlers: ApiHandler[] = [
			{
				path: '/api/posts',
				method: 'POST',
				handler: () => new Response('created'),
			},
		];

		const response = await pipeline.tryHandle(
			new Request('http://localhost/api/posts', { method: 'GET' }),
			handlers,
			undefined,
		);
		expect(response).toBeNull();
	});

	it('matches path params and executes the handler', async () => {
		const pipeline = createPipeline();
		const handlers: ApiHandler[] = [
			{
				path: '/api/posts/[id]',
				method: 'GET',
				handler: ({ params }) => new Response(`id:${params.id}`),
			},
		];

		const response = await pipeline.tryHandle(
			new Request('http://localhost/api/posts/42', { method: 'GET' }),
			handlers,
			undefined,
		);

		expect(response).not.toBeNull();
		expect(response!.status).toBe(200);
		expect(await response!.text()).toBe('id:42');
	});

	it('selects the more specific literal route when dynamic and literal routes overlap', async () => {
		const response = await createPipeline().tryHandle(
			new Request('http://localhost/api/posts/latest'),
			[
				{ path: '/api/posts/[id]', method: 'GET', handler: () => new Response('dynamic') },
				{ path: '/api/posts/latest', method: 'GET', handler: () => new Response('literal') },
			],
			undefined,
		);

		expect(response?.status).toBe(200);
		expect(await response?.text()).toBe('literal');
	});

	it('decodes path params before the API handler receives them', async () => {
		const pipeline = createPipeline();
		const handlers: ApiHandler[] = [
			{
				path: '/api/posts/[slug]',
				method: 'GET',
				handler: ({ params }) => new Response(params.slug),
			},
		];

		const response = await pipeline.tryHandle(
			new Request('http://localhost/api/posts/caf%C3%A9'),
			handlers,
			undefined,
		);

		expect(response?.status).toBe(200);
		expect(await response?.text()).toBe('café');
	});

	it('matches repeated trailing slashes after normalizing the pathname', async () => {
		const response = await createPipeline().tryHandle(
			new Request('http://localhost/api/posts//'),
			[
				{
					path: '/api/posts',
					method: 'GET',
					handler: () => new Response('matched'),
				},
			],
			undefined,
		);

		expect(response?.status).toBe(200);
		expect(await response?.text()).toBe('matched');
	});

	it('answers malformed path escapes with HTTP 400', async () => {
		const response = await createPipeline().tryHandle(
			new Request('http://localhost/api/posts/%E0%A4%A'),
			[
				{
					path: '/api/posts/[slug]',
					method: 'GET',
					handler: () => new Response('unreachable'),
				},
			],
			undefined,
		);

		expect(response?.status).toBe(400);
	});

	it.each([
		{ scenario: 'no registered handlers', handlers: [] as ApiHandler[] },
		{
			scenario: 'only method-mismatched handlers',
			handlers: [
				{ path: '/api/posts/[slug]', method: 'POST' as const, handler: () => new Response('unreachable') },
			],
		},
	])('answers malformed paths with HTTP 400 for $scenario', async ({ handlers }) => {
		const response = await createPipeline().tryHandle(
			new Request('http://localhost/api/posts/%E0%A4%A'),
			handlers,
			undefined,
		);

		expect(response?.status).toBe(400);
	});

	it('returns a validation error response when schema fails', async () => {
		const pipeline = createPipeline();
		const handlers: ApiHandler[] = [
			{
				path: '/api/posts',
				method: 'POST',
				schema: {
					body: z.object({ title: z.string().min(1) }),
				},
				handler: () => new Response('ok'),
			},
		];

		const response = await pipeline.tryHandle(
			new Request('http://localhost/api/posts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: '' }),
			}),
			handlers,
			undefined,
		);

		expect(response).not.toBeNull();
		expect(response!.status).toBe(400);
		const payload = (await response!.json()) as { error: string };
		expect(payload.error).toBe('Validation failed');
	});

	it('rejects a missing body when the body schema requires one', async () => {
		const response = await createPipeline().tryHandle(
			new Request('http://localhost/api/posts', { method: 'POST' }),
			[
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }) },
					handler: () => new Response('unreachable'),
				},
			],
			undefined,
		);

		expect(response?.status).toBe(400);
		expect(await response?.json()).toMatchObject({ error: 'Validation failed' });
	});

	it('accepts a missing body when the body schema is optional', async () => {
		const response = await createPipeline().tryHandle(
			new Request('http://localhost/api/posts', { method: 'POST' }),
			[
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }).optional() },
					handler: ({ body }) => new Response(body === undefined ? 'no body' : 'body'),
				},
			],
			undefined,
		);

		expect(response?.status).toBe(200);
		expect(await response?.text()).toBe('no body');
	});

	it('accepts a bodyless Node request with JSON content type when the schema is optional', async () => {
		const response = await createPipeline().tryHandle(
			createEmptyNodeRequest({ 'content-type': 'application/json' }),
			[
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }).optional() },
					handler: ({ body }) => new Response(body === undefined ? 'no body' : 'body'),
				},
			],
			undefined,
		);

		expect(response?.status).toBe(200);
		expect(await response?.text()).toBe('no body');
	});

	it('validates an empty Node request without content type as a missing body', async () => {
		const response = await createPipeline().tryHandle(
			createEmptyNodeRequest({}),
			[
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }) },
					handler: () => new Response('unreachable'),
				},
			],
			undefined,
		);

		expect(response?.status).toBe(400);
		expect(await response?.json()).toMatchObject({ error: 'Validation failed' });
	});

	it('validates an empty chunked Node request without content type as a missing body', async () => {
		const response = await createPipeline().tryHandle(
			createEmptyNodeRequest({ 'transfer-encoding': 'chunked' }),
			[
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }) },
					handler: () => new Response('unreachable'),
				},
			],
			undefined,
		);

		expect(response?.status).toBe(400);
		expect(await response?.json()).toMatchObject({ error: 'Validation failed' });
	});

	it('keeps an empty chunked Node request readable for an optional body schema', async () => {
		const incomingRequest = new NodeRequestFixture();
		incomingRequest.headers = { 'transfer-encoding': 'chunked' };
		const request = new NodeHttpRequestBridge().createWebRequest(
			incomingRequest as unknown as IncomingMessage,
			'http://localhost',
		);
		incomingRequest.end();

		const response = await createPipeline().tryHandle(
			request,
			[
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }).optional() },
					handler: async ({ body, request: handlerRequest }) =>
						new Response(`${body === undefined ? 'no body' : 'body'}:${await handlerRequest.text()}`),
				},
			],
			undefined,
		);

		expect(response?.status).toBe(200);
		expect(await response?.text()).toBe('no body:');
	});

	it('rejects a nonempty chunked Node request without content type before upload ends', async () => {
		const incomingRequest = new NodeRequestFixture();
		incomingRequest.headers = { 'transfer-encoding': 'chunked' };
		const request = new NodeHttpRequestBridge().createWebRequest(
			incomingRequest as unknown as IncomingMessage,
			'http://localhost',
		);
		const responsePromise = createPipeline().tryHandle(
			request,
			[
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }) },
					handler: () => new Response('unreachable'),
				},
			],
			undefined,
		);

		incomingRequest.write('payload');
		const response = await responsePromise;

		expect(response?.status).toBe(415);
		expect(incomingRequest.destroyed).toBe(false);
		expect(incomingRequest.listenerCount('data')).toBe(0);
		incomingRequest.end('remaining');
	});

	it('answers a client abort during body validation with HTTP 499', async () => {
		const incomingRequest = new NodeRequestFixture();
		incomingRequest.headers = { 'transfer-encoding': 'chunked' };
		const request = new NodeHttpRequestBridge().createWebRequest(
			incomingRequest as unknown as IncomingMessage,
			'http://localhost',
		);
		const responsePromise = createPipeline().tryHandle(
			request,
			[
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }) },
					handler: () => new Response('unreachable'),
				},
			],
			undefined,
		);

		incomingRequest.emit('aborted');

		const response = await responsePromise;
		expect(response?.status).toBe(499);
	});

	it('answers unsupported content types with HTTP 415 when a body schema is declared', async () => {
		const response = await createPipeline().tryHandle(
			new Request('http://localhost/api/posts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: 'title=post',
			}),
			[
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }) },
					handler: () => new Response('unreachable'),
				},
			],
			undefined,
		);

		expect(response?.status).toBe(415);
	});

	it('drains a streamed Node request with an unsupported content type', async () => {
		const incomingRequest = new NodeRequestFixture();
		incomingRequest.headers = {
			'content-type': 'application/octet-stream',
			'transfer-encoding': 'chunked',
		};
		const request = new NodeHttpRequestBridge().createWebRequest(
			incomingRequest as unknown as IncomingMessage,
			'http://localhost',
		);
		const responsePromise = createPipeline().tryHandle(
			request,
			[
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }) },
					handler: () => new Response('unreachable'),
				},
			],
			undefined,
		);

		incomingRequest.write('payload');
		const response = await responsePromise;

		expect(response?.status).toBe(415);
		expect(incomingRequest.destroyed).toBe(false);
		expect(incomingRequest.listenerCount('data')).toBe(0);
		incomingRequest.end('remaining');
	});

	it('answers HTTP 415 when a request body has no content type', async () => {
		const response = await createPipeline().tryHandle(
			new Request('http://localhost/api/posts', {
				method: 'POST',
				body: new Uint8Array([1]),
			}),
			[
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }) },
					handler: () => new Response('unreachable'),
				},
			],
			undefined,
		);

		expect(response?.status).toBe(415);
	});

	it('runs middleware before the handler', async () => {
		const pipeline = createPipeline();
		const order: string[] = [];
		const handlers: ApiHandler[] = [
			{
				path: '/api/secure',
				method: 'GET',
				middleware: [
					async (_ctx, next) => {
						order.push('middleware');
						return next();
					},
				],
				handler: async () => {
					order.push('handler');
					return new Response('done');
				},
			},
		];

		const response = await pipeline.tryHandle(
			new Request('http://localhost/api/secure', { method: 'GET' }),
			handlers,
			undefined,
		);

		expect(await response!.text()).toBe('done');
		expect(order).toEqual(['middleware', 'handler']);
	});

	it('answers client aborts with 499 without logging or calling onError', async () => {
		const errorHandler = vi.fn(async () => new Response('handled', { status: 418 }));
		const loggerSpy = vi.spyOn(appLogger, 'error').mockImplementation(() => appLogger);

		const response = await createPipeline().tryHandle(
			new Request('http://localhost/api/fail', { method: 'POST' }),
			throwingHandler(new ClientAbort()),
			undefined,
			errorHandler,
		);

		expect(response?.status).toBe(499);
		expect(errorHandler).not.toHaveBeenCalled();
		expect(loggerSpy).not.toHaveBeenCalled();
		loggerSpy.mockRestore();
	});

	it('logs unhandled errors with the Error object so the stack is kept', async () => {
		const error = new Error('boom');
		const loggerSpy = vi.spyOn(appLogger, 'error').mockImplementation(() => appLogger);

		const response = await createPipeline().tryHandle(
			new Request('http://localhost/api/fail', { method: 'POST' }),
			throwingHandler(error),
			undefined,
		);

		expect(response?.status).toBe(500);
		expect(loggerSpy).toHaveBeenCalledWith('[ecopages] Error handling request', error);
		loggerSpy.mockRestore();
	});
});
