import { createMiddleware, type ApiHandlerContext } from '@ecopages/core';
import { auth } from '@/lib/auth.server';

export type Session = (typeof auth)['$Infer']['Session'];

/**
 * Redirects a request without a session to the login page.
 *
 * @remarks
 * Provides the full session as `locals.session`, token included. A page's `props` returns only the user, because
 * what `props` returns reaches the browser for hydration.
 */
export const authMiddleware = createMiddleware(async (ctx, next) => {
	const session = await auth.api.getSession({
		headers: ctx.request.headers,
	});
	if (!session) {
		return Response.redirect(new URL('/login', ctx.request.url));
	}
	return next({ session });
});

export const authHandler = async (ctx: ApiHandlerContext) => {
	return auth.handler(ctx.request);
};
