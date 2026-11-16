import { createMiddleware } from '../src/middleware/create-middleware.ts';
import { defineGet, defineGroupHandler } from '../src/adapters/shared/http/define-api-handler.ts';
import { eco } from '../src/eco/eco.ts';
import type { AnyEcoMiddleware, EcoMiddleware, ListLocals } from '../src/types/middleware-types.ts';
import type { MiddlewareList } from '../src/types/contracts.ts';

type Session = { userId: string };
declare const cond: boolean;
declare const session: Session;

const provideSession = createMiddleware((_ctx, next) => next({ session }));
const clear = createMiddleware((_ctx, next) => next({ session: null }));

// next with an explicit type argument still needs the value it promises
createMiddleware((_ctx, next) =>
	// @ts-expect-error next<{ session }>() provides nothing at runtime
	next<{ session: Session }>(),
);

// a value that may be undefined is not a provision of every key
const maybeProvided = createMiddleware((_ctx, next) =>
	// @ts-expect-error undefined would provide no session
	next(cond ? { session } : undefined),
);
void maybeProvided;

// a tail of unknown provision proves nothing about the keys before it
const tail: AnyEcoMiddleware[] = [clear];
defineGet({
	path: '/tail',
	middleware: [provideSession, ...tail],
	handler: (ctx) => {
		// @ts-expect-error a tail of unknown locals may overwrite session
		const userId: string = ctx.locals.session.userId;
		return ctx.response.json({ userId });
	},
});
eco.page({
	cache: 'dynamic',
	middleware: [provideSession, ...tail],
	props: ({ locals }) => {
		// @ts-expect-error a tail of unknown locals may overwrite session
		const userId: string = locals.session.userId;
		return { userId };
	},
	render: () => '',
});

// an entry of unknown locals in a fixed tuple proves nothing before it; a later entry proves its keys again
const unknownEntry: AnyEcoMiddleware = clear;
declare const beforeUnknown: ListLocals<[typeof provideSession, typeof unknownEntry]>;
// @ts-expect-error an entry of unknown locals may overwrite session
const unprovenSession: Session = beforeUnknown.session;
void unprovenSession;
declare const afterUnknown: ListLocals<[typeof unknownEntry, typeof provideSession]>;
const reprovenSession: Session = afterUnknown.session;
void reprovenSession;

// a route entry of unknown locals leaves no key of its group proven
defineGroupHandler({
	prefix: '/group',
	middleware: [provideSession],
	routes: (api) => [
		api.get({ path: '/known', handler: (ctx) => ctx.response.json({ userId: ctx.locals.session.userId }) }),
		api.get({
			path: '/unknown',
			middleware: [unknownEntry],
			handler: (ctx) => {
				// @ts-expect-error the route's entry of unknown locals may overwrite the group's session
				const userId: string = ctx.locals.session.userId;
				return ctx.response.json({ userId });
			},
		}),
	],
});

// a route list annotated MiddlewareList by hand may overwrite the group's keys, so it keeps none proven
const annotatedList: MiddlewareList = [clear];
defineGroupHandler({
	prefix: '/annotated',
	middleware: [provideSession],
	routes: (api) => [
		api.get({
			path: '/cleared',
			middleware: annotatedList,
			handler: (ctx) => {
				// @ts-expect-error the annotated list may have cleared the group's session
				const userId: string = ctx.locals.session.userId;
				return ctx.response.json({ userId });
			},
		}),
	],
});

// a middleware cannot be upcast to one that provides less, so a fixed tuple keeps an honest fold
// @ts-expect-error the brand is invariant in its locals
const upcast: EcoMiddleware = clear;
void upcast;
// @ts-expect-error the brand is invariant in its locals
const upcastToAny: EcoMiddleware<{ session: Session | null; extra?: string }> = clear;
void upcastToAny;

// a proof cannot be forged without createMiddleware or composeMiddleware
// @ts-expect-error only createMiddleware and composeMiddleware make a middleware
const fake: EcoMiddleware<{ session: Session }> = {};
void fake;

// a plain list of made middleware still type-checks and provides no reliable locals
const plainList: AnyEcoMiddleware[] = [provideSession, clear];
type PlainListLocals = ListLocals<typeof plainList>;
declare const plainListLocals: PlainListLocals;
// @ts-expect-error a plain list proves no key
const fromPlainList: Session = plainListLocals.session;
void fromPlainList;
