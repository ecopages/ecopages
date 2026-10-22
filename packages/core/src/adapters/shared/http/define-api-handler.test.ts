import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { ApiHandler, ApiHandlerContext, EcoMiddleware, PageParams, PageQuery } from '../../../types/contracts.ts';
import { defineGet, definePost, defineGroupHandler, defineQuery, json, html, redirect } from './define-api-handler.ts';

describe('defineGet / definePost', () => {
	it('sets method without requiring an explicit method field', () => {
		const getHandler = defineGet({
			path: '/api/posts',
			handler: async ({ response }) => response.json([]),
		});
		const postHandler = definePost({
			path: '/api/posts',
			handler: async ({ response }) => response.status(201).json({ ok: true }),
		});

		expect(getHandler.method).toBe('GET');
		expect(getHandler.path).toBe('/api/posts');
		expect(postHandler.method).toBe('POST');
	});
});

describe('params typing', () => {
	it('keeps params as PageParams when no schema is given, whatever the path string', () => {
		defineGet({
			path: '/api/users/:id',
			handler: ({ params }) => {
				expectTypeOf(params).toEqualTypeOf<PageParams>();
				return json({ id: params.id });
			},
		});
	});

	it('narrows params to the schema.params output', () => {
		defineGet({
			path: '/api/users/:id',
			schema: { params: z.object({ id: z.string() }) },
			handler: ({ params }) => {
				expectTypeOf(params).toEqualTypeOf<{ id: string }>();
				return json({ id: params.id });
			},
		});
	});

	it('keeps the base context type for each field the schema omits', () => {
		definePost({
			path: '/api/posts/:slug',
			schema: { body: z.object({ text: z.string() }) },
			handler: ({ params, query, body }) => {
				expectTypeOf(params).toEqualTypeOf<PageParams>();
				expectTypeOf(query).toEqualTypeOf<PageQuery>();
				expectTypeOf(body).toEqualTypeOf<{ text: string }>();
				return json({});
			},
		});
	});

	it('keeps undefined in the type of an optional schema', () => {
		definePost({
			path: '/api/posts',
			schema: { body: z.object({ text: z.string() }).optional() },
			handler: ({ body }) => {
				expectTypeOf(body).toEqualTypeOf<{ text: string } | undefined>();
				return json({});
			},
		});
	});
});

describe('method helpers without path', () => {
	it('returns a handler with an empty path for an endpoint file', () => {
		const getHandler = defineGet({
			handler: async ({ response }) => response.json([]),
		});

		expectTypeOf(getHandler).toEqualTypeOf<ApiHandler<'', Request, unknown>>();
		expect(getHandler.method).toBe('GET');
		expect(getHandler.path).toBe('');
	});

	it('keeps the literal path type when a path is given', () => {
		const getHandler = defineGet({
			path: '/x',
			handler: async ({ response }) => response.json([]),
		});

		expectTypeOf(getHandler).toEqualTypeOf<ApiHandler<'/x', Request, unknown>>();
		expect(getHandler.path).toBe('/x');
	});

	it('types params from schema.params', () => {
		const postHandler = definePost({
			schema: { params: z.object({ id: z.string() }) },
			handler: async ({ params, response }) => {
				expectTypeOf(params).toEqualTypeOf<{ id: string }>();
				return response.json(params);
			},
		});

		expectTypeOf(postHandler).toEqualTypeOf<ApiHandler<'', Request, unknown>>();
	});

	it('types the context extended by middleware', () => {
		type AuthContext = ApiHandlerContext<Request, unknown> & { user: string };
		const auth: EcoMiddleware<AuthContext> = async (_context, next) => next();

		defineGet({
			middleware: [auth],
			handler: async ({ user, response }) => {
				expectTypeOf(user).toEqualTypeOf<string>();
				return response.json({ user });
			},
		});
	});

	it('types params as PageParams without a schema', () => {
		defineGet({
			handler: async ({ params, response }) => {
				expectTypeOf(params).toEqualTypeOf<PageParams>();
				return response.json(params);
			},
		});
	});

	it('still requires a path inside a group', () => {
		defineGroupHandler({
			prefix: '/admin',
			routes: (api) => [
				// @ts-expect-error a group route is an Explicit Route and needs its path
				api.get({
					handler: async ({ response }) => response.json({}),
				}),
			],
		});
	});
});

describe('defineQuery', () => {
	it('defines a QUERY handler with an empty path for an endpoint file', () => {
		const queryHandler = defineQuery({ handler: ({ response }) => response.json([]) });

		expectTypeOf(queryHandler).toEqualTypeOf<ApiHandler<'', Request, unknown>>();
		expect(queryHandler.method).toBe('QUERY');
		expect(queryHandler.path).toBe('');
	});

	it('keeps the literal path type when a path is given', () => {
		const queryHandler = defineQuery({ path: '/x', handler: ({ response }) => response.json([]) });

		expectTypeOf(queryHandler).toEqualTypeOf<ApiHandler<'/x', Request, unknown>>();
		expect(queryHandler.method).toBe('QUERY');
		expect(queryHandler.path).toBe('/x');
	});

	it('types the handler body from schema.body', () => {
		defineQuery({
			schema: { body: z.object({ term: z.string() }) },
			handler: ({ body, response }) => {
				expectTypeOf(body).toEqualTypeOf<{ term: string }>();
				return response.json(body);
			},
		});
	});

	it('is available on the group api and requires a path there', () => {
		const group = defineGroupHandler({
			prefix: '/admin',
			routes: (api) => [
				api.query({ path: '/search', handler: ({ response }) => response.json([]) }),
				// @ts-expect-error a group route is an Explicit Route and needs its path
				api.query({ handler: ({ response }) => response.json([]) }),
			],
		});

		expect(group.routes[0]).toMatchObject({ method: 'QUERY', path: '/search' });
	});
});

describe('defineGroupHandler', () => {
	it('builds routes via api.get / api.post helpers', () => {
		const group = defineGroupHandler({
			prefix: '/admin',
			routes: (api) => [
				api.get({
					path: '/',
					handler: async ({ response }) => response.json({ ok: true }),
				}),
				api.post({
					path: '/items',
					handler: async ({ response }) => response.status(201).json({ created: true }),
				}),
			],
		});

		expect(group.prefix).toBe('/admin');
		expect(group.routes).toHaveLength(2);
		expect(group.routes[0].method).toBe('GET');
		expect(group.routes[0].path).toBe('/');
		expect(group.routes[1].method).toBe('POST');
		expect(group.routes[1].path).toBe('/items');
	});

	it('gives the method helpers the context the group middleware adds', () => {
		type SessionContext = ApiHandlerContext<Request, unknown> & { session: { userId: string } };
		const withSession: EcoMiddleware<SessionContext> = async (ctx, next) => {
			ctx.session = { userId: 'u1' };
			return next();
		};

		defineGroupHandler({
			prefix: '/account',
			middleware: [withSession],
			routes: (api) => [
				api.get({
					path: '/me',
					handler: (ctx) => {
						expectTypeOf(ctx.session).toEqualTypeOf<{ userId: string }>();
						return json(ctx.session);
					},
				}),
				api.post({
					path: '/:id',
					schema: { body: z.object({ name: z.string() }) },
					handler: (ctx) => {
						expectTypeOf(ctx.session).toEqualTypeOf<{ userId: string }>();
						expectTypeOf(ctx.body).toEqualTypeOf<{ name: string }>();
						expectTypeOf(ctx.params).toEqualTypeOf<PageParams>();
						return json({});
					},
				}),
			],
		});
	});
});

describe('middleware context', () => {
	type SessionContext = ApiHandlerContext<Request, unknown> & { session: { userId: string } };
	type LocaleContext = ApiHandlerContext<Request, unknown> & { locale: string };
	const withSession: EcoMiddleware<SessionContext> = async (ctx, next) => next();
	const withLocale: EcoMiddleware<LocaleContext> = async (ctx, next) => next();

	it('types the handler with the context every one of its middleware adds', () => {
		defineGet({
			path: '/me',
			middleware: [withSession, withLocale],
			handler: (ctx) => {
				expectTypeOf(ctx.session).toEqualTypeOf<{ userId: string }>();
				expectTypeOf(ctx.locale).toEqualTypeOf<string>();
				return json({});
			},
		});
	});

	it('gives group routes the context of every group and route middleware', () => {
		defineGroupHandler({
			prefix: '/account',
			middleware: [withSession, withLocale],
			routes: (api) => [
				api.get({
					path: '/me',
					handler: (ctx) => {
						expectTypeOf(ctx.session).toEqualTypeOf<{ userId: string }>();
						expectTypeOf(ctx.locale).toEqualTypeOf<string>();
						return json({});
					},
				}),
			],
		});
		defineGroupHandler({
			prefix: '/account',
			middleware: [withSession],
			routes: (api) => [
				api.post({
					path: '/me',
					middleware: [withLocale],
					handler: (ctx) => {
						expectTypeOf(ctx.session).toEqualTypeOf<{ userId: string }>();
						expectTypeOf(ctx.locale).toEqualTypeOf<string>();
						return json({});
					},
				}),
			],
		});
	});

	it('accepts an inline middleware function beside a typed constant', () => {
		defineGroupHandler({
			prefix: '/account',
			middleware: [
				withSession,
				async (ctx, next) => {
					expectTypeOf(ctx).toEqualTypeOf<ApiHandlerContext<Request, unknown>>();
					return next();
				},
			],
			routes: (api) => [
				api.get({
					path: '/me',
					handler: (ctx) => {
						expectTypeOf(ctx.session).toEqualTypeOf<{ userId: string }>();
						return json(ctx.session);
					},
				}),
			],
		});
	});
});

describe('json / html / redirect', () => {
	it('emits JSON with application/json content type', async () => {
		const response = json({ hello: 'world' }, { status: 201 });
		expect(response.status).toBe(201);
		expect(response.headers.get('Content-Type')).toContain('application/json');
		expect(await response.json()).toEqual({ hello: 'world' });
	});

	it('emits HTML with text/html content type', async () => {
		const response = html('<p>hi</p>');
		expect(response.headers.get('Content-Type')).toContain('text/html');
		expect(await response.text()).toBe('<p>hi</p>');
	});

	it('emits redirect with Location header', () => {
		const response = redirect('/login', 303);
		expect(response.status).toBe(303);
		expect(response.headers.get('Location')).toBe('/login');
	});
});
