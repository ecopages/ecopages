import { createMiddleware } from '@ecopages/core';
import { auth } from './auth.server';

/** Provides the signed-in author's session as `locals.session`, or sends the visitor to `/login`. */
export const requireSession = createMiddleware(async (ctx, next) => {
	const session = await auth.api.getSession({ headers: ctx.request.headers });
	if (!session) return Response.redirect(new URL('/login', ctx.request.url), 303);
	return next({ session });
});
