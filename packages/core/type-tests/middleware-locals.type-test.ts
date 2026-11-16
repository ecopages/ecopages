import { composeMiddleware, createMiddleware } from '../src/middleware/create-middleware.ts';
import type { ListLocals } from '../src/types/middleware-types.ts';

type Session = { user: { id: string; role: 'admin' | 'user' }; token: string };
declare function getSession(request: Request): Promise<Session | null>;
declare function expectType<T>(value: T): void;

const requireSession = createMiddleware(async (ctx, next) => {
	const session = await getSession(ctx.request);
	if (!session) return Response.redirect('/login');
	return next({ session });
});
const theme = createMiddleware((_ctx, next) => next({ theme: 'dark' as const }));
const logger = createMiddleware((_ctx, next) => next());

type Locals<T extends readonly unknown[]> = ListLocals<T>;

// a bare Response return and next(...) together keep what was provided
expectType<{ session: Session }>({} as Locals<[typeof requireSession]>);
// @ts-expect-error requireSession provides no theme
expectType<{ theme: 'dark' }>({} as Locals<[typeof requireSession]>);
expectType<{ session: Session; theme: 'dark' }>({} as Locals<[typeof requireSession, typeof theme, typeof logger]>);

// a stage composed after others reads what they provided, without an annotation
const adminOnly = composeMiddleware(
	requireSession,
	(ctx, next) =>
		ctx.locals.session.user.role === 'admin'
			? next({ role: 'admin' as const })
			: new Response('no', { status: 403 }),
	(ctx, next) => next({ label: `${ctx.locals.session.user.id}-${ctx.locals.role}` }),
);
expectType<{ session: Session; role: 'admin'; label: string }>({} as Locals<[typeof adminOnly]>);

// the first stage sees nothing
composeMiddleware((ctx, next) => {
	// @ts-expect-error no stage before this one provides session
	void ctx.locals.session;
	return next();
});

// a composition is itself a middleware: it can be composed again and listed with others
const bigger = composeMiddleware(adminOnly, (ctx, next) => next({ seen: ctx.locals.label }));
expectType<{ session: Session; role: 'admin'; label: string; seen: string }>({} as Locals<[typeof bigger]>);
expectType<{ session: Session; role: 'admin'; label: string; theme: 'dark' }>(
	{} as Locals<[typeof adminOnly, typeof theme]>,
);

// the later stage wins on a shared key
const darker = createMiddleware((_ctx, next) => next({ theme: 'blue' as const }));
expectType<{ theme: 'blue' }>({} as Locals<[typeof theme, typeof darker]>);

// paths that provide different keys give a union, so a reader must narrow
const maybe = createMiddleware(async (ctx, next) => {
	const session = await getSession(ctx.request);
	return session ? next({ session }) : next({ anonymous: true as const });
});
const afterMaybe = composeMiddleware(maybe, (_ctx, next) => next({ theme: 'dark' as const }));
type AfterMaybe = Locals<[typeof afterMaybe]>;
declare const afterMaybeLocals: AfterMaybe;
// @ts-expect-error session exists on one path only
void afterMaybeLocals.session;
expectType<'dark'>(afterMaybeLocals.theme);
if ('session' in afterMaybeLocals) expectType<Session>(afterMaybeLocals.session);

// a stage that always stops provides nothing
const alwaysStops = createMiddleware(() => new Response('closed', { status: 503 }));
expectType<{}>({} as Locals<[typeof alwaysStops]>);

// post-processing after next stays possible
createMiddleware(async (_ctx, next) => {
	const response = await next();
	response.headers.set('x-handled', '1');
	return response;
});

// a stage must return next(...) or a Response
// @ts-expect-error a string is not a stage result
createMiddleware(() => 'nope');

// a plain function in a list provides nothing
const plain = (_ctx: unknown, next: () => Promise<Response>) => next();
expectType<{ session: Session }>({} as Locals<[typeof plain, typeof requireSession]>);

// a stage that provides on one path and nothing on another keeps both: the reader must narrow
const optionalProvide = createMiddleware(async (ctx, next) => {
	const session = await getSession(ctx.request);
	if (session) return next({ session });
	return next();
});
declare const optionalLocals: Locals<[typeof optionalProvide]>;
// @ts-expect-error session exists on one path only
void optionalLocals.session;
if ('session' in optionalLocals) expectType<Session>(optionalLocals.session);

// a list typed as a plain array provides nothing
declare const widened: (typeof requireSession)[];
expectType<{}>({} as Locals<typeof widened>);

// a middleware needing earlier locals lives in a composition that supplies them
const group = composeMiddleware(requireSession, (ctx, next) => next({ id: ctx.locals.session.user.id }));
const routeOnTop = composeMiddleware(group, (ctx, next) => next({ upper: ctx.locals.id.toUpperCase() }));
expectType<{ session: Session; id: string; upper: string }>({} as Locals<[typeof routeOnTop]>);

// beyond four stages, nest: a composition is a middleware
const first4 = composeMiddleware(
	requireSession,
	(ctx, next) => next({ a: ctx.locals.session.user.id }),
	(ctx, next) => next({ b: ctx.locals.a.length }),
	(ctx, next) => next({ c: ctx.locals.b + 1 }),
);
const nested = composeMiddleware(
	first4,
	(ctx, next) => next({ d: ctx.locals.c + 1 }),
	(ctx, next) => next({ e: ctx.locals.d + 1 }),
);
expectType<{ session: Session; a: string; b: number; c: number; d: number; e: number }>({} as Locals<[typeof nested]>);
