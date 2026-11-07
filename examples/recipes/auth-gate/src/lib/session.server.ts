import type { FileRouteMiddleware } from '@ecopages/core';

export const SESSION_COOKIE = 'session';

/**
 * Reads the signed-in user from the request cookie.
 *
 * @remarks
 * A stand-in for your auth library: any non-empty cookie counts as a session. Replace the body with a real
 * check, such as validating a signed token or looking the session up in your store.
 */
export function readSession(request: Request): { user: string } | null {
	const cookie = request.headers.get('cookie') ?? '';
	const user = cookie
		.split(';')
		.map((part) => part.trim().split('='))
		.find(([name]) => name === SESSION_COOKIE)?.[1];
	return user ? { user: decodeURIComponent(user) } : null;
}

/** Puts the session on `locals` and always continues, so the layout decides what to show. */
export const loadSession: FileRouteMiddleware = (ctx, next) => {
	ctx.locals.session = readSession(ctx.request);
	return next();
};

/** Redirects a request without a session to the sign-in page. */
export const requireSession: FileRouteMiddleware = (ctx, next) => {
	const session = readSession(ctx.request);
	if (!session) {
		return ctx.response.redirect('/sign-in');
	}
	ctx.locals.session = session;
	return next();
};
