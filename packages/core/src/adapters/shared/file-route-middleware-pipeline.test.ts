import { describe, expect, it } from 'vitest';
import type { Middleware } from '../../types/public-types.ts';
import { LocalsAccessError } from '../../errors/locals-access-error.ts';
import {
	FILE_ROUTE_MIDDLEWARE_PIPELINE_ERRORS,
	FileRouteMiddlewarePipeline,
} from './file-route-middleware-pipeline.ts';

declare module '../../types/public-types.ts' {
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

	it('should create middleware context with render methods disabled', async () => {
		const service = new FileRouteMiddlewarePipeline(null);
		const DummyView = (() => '<div>dummy</div>') as never;
		const context = service.createContext({
			request: new Request('http://localhost:3000/hello'),
			params: { slug: 'hello' },
			locals: { user: 'andee' },
		});

		await expect(context.render(DummyView, {})).rejects.toThrow(
			FILE_ROUTE_MIDDLEWARE_PIPELINE_ERRORS.CTX_RENDER_UNAVAILABLE,
		);
		await expect(context.renderPartial(DummyView, {})).rejects.toThrow(
			FILE_ROUTE_MIDDLEWARE_PIPELINE_ERRORS.CTX_RENDER_PARTIAL_UNAVAILABLE,
		);

		expect(context.require('user', () => new Response('missing', { status: 500 }))).toBe('andee');
		expect(await context.html('<p>ok</p>').text()).toContain('<p>ok</p>');
		expect(await context.json({ ok: true }).text()).toContain('{"ok":true}');
	});

	it('should execute middleware in order and eventually render the response', async () => {
		const service = new FileRouteMiddlewarePipeline(null);
		const context = service.createContext({
			request: new Request('http://localhost:3000/hello'),
			params: {},
			locals: {},
		});
		const events: string[] = [];

		const middleware: Middleware[] = [
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
