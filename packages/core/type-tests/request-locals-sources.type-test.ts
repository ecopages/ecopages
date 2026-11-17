import { createMiddleware } from '../src/middleware/create-middleware.ts';
import { defineGet } from '../src/adapters/shared/http/define-api-handler.ts';
import { eco } from '../src/eco/eco.ts';
import type { FileRouteMiddleware, LayoutProps, Middleware } from '../src/types/contracts.ts';
import type * as PublicTypes from '../src/types/public-types.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function assert<T extends true>(): T | void {}

// core exports no global locals interface to augment
// @ts-expect-error `RequestLocals` no longer exists
export type NoGlobalLocals = PublicTypes.RequestLocals;

/**
 * @remarks
 * An app that still augments the old name declares a new interface that nothing reads, so it types no Page, layout
 * entry or handler below. It augments the internal module so the public types above still have no such export.
 */
declare module '../src/types/contracts.ts' {
	interface RequestLocals {
		augmented: string;
	}
}

const tag = createMiddleware((_ctx, next) => next({ tag: 'x' }));
const Shell = eco.layout<string, LayoutProps<string> & { label?: string }>({ render: ({ children }) => children });

// a Dynamic Page with no middleware has no locals keys
eco.page({
	cache: 'dynamic',
	props: ({ locals }) => {
		assert<Equal<typeof locals, Readonly<{}>>>();
		// @ts-expect-error the augmentation provides nothing
		void locals.augmented;
		return {};
	},
	render: () => '',
});

// a Page's locals are exactly what its middleware list provides
eco.page({
	cache: 'dynamic',
	middleware: [tag],
	props: ({ locals }) => {
		assert<Equal<typeof locals, Readonly<{ tag: string }>>>();
		return {};
	},
	layout: {
		component: Shell,
		props: ({ locals }) => {
			assert<Equal<typeof locals, Readonly<{ tag: string }>>>();
			return { label: locals.tag };
		},
	},
	render: () => '',
});

// a handler with no middleware has no locals keys
defineGet({
	path: '/bare',
	handler: (ctx) => {
		assert<Equal<typeof ctx.locals, {}>>();
		// @ts-expect-error the augmentation provides nothing
		void ctx.locals.augmented;
		return ctx.response.json({});
	},
});

// a plain function may still write any local, and writes into an untyped store
const writeLocale: Middleware = async (ctx, next) => {
	assert<Equal<typeof ctx.locals, Record<string, unknown>>>();
	ctx.locals.locale = 'en';
	return next();
};
const writeLocaleOnPage: FileRouteMiddleware = async (ctx, next) => {
	ctx.locals.locale = 'en';
	return next();
};

// what a plain function writes types nothing for the readers after it
defineGet({
	path: '/locale',
	middleware: [writeLocale],
	handler: (ctx) => {
		// @ts-expect-error a plain function provides no typed locals
		void ctx.locals.locale;
		return ctx.response.json({});
	},
});
eco.page({
	cache: 'dynamic',
	middleware: [writeLocaleOnPage, tag],
	props: ({ locals }) => {
		assert<Equal<typeof locals, Readonly<{ tag: string }>>>();
		// @ts-expect-error a plain function provides no typed locals
		void locals.locale;
		return {};
	},
	render: () => '',
});

// an inline plain function in a page list writes into the same untyped store
eco.page({
	cache: 'dynamic',
	middleware: [
		(ctx, next) => {
			ctx.locals.locale = 'en';
			return next();
		},
	],
	render: () => '',
});
