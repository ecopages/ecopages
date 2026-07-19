import { describe, expect, it } from 'vitest';
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
