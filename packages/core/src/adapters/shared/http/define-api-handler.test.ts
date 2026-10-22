import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { ApiHandler, ApiHandlerContext, EcoMiddleware, PageParams } from '../../../types/contracts.ts';
import { defineGet, definePost, defineGroupHandler, json, html, redirect } from './define-api-handler.ts';

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
