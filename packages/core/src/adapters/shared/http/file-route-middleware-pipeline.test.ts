import { describe, expect, it } from 'vitest';
import type { FileRouteMiddleware } from '../../../types/public-types.ts';
import { LocalsAccessError } from '../../../errors/locals-access-error.ts';
import {
	FILE_ROUTE_MIDDLEWARE_PIPELINE_ERRORS,
	FileRouteMiddlewarePipeline,
} from './file-route-middleware-pipeline.ts';

declare module '../../../types/public-types.ts' {
	interface RequestLocals {
		user?: string;
		first?: boolean;
	}
}

describe('FileRouteMiddlewarePipeline', () => {
	it('should reject middleware on non-dynamic pages', () => {
		const service = new FileRouteMiddlewarePipeline(null);

		expect(() =>
			service.assertValidConfiguration({
				middleware: [async (_ctx, next) => next()],
				pageCacheStrategy: 'static',
				filePath: '/app/pages/index.tsx',
			}),
		).toThrowError(
			new LocalsAccessError(
				FILE_ROUTE_MIDDLEWARE_PIPELINE_ERRORS.middlewareRequiresDynamic('/app/pages/index.tsx'),
			),
		);
	});

	it('should create middleware context without handler render methods', async () => {
		const service = new FileRouteMiddlewarePipeline(null);
		const context = service.createContext({
			request: new Request('http://localhost:3000/hello'),
			params: { slug: 'hello' },
			locals: { user: 'andee' },
		});

		expect('render' in context).toBe(false);
		expect('renderPartial' in context).toBe(false);

		expect(context.require('user', () => new Response('missing', { status: 500 }))).toBe('andee');
		expect(await context.html('<p>ok</p>').text()).toContain('<p>ok</p>');
		expect(await context.json({ ok: true }).text()).toContain('{"ok":true}');
	});

	it('should honor context.response builder state in json shortcut', async () => {
		const service = new FileRouteMiddlewarePipeline(null);
		const context = service.createContext({
			request: new Request('http://localhost:3000/hello'),
			params: {},
			locals: {},
		});
		context.response.status(201).headers({ 'X-Test': 'true' });
		const response = context.json({ ok: true });
		expect(response.status).toBe(201);
		expect(response.headers.get('X-Test')).toBe('true');
		expect(await response.json()).toEqual({ ok: true });
	});

	it('should execute middleware in order and eventually render the response', async () => {
		const service = new FileRouteMiddlewarePipeline(null);
		const context = service.createContext({
			request: new Request('http://localhost:3000/hello'),
			params: {},
			locals: {},
		});
		const events: string[] = [];

		const middleware: FileRouteMiddleware[] = [
			async (ctx, next) => {
				events.push('first:before');
				ctx.locals.first = true;
				const response = await next();
				events.push('first:after');
				return response;
			},
			async (ctx, next) => {
				events.push('second');
				expect(ctx.locals.first).toBe(true);
				return next();
			},
		];

		const response = await service.run({
			middleware,
			context,
			renderResponse: async () => {
				events.push('render');
				return new Response('done');
			},
		});

		expect(await response.text()).toBe('done');
		expect(events).toEqual(['first:before', 'second', 'render', 'first:after']);
	});
});
