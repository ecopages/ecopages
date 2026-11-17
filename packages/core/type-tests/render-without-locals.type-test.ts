import { createMiddleware } from '../src/middleware/create-middleware.ts';
import { eco } from '../src/eco/eco.ts';
import type { FileRouteMiddlewareContext, PageParams, PageQuery } from '../src/types/contracts.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function assert<T extends true>(): T | void {}

const session = createMiddleware((_ctx, next) => next({ session: { userId: 'u1', token: 'secret' } }));

// render receives what props returned, with Params and Query, and nothing else
eco.page({
	cache: 'dynamic',
	middleware: [session],
	props: ({ locals }) => ({ userId: locals.session.userId }),
	render: (props) => {
		assert<Equal<keyof typeof props, 'userId' | 'params' | 'query'>>();
		assert<Equal<typeof props.params, PageParams | undefined>>();
		assert<Equal<typeof props.query, PageQuery | undefined>>();
		// @ts-expect-error render has no locals: props returns what render needs
		void props.locals;
		return props.userId;
	},
});

// destructuring locals in render is a compile error on a Dynamic Page with a middleware list
eco.page({
	cache: 'dynamic',
	middleware: [session],
	// @ts-expect-error render has no locals
	render: ({ locals }) => String(locals),
});

// and on a Dynamic Page without one
eco.page({
	cache: 'dynamic',
	props: ({ locals }) => ({ known: Object.keys(locals).length }),
	render: (props) => {
		// @ts-expect-error render has no locals
		void props.locals;
		return String(props.known);
	},
});

// a Static Page cannot read locals in props, render or a layout entry
const Shell = eco.layout<string>({ render: ({ children }) => children });
eco.page({
	props: (context) => {
		// @ts-expect-error no locals exist at build
		void context.locals;
		return {};
	},
	layout: {
		component: Shell,
		props: (context) => {
			// @ts-expect-error a Static Page's layout entries are request-free
			void context.locals;
			return {};
		},
	},
	render: (props) => {
		// @ts-expect-error render has no locals
		void props.locals;
		return '';
	},
});

// requires is gone: a Page reads its locals in props
eco.page({
	cache: 'dynamic',
	middleware: [session],
	// @ts-expect-error requires is removed
	requires: ['session'] as const,
	render: () => '',
});

// middleware reads typed locals; the ctx.require helper is gone
eco.page({
	cache: 'dynamic',
	middleware: [
		async (ctx: FileRouteMiddlewareContext, next) => {
			// @ts-expect-error ctx.require is removed: check ctx.locals explicitly
			void ctx.require;
			return next();
		},
	],
	render: () => '',
});

// middleware requires cache: 'dynamic'
// @ts-expect-error middleware without cache: 'dynamic' should error
eco.page({
	middleware: [
		async (_ctx: FileRouteMiddlewareContext, next: () => Promise<Response>) => {
			return next();
		},
	],
	render: () => '',
});

// @ts-expect-error middleware with cache: 'static' should error
eco.page({
	cache: 'static',
	middleware: [
		async (_ctx: FileRouteMiddlewareContext, next: () => Promise<Response>) => {
			return next();
		},
	],
	render: () => '',
});
