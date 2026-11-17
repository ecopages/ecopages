import { createMiddleware } from '@ecopages/core';

export const SESSION_COOKIE = 'session';

export type Session = { user: string };

/**
 * Reads the signed-in user from the request cookie.
 *
 * @remarks
 * A stand-in for your auth library: any non-empty cookie counts as a session. Replace the body with a real
 * check, such as validating a signed token or looking the session up in your store.
 */
export function readSession(request: Request): Session | null {
	const cookie = request.headers.get('cookie') ?? '';
	const user = cookie
		.split(';')
		.map((part) => part.trim().split('='))
		.find(([name]) => name === SESSION_COOKIE)?.[1];
	return user ? { user: decodeURIComponent(user) } : null;
}

/** Provides the session, or `null`, and always continues, so the layout decides what to show. */
export const loadSession = createMiddleware((ctx, next) => next({ session: readSession(ctx.request) }));

/** Redirects a request without a session to the sign-in page, and provides the session to the page otherwise. */
export const requireSession = createMiddleware((ctx, next) => {
	const session = readSession(ctx.request);
	if (!session) {
		return ctx.response.redirect('/sign-in');
	}
	return next({ session });
});
