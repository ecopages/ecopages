import { createMiddleware, composeMiddleware } from '../src/middleware/create-middleware.ts';
import { defineGet } from '../src/adapters/shared/http/define-api-handler.ts';
import { eco } from '../src/eco/eco.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function assert<T extends true>(): T | void {}

const session = createMiddleware((_ctx, next) => next({ session: { userId: 'u1' } }));
const clear = createMiddleware((_ctx, next) => next({ session: null }));
const tag = createMiddleware((_ctx, next) => next({ tag: 'x' }));
const admin = composeMiddleware(session, (ctx, next) => next({ adminOf: ctx.locals.session.userId }));

// an API handler reads the locals of its middleware list, in order
defineGet({
	path: '/me',
	middleware: [session, tag],
	handler: (ctx) => {
		assert<Equal<typeof ctx.locals.session, { userId: string }>>();
		assert<Equal<typeof ctx.locals.tag, string>>();
		return ctx.response.json({});
	},
});

// a later stage overwrites an earlier key, in the handler's type too
defineGet({
	path: '/cleared',
	middleware: [session, clear],
	handler: (ctx) => {
		assert<Equal<typeof ctx.locals.session, null>>();
		return ctx.response.json({});
	},
});

// a composition lists as one entry and reaches the handler
defineGet({
	path: '/admin',
	middleware: [admin],
	handler: (ctx) => {
		assert<Equal<typeof ctx.locals.adminOf, string>>();
		return ctx.response.json({});
	},
});

// a page reads the locals of its middleware list in props
eco.page({
	cache: 'dynamic',
	middleware: [session, tag],
	props: ({ locals }) => {
		assert<Equal<typeof locals.session, { userId: string }>>();
		assert<Equal<typeof locals.tag, string>>();
		return {};
	},
	render: () => '',
});

// a page whose list ends in an overwrite sees the overwrite
eco.page({
	cache: 'dynamic',
	middleware: [session, clear],
	props: ({ locals }) => {
		assert<Equal<typeof locals.session, null>>();
		return {};
	},
	render: () => '',
});

// inline plain middleware keeps typed parameters on a page and on an API route
eco.page({
	cache: 'dynamic',
	middleware: [
		(ctx, next) => {
			assert<Equal<typeof ctx.request, Request>>();
			return next();
		},
	],
	render: () => '',
});

// a widened tail must not keep the proof of the fixed prefix
const widenedTail: (typeof clear)[] = [clear];
defineGet({
	path: '/widened',
	middleware: [session, ...widenedTail],
	handler: (ctx) => {
		// @ts-expect-error a widened tail may overwrite session, so it is not provably non-null
		const userId: string = ctx.locals.session.userId;
		return ctx.response.json({ userId });
	},
});
