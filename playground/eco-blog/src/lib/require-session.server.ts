import type { FileRouteMiddleware } from '@ecopages/core';
import { auth } from './auth.server';

/** Puts the signed-in author's session on `locals.session`, or sends the visitor to `/login`. */
export const requireSession: FileRouteMiddleware = async (ctx, next) => {
	const session = await auth.api.getSession({ headers: ctx.request.headers });
	if (!session) return Response.redirect(new URL('/login', ctx.request.url), 303);
	ctx.locals.session = session;
	return next();
};
