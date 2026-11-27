import type { IncomingMessage } from 'node:http';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ApiHandler, RenderContext } from '../../../types/contracts.ts';
import { appLogger } from '../../../global/app-logger.ts';
import { NodeClientAbortError, NodeHttpRequestBridge } from '../../node/http-request-bridge.ts';
import { defineGet } from './define-api-handler.ts';
import { createMiddleware } from '../../../middleware/create-middleware.ts';
import { ApiRequestPipeline, compileApiRoutes } from './api-request-pipeline.ts';

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
		const response = await pipeline.tryHandle(
			new Request('http://localhost/api/missing'),
			compileApiRoutes([]),
			undefined,
		);
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
			compileApiRoutes(handlers),
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
			compileApiRoutes(handlers),
			undefined,
		);

		expect(response).not.toBeNull();
		expect(response!.status).toBe(200);
		expect(await response!.text()).toBe('id:42');
	});

	it('gives the handler the locals its middleware list provides, in order', async () => {
		const pipeline = createPipeline();
		const session = createMiddleware((_ctx, next) => next({ session: 'u1', theme: 'dark' }));
		const retheme = createMiddleware((_ctx, next) => next({ theme: 'blue' }));
		const handlers: ApiHandler[] = [
			defineGet({
				path: '/api/me',
				middleware: [session, retheme],
				handler: ({ locals }) => new Response(`${locals.session}:${locals.theme}`),
			}),
		];

		const response = await pipeline.tryHandle(
			new Request('http://localhost/api/me'),
			compileApiRoutes(handlers),
			undefined,
		);

		expect(await response!.text()).toBe('u1:blue');
	});

	it('rejects a route that lists the same middleware stage twice when the routes are compiled', () => {
		const session = createMiddleware((_ctx, next) => next({ session: 'u1' }));
		const handlers: ApiHandler[] = [
			defineGet({ path: '/api/me', middleware: [session, session], handler: () => new Response('x') }),
		];

		expect(() => compileApiRoutes(handlers)).toThrow(/route GET \/api\/me runs the same middleware stage twice/);
	});

	it('does not run the handler when a middleware guard answers', async () => {
		const pipeline = createPipeline();
		let handled = 0;
		const guard = createMiddleware(() => new Response('denied', { status: 403 }));
		const handlers: ApiHandler[] = [
			{
				path: '/api/secret',
				method: 'GET',
				middleware: [guard],
				handler: () => {
					handled += 1;
					return new Response('secret');
				},
			},
		];

		const response = await pipeline.tryHandle(
			new Request('http://localhost/api/secret'),
			compileApiRoutes(handlers),
			undefined,
		);

		expect(response!.status).toBe(403);
		expect(handled).toBe(0);
	});

	it('selects the more specific literal route when dynamic and literal routes overlap', async () => {
		const response = await createPipeline().tryHandle(
			new Request('http://localhost/api/posts/latest'),
			compileApiRoutes([
				{ path: '/api/posts/[id]', method: 'GET', handler: () => new Response('dynamic') },
				{ path: '/api/posts/latest', method: 'GET', handler: () => new Response('literal') },
			]),
			undefined,
		);

		expect(response?.status).toBe(200);
		expect(await response?.text()).toBe('literal');
	});

	it('runs a route with a suffixed param only for its suffix, before the bare param route', async () => {
		const handlers: ApiHandler[] = [
			{
				path: '/products/:handle',
				method: 'GET',
				handler: ({ params }) => new Response(`page:${params.handle}`),
			},
			{
				path: '/products/:handle.md',
				method: 'GET',
				handler: ({ params }) => new Response(`md:${params.handle}`),
			},
		];
		const routes = compileApiRoutes(handlers);
		const request = (pathname: string) =>
			createPipeline().tryHandle(new Request(`http://localhost${pathname}`), routes, undefined);

		expect(await (await request('/products/linen-shirt.md'))?.text()).toBe('md:linen-shirt');
		expect(await (await request('/products/linen-shirt'))?.text()).toBe('page:linen-shirt');
		expect(
			await createPipeline().tryHandle(
				new Request('http://localhost/products/linen-shirt'),
				compileApiRoutes([handlers[1]!]),
				undefined,
			),
		).toBeNull();
	});

	it('decodes path params before the API handler receives them', async () => {
		const pipeline = createPipeline();
		const handlers: ApiHandler[] = [
			{
				path: '/api/posts/[slug]',
				method: 'GET',
				handler: ({ params }) => new Response(String(params.slug)),
			},
		];

		const response = await pipeline.tryHandle(
			new Request('http://localhost/api/posts/caf%C3%A9'),
			compileApiRoutes(handlers),
			undefined,
		);

		expect(response?.status).toBe(200);
		expect(await response?.text()).toBe('café');
	});

	it('preserves catch-all params and repeated query keys for API handlers', async () => {
		const response = await createPipeline().tryHandle(
			new Request('http://localhost/api/files/a/b?tag=one&tag=two'),
			compileApiRoutes([
				{
					path: '/api/files/[...path]',
					method: 'GET',
					handler: ({ params, query }) => new Response(JSON.stringify({ params, query })),
				},
			]),
			undefined,
		);

		expect(response?.status).toBe(200);
		expect(await response?.json()).toEqual({
			params: { path: ['a', 'b'] },
			query: { tag: ['one', 'two'] },
		});
	});

	it('matches repeated trailing slashes after normalizing the pathname', async () => {
		const response = await createPipeline().tryHandle(
			new Request('http://localhost/api/posts//'),
			compileApiRoutes([
				{
					path: '/api/posts',
					method: 'GET',
					handler: () => new Response('matched'),
				},
			]),
			undefined,
		);

		expect(response?.status).toBe(200);
		expect(await response?.text()).toBe('matched');
	});

	it('answers malformed path escapes with HTTP 400', async () => {
		const response = await createPipeline().tryHandle(
			new Request('http://localhost/api/posts/%E0%A4%A'),
			compileApiRoutes([
				{
					path: '/api/posts/[slug]',
					method: 'GET',
					handler: () => new Response('unreachable'),
				},
			]),
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
			compileApiRoutes(handlers),
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
			compileApiRoutes(handlers),
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
			compileApiRoutes([
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }) },
					handler: () => new Response('unreachable'),
				},
			]),
			undefined,
		);

		expect(response?.status).toBe(400);
		expect(await response?.json()).toMatchObject({ error: 'Validation failed' });
	});

	it('accepts a missing body when the body schema is optional', async () => {
		const response = await createPipeline().tryHandle(
			new Request('http://localhost/api/posts', { method: 'POST' }),
			compileApiRoutes([
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }).optional() },
					handler: ({ body }) => new Response(body === undefined ? 'no body' : 'body'),
				},
			]),
			undefined,
		);

		expect(response?.status).toBe(200);
		expect(await response?.text()).toBe('no body');
	});

	it('accepts a bodyless Node request with JSON content type when the schema is optional', async () => {
		const response = await createPipeline().tryHandle(
			createEmptyNodeRequest({ 'content-type': 'application/json' }),
			compileApiRoutes([
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }).optional() },
					handler: ({ body }) => new Response(body === undefined ? 'no body' : 'body'),
				},
			]),
			undefined,
		);

		expect(response?.status).toBe(200);
		expect(await response?.text()).toBe('no body');
	});

	it('validates an empty Node request without content type as a missing body', async () => {
		const response = await createPipeline().tryHandle(
			createEmptyNodeRequest({}),
			compileApiRoutes([
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }) },
					handler: () => new Response('unreachable'),
				},
			]),
			undefined,
		);

		expect(response?.status).toBe(400);
		expect(await response?.json()).toMatchObject({ error: 'Validation failed' });
	});

	it('validates an empty chunked Node request without content type as a missing body', async () => {
		const response = await createPipeline().tryHandle(
			createEmptyNodeRequest({ 'transfer-encoding': 'chunked' }),
			compileApiRoutes([
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }) },
					handler: () => new Response('unreachable'),
				},
			]),
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
			compileApiRoutes([
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }).optional() },
					handler: async ({ body, request: handlerRequest }) =>
						new Response(`${body === undefined ? 'no body' : 'body'}:${await handlerRequest.text()}`),
				},
			]),
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
			compileApiRoutes([
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }) },
					handler: () => new Response('unreachable'),
				},
			]),
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
			compileApiRoutes([
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }) },
					handler: () => new Response('unreachable'),
				},
			]),
			undefined,
		);

		incomingRequest.emit('aborted');

		const response = await responsePromise;
		expect(response?.status).toBe(499);
	});

	describe('form bodies', () => {
		const cartSchema = z.object({ slug: z.string(), quantity: z.string().regex(/^\d+$/) });
		const cartRoutes = (handler: ApiHandler['handler'] = ({ body }) => Response.json(body)) =>
			compileApiRoutes([{ path: '/api/cart', method: 'POST', schema: { body: cartSchema }, handler }]);
		const post = (body: BodyInit, headers?: Record<string, string>) =>
			new Request('http://localhost/api/cart', { method: 'POST', headers, body });

		it('validates an urlencoded form post with the body schema', async () => {
			const response = await createPipeline().tryHandle(
				post('slug=chair&quantity=2', { 'Content-Type': 'application/x-www-form-urlencoded' }),
				cartRoutes(),
				undefined,
			);

			expect(response?.status).toBe(200);
			expect(await response?.json()).toEqual({ slug: 'chair', quantity: '2' });
		});

		it('answers HTTP 400 naming the field a form post leaves out', async () => {
			const response = await createPipeline().tryHandle(
				post('quantity=2', { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }),
				cartRoutes(),
				undefined,
			);

			expect(response?.status).toBe(400);
			const payload = (await response?.json()) as { issues: Array<{ path?: string[] }> };
			expect(payload.issues.map((issue) => issue.path)).toContainEqual(['slug']);
		});

		it('still validates a JSON post with the same schema', async () => {
			const routes = compileApiRoutes([
				{
					path: '/api/cart',
					method: 'POST',
					schema: { body: z.object({ slug: z.string(), quantity: z.number() }) },
					handler: ({ body }) => Response.json(body),
				},
			]);
			const response = await createPipeline().tryHandle(
				post('{"slug":"chair","quantity":2}', { 'Content-Type': 'application/json' }),
				routes,
				undefined,
			);

			expect(await response?.json()).toEqual({ slug: 'chair', quantity: 2 });
		});

		it('validates a multipart post, keeping repeated keys as arrays and files as File values', async () => {
			const form = new FormData();
			form.append('tag', 'a');
			form.append('tag', 'b');
			form.append('upload', new File(['hello'], 'hello.txt', { type: 'text/plain' }));
			const response = await createPipeline().tryHandle(
				new Request('http://localhost/api/cart', { method: 'POST', body: form }),
				compileApiRoutes([
					{
						path: '/api/cart',
						method: 'POST',
						schema: { body: z.object({ tag: z.array(z.string()), upload: z.instanceof(File) }) },
						handler: async ({ body }) => {
							const { tag, upload } = body as { tag: string[]; upload: File };
							return Response.json({ tag, name: upload.name, text: await upload.text() });
						},
					},
				]),
				undefined,
			);

			expect(await response?.json()).toEqual({ tag: ['a', 'b'], name: 'hello.txt', text: 'hello' });
		});

		it('validates a form with no fields as an empty object', async () => {
			const response = await createPipeline().tryHandle(
				post('', { 'Content-Type': 'application/x-www-form-urlencoded' }),
				compileApiRoutes([
					{
						path: '/api/cart',
						method: 'POST',
						schema: { body: z.object({ tag: z.string().optional() }) },
						handler: ({ body }) => Response.json(body),
					},
				]),
				undefined,
			);

			expect(response?.status).toBe(200);
			expect(await response?.json()).toEqual({});
		});

		it('answers HTTP 400 for a multipart body that cannot be parsed', async () => {
			const response = await createPipeline().tryHandle(
				post('not a multipart body', { 'Content-Type': 'multipart/form-data; boundary=x' }),
				cartRoutes(),
				undefined,
			);

			expect(response?.status).toBe(400);
			expect(await response?.json()).toEqual({ error: 'Invalid request body' });
		});

		it('validates a form post streamed through the Node request bridge', async () => {
			const incomingRequest = new NodeRequestFixture();
			incomingRequest.url = '/api/cart';
			incomingRequest.headers = {
				'content-type': 'application/x-www-form-urlencoded',
				'transfer-encoding': 'chunked',
			};
			const request = new NodeHttpRequestBridge().createWebRequest(
				incomingRequest as unknown as IncomingMessage,
				'http://localhost',
			);
			const responsePromise = createPipeline().tryHandle(request, cartRoutes(), undefined);

			incomingRequest.write('slug=chair&');
			incomingRequest.end('quantity=2');
			const response = await responsePromise;

			expect(response?.status).toBe(200);
			expect(await response?.json()).toEqual({ slug: 'chair', quantity: '2' });
		});

		it('answers a client abort while a form body is read with HTTP 499', async () => {
			const incomingRequest = new NodeRequestFixture();
			incomingRequest.url = '/api/cart';
			incomingRequest.headers = {
				'content-type': 'application/x-www-form-urlencoded',
				'transfer-encoding': 'chunked',
			};
			const request = new NodeHttpRequestBridge().createWebRequest(
				incomingRequest as unknown as IncomingMessage,
				'http://localhost',
			);
			const responsePromise = createPipeline().tryHandle(request, cartRoutes(), undefined);

			incomingRequest.write('slug=chair&');
			incomingRequest.emit('aborted');

			expect((await responsePromise)?.status).toBe(499);
		});

		it('validates a form post that sends no body as an empty object', async () => {
			const response = await createPipeline().tryHandle(
				new Request('http://localhost/api/cart', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				}),
				compileApiRoutes([
					{
						path: '/api/cart',
						method: 'POST',
						schema: { body: z.object({ tag: z.string().optional() }) },
						handler: ({ body }) => Response.json(body),
					},
				]),
				undefined,
			);

			expect(await response?.json()).toEqual({});
		});

		it('validates a multipart post that sends no body as an empty object', async () => {
			const response = await createPipeline().tryHandle(
				new Request('http://localhost/api/cart', {
					method: 'POST',
					headers: { 'Content-Type': 'multipart/form-data; boundary=x' },
				}),
				compileApiRoutes([
					{
						path: '/api/cart',
						method: 'POST',
						schema: { body: z.object({ tag: z.string().optional() }) },
						handler: ({ body }) => Response.json(body),
					},
				]),
				undefined,
			);

			expect(await response?.json()).toEqual({});
		});

		it('validates a bodyless Node form post as an empty object', async () => {
			const response = await createPipeline().tryHandle(
				createEmptyNodeRequest({
					'content-type': 'application/x-www-form-urlencoded',
					'content-length': '0',
				}),
				compileApiRoutes([
					{
						path: '/api/posts',
						method: 'POST',
						schema: { body: z.object({ tag: z.string().optional() }) },
						handler: ({ body }) => Response.json(body),
					},
				]),
				undefined,
			);

			expect(await response?.json()).toEqual({});
		});

		it('leaves the request body readable by the handler', async () => {
			const response = await createPipeline().tryHandle(
				post('slug=chair&quantity=2', { 'Content-Type': 'application/x-www-form-urlencoded' }),
				cartRoutes(async ({ request }) => Response.json(Object.fromEntries(await request.formData()))),
				undefined,
			);

			expect(await response?.json()).toEqual({ slug: 'chair', quantity: '2' });
		});
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
			compileApiRoutes([
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }) },
					handler: () => new Response('unreachable'),
				},
			]),
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
			compileApiRoutes([
				{
					path: '/api/posts',
					method: 'POST',
					schema: { body: z.object({ title: z.string() }) },
					handler: () => new Response('unreachable'),
				},
			]),
			undefined,
		);

		expect(response?.status).toBe(415);
	});

	describe('QUERY requests', () => {
		const queryHandlers: ApiHandler[] = [
			{
				path: '/api/search',
				method: 'QUERY',
				schema: { body: z.object({ term: z.string() }) },
				handler: ({ body }) => Response.json(body),
			},
		];
		const queryRequest = (init: RequestInit) =>
			new Request('http://localhost/api/search', { method: 'QUERY', body: '{"term":"ecopages"}', ...init });

		it('answers QUERY and not GET', async () => {
			const pipeline = createPipeline();

			const queried = await pipeline.tryHandle(
				queryRequest({ headers: { 'Content-Type': 'application/json' } }),
				compileApiRoutes(queryHandlers),
				undefined,
			);
			const read = await pipeline.tryHandle(
				new Request('http://localhost/api/search'),
				compileApiRoutes(queryHandlers),
				undefined,
			);

			expect(queried?.status).toBe(200);
			expect(await queried?.json()).toEqual({ term: 'ecopages' });
			expect(read).toBeNull();
		});

		it('answers HTTP 400 for a body that fails the schema', async () => {
			const response = await createPipeline().tryHandle(
				queryRequest({ headers: { 'Content-Type': 'application/json' }, body: '{"term":1}' }),
				compileApiRoutes(queryHandlers),
				undefined,
			);

			expect(response?.status).toBe(400);
		});

		it('answers HTTP 415 for a body with no content type', async () => {
			const response = await createPipeline().tryHandle(
				queryRequest({ body: new Uint8Array([1]) }),
				compileApiRoutes(queryHandlers),
				undefined,
			);

			expect(response?.status).toBe(415);
		});

		it('leaves the body to the handler when no body schema is declared', async () => {
			const response = await createPipeline().tryHandle(
				queryRequest({ headers: { 'Content-Type': 'application/json' } }),
				compileApiRoutes([
					{
						path: '/api/search',
						method: 'QUERY',
						handler: async ({ request }) => new Response(await request.text()),
					},
				]),
				undefined,
			);

			expect(await response?.text()).toBe('{"term":"ecopages"}');
		});
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
			compileApiRoutes(handlers),
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
			compileApiRoutes(throwingHandler(new NodeClientAbortError())),
			undefined,
			errorHandler,
		);

		expect(response?.status).toBe(499);
		expect(errorHandler).not.toHaveBeenCalled();
		expect(loggerSpy).not.toHaveBeenCalled();
		loggerSpy.mockRestore();
	});

	it('answers an HttpError thrown from another copy of the class with its status', async () => {
		class BundledHttpError extends Error {
			override readonly name = 'HttpError';
			constructor(
				readonly status: number,
				message: string,
				readonly details?: Record<string, unknown>,
			) {
				super(message);
			}
		}

		const response = await createPipeline().tryHandle(
			new Request('http://localhost/api/fail', { method: 'POST' }),
			compileApiRoutes(throwingHandler(new BundledHttpError(400, 'Invalid post', { field: 'slug' }))),
			undefined,
		);

		expect(response?.status).toBe(400);
		expect(await response?.json()).toEqual({ error: 'Invalid post', status: 400, details: { field: 'slug' } });
	});

	it('logs unhandled errors with the Error object so the stack is kept', async () => {
		const error = new Error('boom');
		const loggerSpy = vi.spyOn(appLogger, 'error').mockImplementation(() => appLogger);

		const response = await createPipeline().tryHandle(
			new Request('http://localhost/api/fail', { method: 'POST' }),
			compileApiRoutes(throwingHandler(error)),
			undefined,
		);

		expect(response?.status).toBe(500);
		expect(loggerSpy).toHaveBeenCalledWith('[ecopages] Error handling request', error);
		loggerSpy.mockRestore();
	});
});
