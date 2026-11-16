import type { ApiHandlerContext, FileRouteMiddleware } from '@ecopages/core';
import { auth } from '@/lib/auth.server';

export type Session = (typeof auth)['$Infer']['Session'];

/**
 * Redirects a request without a session to the login page.
 *
 * @remarks
 * Provides the full session for server code and the user alone as `locals.user`. A page lists only `user` in
 * `requires`, because that list decides what the browser receives for hydration and the session holds the token.
 */
export const authMiddleware: FileRouteMiddleware = async (ctx, next) => {
	const session = await auth.api.getSession({
		headers: ctx.request.headers,
	});
	if (!session) {
		return Response.redirect(new URL('/login', ctx.request.url));
	}
	ctx.locals.session = session;
	ctx.locals.user = session.user;
	return next();
};

export const authHandler = async (ctx: ApiHandlerContext) => {
	return auth.handler(ctx.request);
};
